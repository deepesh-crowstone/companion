import { Audio } from 'expo-av';

const SAMPLE_RATE = 24000;

function pcmToWavBase64(pcm: Uint8Array): string {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, fileSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);

  let binary = '';
  for (let i = 0; i < wav.length; i++) binary += String.fromCharCode(wav[i]);
  return btoa(binary);
}

/** Queues PCM16 mono chunks and plays them sequentially via expo-av. */
export class PcmPlayer {
  private queue: Promise<void> = Promise.resolve();
  private sounds: Audio.Sound[] = [];
  private released = false;

  async setup(): Promise<void> {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }

  feed(pcm: Uint8Array): void {
    if (this.released || pcm.length === 0) return;
    this.queue = this.queue.then(() => this.playChunk(pcm));
  }

  private async playChunk(pcm: Uint8Array): Promise<void> {
    if (this.released) return;
    const uri = `data:audio/wav;base64,${pcmToWavBase64(pcm)}`;
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    this.sounds.push(sound);
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) resolve();
      });
    });
    await sound.unloadAsync();
    this.sounds = this.sounds.filter((s) => s !== sound);
  }

  async release(): Promise<void> {
    this.released = true;
    await this.queue.catch(() => {});
    await Promise.all(this.sounds.map((s) => s.unloadAsync().catch(() => {})));
    this.sounds = [];
  }
}

export const PCM_SAMPLE_RATE = SAMPLE_RATE;
export const PCM_BYTES_PER_SECOND = SAMPLE_RATE * 2;
