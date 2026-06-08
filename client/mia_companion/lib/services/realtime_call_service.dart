import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math' as math;
import 'dart:typed_data' show ByteData, Uint8List;

import 'package:audio_session/audio_session.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:record/record.dart' hide IosAudioCategory;
import 'package:web_socket_channel/io.dart';

import 'debug_log.dart';

enum CallConnectionState { connecting, ready, error, ended }

/// xAI Realtime voice call — PCM 24 kHz mono over WebSocket.
///
/// This is deliberately half-duplex on mobile: while Mia is speaking, the
/// recorder is stopped. That prevents loudspeaker audio from being sent back
/// to xAI as user speech, which was causing echo loops and stalled turns.
class RealtimeCallService {
  static const Duration _wsPingInterval = Duration(seconds: 20);
  static const int _sampleRate = 24000;
  static const int _pcmBytesPerSecond = _sampleRate * 2; // mono PCM16
  /// Extra padding (ms) added to the computed audio duration so the speaker
  /// fully drains before the mic resumes. Kept generous so the mic does not
  /// reopen during short pauses in Zara's speech (which would let her audio
  /// echo back into the mic and chop her reply into pieces).
  static const int _playbackDrainPaddingMs = 1400;
  /// Used only if no audio delta ever arrives for a "response" — should not
  /// normally fire because every delta reschedules the finish timer based on
  /// actual queued audio duration.
  static const Duration _emergencyFallback = Duration(seconds: 12);

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
  bool _assistantSpeaking = false;
  bool _micRunning = false;
  bool _wantMicRunning = false;
  bool _fatalError = false;
  int _micChunkCount = 0;
  int _micCycleId = 0;
  int _assistantAudioBytes = 0;
  DateTime? _assistantStartedAt;
  Timer? _assistantFinishTimer;
  Future<void> _micQueue = Future<void>.value();
  Completer<void>? _sessionReadyCompleter;

  bool get isConnected => _connected && _sessionReady;

  Future<void> connect({
    required String wsUrl,
    required String token,
    required Map<String, dynamic> sessionConfig,
    bool sessionPreconfigured = false,
  }) async {
    _fatalError = false;
    _sessionReady = false;
    _assistantSpeaking = false;
    _assistantAudioBytes = 0;
    _assistantStartedAt = null;
    _sessionReadyCompleter = Completer<void>();
    connectionController.add(CallConnectionState.connecting);

    await _configureAudioSession();
    await _initPlayback();

    _channel = IOWebSocketChannel.connect(
      Uri.parse(wsUrl),
      headers: {'Authorization': 'Bearer $token'},
      pingInterval: _wsPingInterval,
    );
    _connected = true;

    _wsSub = _channel!.stream.listen(
      _onEvent,
      onError: (e) {
        // #region agent log
        DebugLog.send(
          location: 'realtime_call_service.dart:wsOnError',
          message: 'WebSocket onError fired',
          hypothesisId: 'H-A,H-E',
          data: {'error': e.toString()},
        );
        // #endregion
        _emitError('connection lost: $e');
      },
      onDone: () {
        // #region agent log
        DebugLog.send(
          location: 'realtime_call_service.dart:wsOnDone',
          message: 'WebSocket onDone fired',
          hypothesisId: 'H-A,H-E',
          data: {
            'wasConnected': _connected,
            'fatalError': _fatalError,
            'closeCode': _channel?.closeCode,
            'closeReason': _channel?.closeReason,
          },
        );
        // #endregion
        if (_connected && !_fatalError) {
          _emitError('call disconnected');
        }
        _connected = false;
      },
    );

    if (!sessionPreconfigured) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final session = Map<String, dynamic>.from(sessionConfig)
        ..remove('model');
      _send({'type': 'session.update', 'session': session});
    }

    await _sessionReadyCompleter!.future.timeout(
      const Duration(seconds: 12),
      onTimeout: () {
        if (!_sessionReady && !_fatalError) {
          _emitError('voice session timed out');
        }
      },
    );

    if (_fatalError || !_sessionReady) {
      throw Exception(
        _fatalError ? 'voice call failed' : 'voice session not ready',
      );
    }

    _wantMicRunning = !_muted;
    await _applyMicState();
    connectionController.add(CallConnectionState.ready);
  }

  Future<void> _initPlayback() async {
    await FlutterPcmSound.setLogLevel(LogLevel.error);
    await FlutterPcmSound.setup(
      sampleRate: _sampleRate,
      channelCount: 1,
      iosAudioCategory: IosAudioCategory.playAndRecord,
    );
    await FlutterPcmSound.setFeedThreshold(2400);
    FlutterPcmSound.setFeedCallback((_) {});
    FlutterPcmSound.start();
  }

  Future<void> _configureAudioSession() async {
    _audioSession = await AudioSession.instance;
    await _audioSession!.configure(
      AudioSessionConfiguration(
        avAudioSessionCategory: AVAudioSessionCategory.playAndRecord,
        avAudioSessionCategoryOptions: _speakerOn
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
    if (Platform.isAndroid) {
      await AndroidAudioManager().setSpeakerphoneOn(_speakerOn);
    }
  }

  Future<void> setMuted(bool muted) async {
    _muted = muted;
    _wantMicRunning =
        _connected && _sessionReady && !_muted && !_assistantSpeaking;
    _queueMicStateSync();
    if (muted && _connected) {
      _send({'type': 'input_audio_buffer.clear'});
    }
  }

  Future<void> setSpeaker(bool on) async {
    _speakerOn = on;
    await _configureAudioSession();
  }

  void _send(Map<String, dynamic> payload) {
    final ch = _channel;
    if (ch == null) {
      // #region agent log
      DebugLog.send(
        location: 'realtime_call_service.dart:_send',
        message: 'Tried to send but channel is null',
        hypothesisId: 'H-A,H-E',
        data: {'type': payload['type']},
      );
      // #endregion
      return;
    }
    try {
      ch.sink.add(jsonEncode(payload));
    } catch (e) {
      // #region agent log
      DebugLog.send(
        location: 'realtime_call_service.dart:_send',
        message: 'sink.add THREW',
        hypothesisId: 'H-A,H-E',
        data: {'type': payload['type'], 'error': e.toString()},
      );
      // #endregion
    }
  }

  void _markSessionReady() {
    if (_sessionReady) return;
    _sessionReady = true;
    _sessionReadyCompleter?.complete();
  }

  void _beginAssistantTurn() {
    if (_assistantSpeaking) return;
    _assistantSpeaking = true;
    _assistantAudioBytes = 0;
    _assistantStartedAt = DateTime.now();
    _assistantFinishTimer?.cancel();
    _wantMicRunning = false;
    _queueMicStateSync();
    _send({'type': 'input_audio_buffer.clear'});
    // Emergency fallback so the turn always ends even if something goes wrong
    // with delta accounting. Each subsequent delta will replace this timer
    // with the duration-based schedule.
    _scheduleAssistantFinish(_emergencyFallback);
    // #region agent log
    DebugLog.send(
      location: 'realtime_call_service.dart:_beginAssistantTurn',
      message: 'Assistant turn started — mic will be stopped',
      hypothesisId: 'H-B,H-C,H-F',
      data: {'micRunning': _micRunning, 'wantMicRunning': _wantMicRunning},
    );
    // #endregion
  }

  void _scheduleAssistantFinish(Duration delay) {
    _assistantFinishTimer?.cancel();
    _assistantFinishTimer = Timer(delay, _finishAssistantTurn);
  }

  void _finishAssistantTurn() {
    _assistantFinishTimer?.cancel();
    if (!_assistantSpeaking) return;
    _assistantSpeaking = false;
    _assistantAudioBytes = 0;
    _assistantStartedAt = null;
    _send({'type': 'input_audio_buffer.clear'});
    _wantMicRunning = _connected && _sessionReady && !_muted;
    _queueMicStateSync();
    transcriptController.add('…say something — i\'m listening');
    // #region agent log
    DebugLog.send(
      location: 'realtime_call_service.dart:_finishAssistantTurn',
      message: 'Assistant turn finished — mic will restart',
      hypothesisId: 'H-B,H-C',
      data: {
        'connected': _connected,
        'sessionReady': _sessionReady,
        'muted': _muted,
        'wantMicRunning': _wantMicRunning,
        'micRunning': _micRunning,
      },
    );
    // #endregion
  }

  /// Compute when the speaker buffer will be empty, then schedule the finish
  /// for that moment + a small drain pad. Called on every audio delta — the
  /// most recently scheduled timer always wins.
  void _rescheduleFinishFromPlayback() {
    if (!_assistantSpeaking) return;
    final startedAt = _assistantStartedAt;
    final elapsedMs = startedAt == null
        ? 0
        : DateTime.now().difference(startedAt).inMilliseconds;
    final audioMs = (_assistantAudioBytes / _pcmBytesPerSecond * 1000).ceil();
    final remainingMs = math.max(0, audioMs - elapsedMs);
    final drainMs = remainingMs + _playbackDrainPaddingMs;
    _scheduleAssistantFinish(Duration(milliseconds: drainMs));
    // #region agent log
    DebugLog.send(
      location: 'realtime_call_service.dart:_rescheduleFinishFromPlayback',
      message: 'Recomputed finish schedule from playback duration',
      hypothesisId: 'H-F',
      data: {
        'audioMs': audioMs,
        'elapsedMs': elapsedMs,
        'remainingMs': remainingMs,
        'drainMs': drainMs,
      },
    );
    // #endregion
  }

  void _emitError(String message) {
    // #region agent log
    DebugLog.send(
      location: 'realtime_call_service.dart:_emitError',
      message: 'Fatal error path',
      hypothesisId: 'H-G',
      data: {'msg': message},
    );
    // #endregion
    _fatalError = true;
    connectionController.add(CallConnectionState.error);
    transcriptController.add(message);
    if (_sessionReadyCompleter != null &&
        !_sessionReadyCompleter!.isCompleted) {
      _sessionReadyCompleter!.complete();
    }
  }

  void _queueMicStateSync() {
    _micQueue = _micQueue.catchError((_) {}).then((_) => _applyMicState());
  }

  Future<void> _applyMicState() async {
    while (_micRunning != _wantMicRunning) {
      if (_wantMicRunning) {
        await _startMicNow();
      } else {
        await _stopMicNow();
      }
    }
  }

  Future<void> _startMicNow() async {
    if (_micRunning) return;
    if (!await _recorder.hasPermission()) {
      throw Exception('Microphone permission denied');
    }
    Stream<Uint8List> stream;
    try {
      stream = await _recorder.startStream(
        RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: _sampleRate,
          numChannels: 1,
          echoCancel: true,
          noiseSuppress: true,
          autoGain: true,
          androidConfig: AndroidRecordConfig(
            audioSource: AndroidAudioSource.voiceCommunication,
            audioManagerMode: AudioManagerMode.modeInCommunication,
            speakerphone: _speakerOn,
          ),
        ),
      );
      // #region agent log
      DebugLog.send(
        location: 'realtime_call_service.dart:_startMicNow',
        message: 'Recorder startStream succeeded',
        hypothesisId: 'H-B',
        data: {},
      );
      // #endregion
    } catch (e) {
      // #region agent log
      DebugLog.send(
        location: 'realtime_call_service.dart:_startMicNow',
        message: 'Recorder startStream FAILED',
        hypothesisId: 'H-B',
        data: {'error': e.toString()},
      );
      // #endregion
      rethrow;
    }
    _micRunning = true;
    _micChunkCount = 0;
    final cycleId = ++_micCycleId;
    _micSub = stream.listen(
      (chunk) {
        if (!_connected || !_sessionReady || _muted || _assistantSpeaking) {
          return;
        }
        levelController.add(_rmsLevel(chunk));
        _micChunkCount++;
        // #region agent log
        if (_micChunkCount == 1 || _micChunkCount % 10 == 0) {
          DebugLog.send(
            location: 'realtime_call_service.dart:micChunk',
            message: 'Mic chunk sent to xAI',
            hypothesisId: 'H-D,H-E,H-G',
            data: {
              'cycleId': cycleId,
              'chunkNum': _micChunkCount,
              'chunkBytes': chunk.length,
              'rms': _rmsLevel(chunk),
            },
          );
        }
        // #endregion
        _send({
          'type': 'input_audio_buffer.append',
          'audio': base64Encode(chunk),
        });
      },
      onError: (e) {
        // #region agent log
        DebugLog.send(
          location: 'realtime_call_service.dart:micStreamOnError',
          message: 'Mic stream emitted error',
          hypothesisId: 'H-G',
          data: {'cycleId': cycleId, 'error': e.toString()},
        );
        // #endregion
        _emitError('mic error: $e');
      },
      onDone: () {
        // #region agent log
        DebugLog.send(
          location: 'realtime_call_service.dart:micStreamOnDone',
          message: 'Mic stream closed unexpectedly',
          hypothesisId: 'H-G',
          data: {
            'cycleId': cycleId,
            'chunksDelivered': _micChunkCount,
            'micRunning': _micRunning,
          },
        );
        // #endregion
      },
    );
  }

  Future<void> _stopMicNow() async {
    if (!_micRunning && _micSub == null) return;
    await _micSub?.cancel();
    _micSub = null;
    Object? stopError;
    try {
      await _recorder.stop();
    } catch (e) {
      stopError = e;
    }
    _micRunning = false;
    // #region agent log
    DebugLog.send(
      location: 'realtime_call_service.dart:_stopMicNow',
      message: 'Recorder stopped',
      hypothesisId: 'H-B',
      data: {'stopError': stopError?.toString()},
    );
    // #endregion
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
    // #region agent log
    if (type != 'response.output_audio.delta' &&
        type != 'response.audio.delta' &&
        type != 'response.output_audio_transcript.delta') {
      DebugLog.send(
        location: 'realtime_call_service.dart:_onEvent',
        message: 'WS event received',
        hypothesisId: 'H-A,H-C,H-D',
        data: {'type': type ?? 'unknown'},
      );
    }
    // #endregion

    switch (type) {
      case 'session.created':
      case 'session.updated':
      case 'conversation.created':
        _markSessionReady();
        break;

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        final b64 = event['delta'] as String?;
        if (b64 != null && b64.isNotEmpty) {
          _beginAssistantTurn();
          // Decode synchronously so we can update the audio-duration counter
          // BEFORE scheduling the finish timer. Feeding the speaker is async.
          final pcm = base64Decode(b64);
          _assistantAudioBytes += pcm.length;
          unawaited(_feedPcm(pcm));
          _rescheduleFinishFromPlayback();
        }
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
        transcriptController.add('…i heard you');
        break;
      case 'input_audio_buffer.speech_stopped':
        transcriptController.add('…one sec, zara is thinking');
        break;

      case 'response.done':
      case 'response.output_audio.done':
        // If server actually sends these, recompute one last time so any
        // tail audio still in the speaker queue plays out fully.
        _rescheduleFinishFromPlayback();
        break;

      case 'response.cancelled':
        _finishAssistantTurn();
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

  Future<void> _feedPcm(Uint8List pcm) async {
    try {
      if (pcm.isEmpty) return;
      await FlutterPcmSound.feed(
        PcmArrayInt16(bytes: ByteData.sublistView(pcm)),
      );
    } catch (_) {
      // Ignore individual chunk feed failures.
    }
  }

  Future<void> hangUp() async {
    _connected = false;
    _sessionReady = false;
    _assistantSpeaking = false;
    _assistantFinishTimer?.cancel();
    _wantMicRunning = false;
    await _applyMicState();
    await _wsSub?.cancel();
    _wsSub = null;
    await _channel?.sink.close();
    _channel = null;
    try {
      await FlutterPcmSound.release();
    } catch (_) {}
    try {
      await _audioSession?.setActive(false);
    } catch (_) {}
    connectionController.add(CallConnectionState.ended);
  }

  void dispose() {
    transcriptController.close();
    levelController.close();
    connectionController.close();
  }
}
