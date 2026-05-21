import LiveAudioStream from 'react-native-live-audio-stream';
import { PCM_BYTES_PER_SECOND, PCM_SAMPLE_RATE, PcmPlayer } from './pcmPlayer';

export type CallConnectionState = 'connecting' | 'ready' | 'error' | 'ended';

type Listener<T> = (value: T) => void;

const WS_PING_MS = 20_000;
const PLAYBACK_DRAIN_PADDING_MS = 900;
const EMERGENCY_FALLBACK_MS = 12_000;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function rmsLevel(bytes: Uint8Array): number {
  if (bytes.length < 2) return 8;
  let sum = 0;
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const sample = bytes[i] | (bytes[i + 1] << 8);
    const signed = sample > 32767 ? sample - 65536 : sample;
    sum += signed * signed;
  }
  const rms = Math.sqrt(sum / (bytes.length / 2));
  return Math.min(56, Math.max(6, Math.round(rms)));
}

/** xAI Realtime voice call — PCM 24 kHz mono over WebSocket. Half-duplex on mobile. */
export class RealtimeCallService {
  private ws: WebSocket | null = null;
  private player = new PcmPlayer();

  private connected = false;
  private sessionReady = false;
  private muted = false;
  private speakerOn = false;
  private assistantSpeaking = false;
  private micRunning = false;
  private wantMicRunning = false;
  private fatalError = false;
  private assistantAudioBytes = 0;
  private assistantStartedAt: number | null = null;
  private assistantFinishTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionReadyResolve: (() => void) | null = null;
  private sessionReadyPromise: Promise<void> | null = null;
  private micDataHandler: ((data: string) => void) | null = null;

  private transcriptListeners = new Set<Listener<string>>();
  private levelListeners = new Set<Listener<number>>();
  private connectionListeners = new Set<Listener<CallConnectionState>>();

  onTranscript(listener: Listener<string>): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  onLevel(listener: Listener<number>): () => void {
    this.levelListeners.add(listener);
    return () => this.levelListeners.delete(listener);
  }

  onConnection(listener: Listener<CallConnectionState>): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private emitTranscript(t: string): void {
    this.transcriptListeners.forEach((l) => l(t));
  }

  private emitLevel(n: number): void {
    this.levelListeners.forEach((l) => l(n));
  }

  private emitConnection(s: CallConnectionState): void {
    this.connectionListeners.forEach((l) => l(s));
  }

  get isConnected(): boolean {
    return this.connected && this.sessionReady;
  }

  async connect(options: {
    wsUrl: string;
    token: string;
    sessionConfig: Record<string, unknown>;
    sessionPreconfigured?: boolean;
  }): Promise<void> {
    this.fatalError = false;
    this.sessionReady = false;
    this.assistantSpeaking = false;
    this.assistantAudioBytes = 0;
    this.assistantStartedAt = null;
    this.sessionReadyPromise = new Promise((resolve) => {
      this.sessionReadyResolve = resolve;
    });
    this.emitConnection('connecting');

    await this.player.setup();

type HeaderWebSocket = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => WebSocket;

    const WS = WebSocket as HeaderWebSocket;
    this.ws = new WS(options.wsUrl, undefined, {
      headers: { Authorization: `Bearer ${options.token}` },
    });

    this.connected = true;

    this.ws.onmessage = (ev) => this.onEvent(ev.data);
    this.ws.onerror = () => this.emitError('connection lost');
    this.ws.onclose = () => {
      if (this.connected && !this.fatalError) this.emitError('call disconnected');
      this.connected = false;
    };

    if (!options.sessionPreconfigured) {
      await new Promise((r) => setTimeout(r, 300));
      const session = { ...options.sessionConfig };
      delete session.model;
      this.send({ type: 'session.update', session });
    }

    await Promise.race([
      this.sessionReadyPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          if (!this.sessionReady && !this.fatalError) this.emitError('voice session timed out');
          reject(new Error('timeout'));
        }, 12_000),
      ),
    ]).catch(() => {});

    if (this.fatalError || !this.sessionReady) {
      throw new Error(this.fatalError ? 'voice call failed' : 'voice session not ready');
    }

    this.wantMicRunning = !this.muted;
    await this.applyMicState();
    this.emitConnection('ready');
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    this.wantMicRunning = this.connected && this.sessionReady && !this.muted && !this.assistantSpeaking;
    await this.applyMicState();
    if (muted && this.connected) this.send({ type: 'input_audio_buffer.clear' });
  }

  async setSpeaker(on: boolean): Promise<void> {
    this.speakerOn = on;
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private markSessionReady(): void {
    if (this.sessionReady) return;
    this.sessionReady = true;
    this.sessionReadyResolve?.();
  }

  private beginAssistantTurn(): void {
    if (this.assistantSpeaking) return;
    this.assistantSpeaking = true;
    this.assistantAudioBytes = 0;
    this.assistantStartedAt = Date.now();
    if (this.assistantFinishTimer) clearTimeout(this.assistantFinishTimer);
    this.wantMicRunning = false;
    void this.applyMicState();
    this.send({ type: 'input_audio_buffer.clear' });
    this.scheduleAssistantFinish(EMERGENCY_FALLBACK_MS);
  }

  private scheduleAssistantFinish(delayMs: number): void {
    if (this.assistantFinishTimer) clearTimeout(this.assistantFinishTimer);
    this.assistantFinishTimer = setTimeout(() => this.finishAssistantTurn(), delayMs);
  }

  private finishAssistantTurn(): void {
    if (this.assistantFinishTimer) clearTimeout(this.assistantFinishTimer);
    if (!this.assistantSpeaking) return;
    this.assistantSpeaking = false;
    this.assistantAudioBytes = 0;
    this.assistantStartedAt = null;
    this.send({ type: 'input_audio_buffer.clear' });
    this.wantMicRunning = this.connected && this.sessionReady && !this.muted;
    void this.applyMicState();
    this.emitTranscript('…say something — i\'m listening');
  }

  private rescheduleFinishFromPlayback(): void {
    if (!this.assistantSpeaking) return;
    const startedAt = this.assistantStartedAt ?? Date.now();
    const elapsedMs = Date.now() - startedAt;
    const audioMs = Math.ceil((this.assistantAudioBytes / PCM_BYTES_PER_SECOND) * 1000);
    const remainingMs = Math.max(0, audioMs - elapsedMs);
    this.scheduleAssistantFinish(remainingMs + PLAYBACK_DRAIN_PADDING_MS);
  }

  private emitError(message: string): void {
    this.fatalError = true;
    this.emitConnection('error');
    this.emitTranscript(message);
    this.sessionReadyResolve?.();
  }

  private async applyMicState(): Promise<void> {
    while (this.micRunning !== this.wantMicRunning) {
      if (this.wantMicRunning) await this.startMicNow();
      else await this.stopMicNow();
    }
  }

  private async startMicNow(): Promise<void> {
    if (this.micRunning) return;

    LiveAudioStream.init({
      sampleRate: PCM_SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      bufferSize: 4096,
      wavFile: '',
    });

    this.micDataHandler = (data: string) => {
      if (!this.connected || !this.sessionReady || this.muted || this.assistantSpeaking) return;
      const chunk = base64ToBytes(data);
      this.emitLevel(rmsLevel(chunk));
      this.send({ type: 'input_audio_buffer.append', audio: data });
    };

    LiveAudioStream.on('data', this.micDataHandler);
    LiveAudioStream.start();
    this.micRunning = true;
  }

  private async stopMicNow(): Promise<void> {
    if (!this.micRunning && !this.micDataHandler) return;
    try {
      LiveAudioStream.stop();
    } catch {
      /* ignore */
    }
    this.micDataHandler = null;
    this.micRunning = false;
  }

  private onEvent(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = event.type as string | undefined;

    switch (type) {
      case 'session.created':
      case 'session.updated':
      case 'conversation.created':
        this.markSessionReady();
        break;

      case 'response.output_audio.delta':
      case 'response.audio.delta': {
        const b64 = event.delta as string | undefined;
        if (b64) {
          this.beginAssistantTurn();
          const pcm = base64ToBytes(b64);
          this.assistantAudioBytes += pcm.length;
          this.player.feed(pcm);
          this.rescheduleFinishFromPlayback();
        }
        break;
      }

      case 'response.output_audio_transcript.delta': {
        const delta = (event.delta as string) ?? '';
        if (delta) this.emitTranscript(delta);
        break;
      }
      case 'response.output_audio_transcript.done': {
        const done = (event.transcript as string) ?? '';
        if (done) this.emitTranscript(done);
        break;
      }

      case 'input_audio_buffer.speech_started':
        this.emitLevel(40);
        this.emitTranscript('…i heard you');
        break;
      case 'input_audio_buffer.speech_stopped':
        this.emitTranscript('…one sec, mia is thinking');
        break;

      case 'response.done':
      case 'response.output_audio.done':
        this.rescheduleFinishFromPlayback();
        break;

      case 'response.cancelled':
        this.finishAssistantTurn();
        break;

      case 'error': {
        const err = event.error;
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: string }).message ?? err)
            : String(event);
        this.emitError(msg);
        break;
      }
    }
  }

  async hangUp(): Promise<void> {
    this.connected = false;
    this.sessionReady = false;
    this.assistantSpeaking = false;
    if (this.assistantFinishTimer) clearTimeout(this.assistantFinishTimer);
    this.wantMicRunning = false;
    await this.applyMicState();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    await this.player.release();
    this.emitConnection('ended');
  }
}
