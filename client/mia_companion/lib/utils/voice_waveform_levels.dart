import 'dart:math' as math;

/// Converts dBFS mic levels from [record] into 0..1 bar heights.
double normalizeRecordingAmplitude(double dbfs) {
  const minDb = -55.0;
  const maxDb = -8.0;
  if (dbfs.isNaN || dbfs.isInfinite || dbfs <= minDb) {
    return 0.06;
  }
  if (dbfs >= maxDb) return 1.0;
  return ((dbfs - minDb) / (maxDb - minDb)).clamp(0.06, 1.0);
}

/// Maps a rolling sample buffer onto the visible bar count (oldest → newest).
List<double> resampleWaveformLevels(List<double> levels, int barCount) {
  if (barCount <= 0) return const [];
  if (levels.isEmpty) {
    return List<double>.filled(barCount, 0.06);
  }

  final result = List<double>.filled(barCount, 0.06);
  final take = math.min(levels.length, barCount);
  final start = levels.length - take;
  final offset = barCount - take;
  for (var i = 0; i < take; i++) {
    result[offset + i] = levels[start + i];
  }
  return result;
}
