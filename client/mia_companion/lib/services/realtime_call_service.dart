import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data' show ByteData, Uint8List;

import 'package:audio_session/audio_session.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart';
import 'package:web_socket_channel/io.dart';

enum CallConnectionState { connecting, ready, error, ended }

/// xAI Realtime voice call — PCM 24kHz mono over WebSocket.
class RealtimeCallService {
  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _wsSub;
  StreamSubscription<Uint8List>? _micSub;
  final AudioRecorder _recorder = AudioRecorder();
  AudioSession? _audioSession;

  final StreamController<String> transcriptController =
      StreamController.broadcast();
  final StreamController<int> levelController = StreamController.broadcast();
  final StreamController<CallConnectionState> connectionController =
      StreamController.broadcast();

  bool _connected = false;
  bool _sessionReady = false;
  bool _muted = false;
  bool _speakerOn = false;
  bool _miaSpeaking = false;
  bool _playbackStarted = false;
  bool _fatalError = false;
  Timer? _resumeMicTimer;
  Completer<void>? _sessionReadyCompleter;

  bool get isConnected => _connected && _sessionReady;

  bool get _shouldStreamMic =>
      _connected && _sessionReady && !_muted && !_miaSpeaking;

  Future<void> connect({
    required String wsUrl,
    required String token,
    required Map<String, dynamic> sessionConfig,
    bool sessionPreconfigured = false,
  }) async {
    _fatalError = false;
    _sessionReady = false;
    _sessionReadyCompleter = Completer<void>();
    connectionController.add(CallConnectionState.connecting);

    await _configureVoiceAudio(speakerOn: _speakerOn);
    await _initPlayback();

    final uri = Uri.parse(wsUrl);
    _channel = IOWebSocketChannel.connect(
      uri,
      headers: {'Authorization': 'Bearer $token'},
    );
    _connected = true;

    _wsSub = _channel!.stream.listen(
      _onEvent,
      onError: (e) {
        _emitError('connection lost: $e');
      },
      onDone: () {
        if (_connected && !_fatalError) {
          _emitError('call disconnected');
        }
        _connected = false;
      },
    );

    if (!sessionPreconfigured) {
      await Future<void>.delayed(const Duration(milliseconds: 350));
      _send({
        'type': 'session.update',
        'session': _sessionPayload(sessionConfig),
      });
    }

    await _sessionReadyCompleter!.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () {
        if (!_sessionReady && !_fatalError) {
          _emitError('timed out waiting for voice session');
        }
      },
    );

    if (_fatalError || !_sessionReady) {
      throw Exception(
        _fatalError ? 'voice call failed' : 'voice session not ready',
      );
    }

    await _startMic();
    connectionController.add(CallConnectionState.ready);
  }

  Map<String, dynamic> _sessionPayload(Map<String, dynamic> sessionConfig) {
    final copy = Map<String, dynamic>.from(sessionConfig);
    copy.remove('model');
    return copy;
  }

  Future<void> _initPlayback() async {
    await FlutterPcmSound.setLogLevel(LogLevel.error);
    await FlutterPcmSound.setup(sampleRate: 24000, channelCount: 1);
    await FlutterPcmSound.setFeedThreshold(2400);
    FlutterPcmSound.setFeedCallback((_) {});
    _playbackStarted = FlutterPcmSound.start();
    if (!_playbackStarted) {
      await FlutterPcmSound.feed(PcmArrayInt16.zeros(count: 240));
    }
  }

  Future<void> _configureVoiceAudio({required bool speakerOn}) async {
    _audioSession = await AudioSession.instance;
    await _audioSession!.configure(
      AudioSessionConfiguration(
        avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
        avAudioSessionCategoryOptions: speakerOn
            ? AVAudioSessionCategoryOptions.defaultToSpeaker |
                AVAudioSessionCategoryOptions.allowBluetooth
            : AVAudioSessionCategoryOptions.allowBluetooth,
        avAudioSessionMode: AVAudioSessionMode.voiceChat,
        androidAudioAttributes: const AndroidAudioAttributes(
          contentType: AndroidAudioContentType.speech,
          usage: AndroidAudioUsage.voiceCommunication,
        ),
        androidAudioFocusGainType: AndroidAudioFocusGainType.gain,
        androidWillPauseWhenDucked: false,
      ),
    );
    await _audioSession!.setActive(true);
  }

  Future<void> setMuted(bool muted) async {
    _muted = muted;
    if (muted && _connected) {
      _send({'type': 'input_audio_buffer.clear'});
    }
  }

  Future<void> setSpeaker(bool speakerOn) async {
    _speakerOn = speakerOn;
    await _configureVoiceAudio(speakerOn: speakerOn);
  }

  void _send(Map<String, dynamic> payload) {
    if (_channel == null) return;
    _channel!.sink.add(jsonEncode(payload));
  }

  void _markSessionReady() {
    if (_sessionReady) return;
    _sessionReady = true;
    final completer = _sessionReadyCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
  }

  void _setMiaSpeaking(bool speaking) {
    if (_miaSpeaking == speaking) return;
    _miaSpeaking = speaking;
    if (speaking && _connected) {
      _send({'type': 'input_audio_buffer.clear'});
    }
  }

  void _scheduleResumeMic() {
    _resumeMicTimer?.cancel();
    _resumeMicTimer = Timer(const Duration(milliseconds: 500), () {
      _setMiaSpeaking(false);
    });
  }

  void _emitError(String message) {
    _fatalError = true;
    connectionController.add(CallConnectionState.error);
    transcriptController.add(message);
    final completer = _sessionReadyCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.complete();
    }
  }

  Future<void> _startMic() async {
    if (!await _recorder.hasPermission()) {
      throw Exception('Microphone permission denied');
    }

    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 24000,
        numChannels: 1,
        echoCancel: true,
        noiseSuppress: true,
        autoGain: true,
      ),
    );

    _micSub = stream.listen(
      (chunk) {
        if (!_shouldStreamMic) {
          if (!_muted) levelController.add(8);
          return;
        }
        levelController.add(_rmsLevel(chunk));
        _send({
          'type': 'input_audio_buffer.append',
          'audio': base64Encode(chunk),
        });
      },
      onError: (e) => _emitError('mic error: $e'),
    );
  }

  int _rmsLevel(Uint8List bytes) {
    if (bytes.length < 2) return 8;
    var sum = 0.0;
    for (var i = 0; i < bytes.length - 1; i += 2) {
      final sample = bytes[i] | (bytes[i + 1] << 8);
      final signed = sample > 32767 ? sample - 65536 : sample;
      sum += signed * signed;
    }
    final rms = math.sqrt(sum / (bytes.length / 2));
    return rms.clamp(6, 56).toInt();
  }

  void _onEvent(dynamic raw) {
    if (raw is! String) return;
    Map<String, dynamic> event;
    try {
      event = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }

    final type = event['type'] as String?;

    switch (type) {
      case 'session.created':
      case 'session.updated':
      case 'conversation.created':
        _markSessionReady();
        break;
      case 'response.output_audio.delta':
        _setMiaSpeaking(true);
        final b64 = event['delta'] as String?;
        if (b64 != null && b64.isNotEmpty) {
          unawaited(_playPcmDelta(b64));
        }
        break;
      case 'response.output_audio.done':
      case 'response.done':
        _scheduleResumeMic();
        break;
      case 'response.output_audio_transcript.delta':
        final delta = event['delta'] as String? ?? '';
        if (delta.isNotEmpty) transcriptController.add(delta);
        break;
      case 'response.output_audio_transcript.done':
        final done = event['transcript'] as String? ?? '';
        if (done.isNotEmpty) transcriptController.add(done);
        break;
      case 'input_audio_buffer.speech_started':
        levelController.add(40);
        break;
      case 'input_audio_buffer.speech_stopped':
        break;
      case 'error':
        final err = event['error'];
        final msg = err is Map
            ? (err['message'] as String? ?? err.toString())
            : event.toString();
        _emitError(msg);
        break;
    }
  }

  Future<void> _playPcmDelta(String b64) async {
    try {
      final pcm = base64Decode(b64);
      if (pcm.isEmpty) return;
      await FlutterPcmSound.feed(
        PcmArrayInt16(bytes: ByteData.sublistView(pcm)),
      );
    } catch (e) {
      _emitError('playback error: $e');
    }
  }

  Future<void> hangUp() async {
    _connected = false;
    _sessionReady = false;
    _resumeMicTimer?.cancel();
    await _micSub?.cancel();
    _micSub = null;
    try {
      await _recorder.stop();
    } catch (_) {}
    await _wsSub?.cancel();
    _wsSub = null;
    await _channel?.sink.close();
    _channel = null;
    await FlutterPcmSound.release();
    await _audioSession?.setActive(false);
    connectionController.add(CallConnectionState.ended);
  }

  void dispose() {
    transcriptController.close();
    levelController.close();
    connectionController.close();
  }
}
