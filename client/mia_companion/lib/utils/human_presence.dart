import 'dart:math';

/// Realistic delays for Mia's chat presence indicators (typing / recording).
class HumanPresence {
  HumanPresence._();

  static final _random = Random();

  /// How long Mia should appear to type before showing a text reply.
  /// Tuned for slower, more human-feeling mobile chat (~12–14 chars/sec).
  static Duration typingDuration(String text) {
    final chars = text.trim().length;
    if (chars == 0) return const Duration(milliseconds: 2400);

    const baseMs = 1100;
    const msPerChar = 72;
    const minMs = 2200;
    const maxMs = 32000;

    return _duration(
      baseMs: baseMs,
      msPerChar: msPerChar,
      units: chars,
      minMs: minMs,
      maxMs: maxMs,
    );
  }

  /// How long Mia should appear to record before sending a voice reply.
  /// Slower than typing — matches speaking a message aloud.
  static Duration recordingDuration(String spokenText) {
    final chars = spokenText.trim().length;
    if (chars == 0) return const Duration(milliseconds: 1800);

    const baseMs = 900;
    const msPerChar = 58;
    const minMs = 1600;
    const maxMs = 22000;

    return _duration(
      baseMs: baseMs,
      msPerChar: msPerChar,
      units: chars,
      minMs: minMs,
      maxMs: maxMs,
    );
  }

  /// Wait only the time still needed after [elapsed] (e.g. API fetch time).
  static Future<void> waitRemaining(
    Duration target,
    Stopwatch elapsed,
  ) async {
    final remaining = target - elapsed.elapsed;
    if (remaining > Duration.zero) {
      await Future.delayed(remaining);
    }
  }

  static Duration _duration({
    required int baseMs,
    required int msPerChar,
    required int units,
    required int minMs,
    required int maxMs,
  }) {
    final jitter = 0.9 + _random.nextDouble() * 0.2;
    final ms = ((baseMs + units * msPerChar) * jitter).round();
    return Duration(milliseconds: ms.clamp(minMs, maxMs));
  }
}
