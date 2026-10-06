import 'package:just_audio/just_audio.dart';

/// Short UI sounds for sent messages and incoming bubbles.
class ChatSounds {
  ChatSounds._();

  static final ChatSounds instance = ChatSounds._();

  static const _sentAsset = 'assets/sounds/send_muted_pop.wav';
  static const _receivedAsset = 'assets/sounds/send_quiet_bell.wav';

  /// 20% above the previous playback levels.
  static const _sentVolume = 0.4 * 1.2;
  static const _receivedVolume = 0.42 * 1.2;

  final AudioPlayer _sent = AudioPlayer();
  final AudioPlayer _received = AudioPlayer();

  Future<void>? _sentReady;
  Future<void>? _receivedReady;

  Future<void> playSent() => _replay(
        _sent,
        () => _sentReady ??= _load(_sent, _sentAsset, _sentVolume),
      );

  Future<void> playReceived() => _replay(
        _received,
        () => _receivedReady ??=
            _load(_received, _receivedAsset, _receivedVolume),
      );

  Future<void> _load(AudioPlayer player, String asset, double volume) async {
    await player.setAsset(asset);
    await player.setVolume(volume);
  }

  Future<void> _replay(
    AudioPlayer player,
    Future<void> Function() ready,
  ) async {
    try {
      await ready();
      await player.seek(Duration.zero);
      await player.play();
    } catch (_) {}
  }
}
