import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';
import '../utils/voice_waveform_levels.dart';

/// Voice recording UI — locked (tap) or hold (slide to cancel).
class VoiceRecordingBar extends StatelessWidget {
  const VoiceRecordingBar({
    super.key,
    required this.duration,
    required this.levels,
    required this.locked,
    required this.slideCancelActive,
    required this.slideOffset,
    this.onCancelTap,
  });

  final Duration duration;
  final List<double> levels;
  final bool locked;
  final bool slideCancelActive;
  final double slideOffset;
  final VoidCallback? onCancelTap;

  String get _timerLabel {
    final s = duration.inSeconds;
    final m = s ~/ 60;
    final r = s % 60;
    return '$m:${r.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    if (locked) {
      return _LockedRecordingBar(
        durationLabel: _timerLabel,
        levels: levels,
        onCancelTap: onCancelTap,
      );
    }

    return _HoldRecordingBar(
      durationLabel: _timerLabel,
      levels: levels,
      slideCancelActive: slideCancelActive,
      slideOffset: slideOffset,
    );
  }
}

/// Tap-to-lock: trash, waveform, timer.
class _LockedRecordingBar extends StatelessWidget {
  const _LockedRecordingBar({
    required this.durationLabel,
    required this.levels,
    required this.onCancelTap,
  });

  final String durationLabel;
  final List<double> levels;
  final VoidCallback? onCancelTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.only(left: 4, right: 10),
      child: Row(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onCancelTap,
              borderRadius: BorderRadius.circular(22),
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Icon(
                  Icons.delete_outline,
                  color: MiaColors.accentDeep,
                  size: 24,
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: _LiveWaveform(levels: levels),
            ),
          ),
          const _RecordingDot(),
          const SizedBox(width: 8),
          SizedBox(
            width: 46,
            child: Text(
              durationLabel,
              textAlign: TextAlign.right,
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: MiaColors.textPrimary,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Push-to-talk: slide-to-cancel, waveform, timer.
class _HoldRecordingBar extends StatelessWidget {
  const _HoldRecordingBar({
    required this.durationLabel,
    required this.levels,
    required this.slideCancelActive,
    required this.slideOffset,
  });

  final String durationLabel;
  final List<double> levels;
  final bool slideCancelActive;
  final double slideOffset;

  @override
  Widget build(BuildContext context) {
    final slideShift = (slideOffset.clamp(-120.0, 0.0)) * 0.35;

    return Container(
      height: 52,
      padding: const EdgeInsets.fromLTRB(6, 0, 10, 0),
      child: Row(
        children: [
          Flexible(
            flex: 5,
            child: Transform.translate(
              offset: Offset(slideShift, 0),
              child: _SlideToCancelHint(
                active: slideCancelActive,
                progress: (slideOffset.abs() / 96).clamp(0.0, 1.0),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 4,
            child: _LiveWaveform(compact: true, levels: levels),
          ),
          const SizedBox(width: 8),
          const _RecordingDot(),
          const SizedBox(width: 8),
          SizedBox(
            width: 46,
            child: Text(
              durationLabel,
              textAlign: TextAlign.right,
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: MiaColors.textPrimary,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SlideToCancelHint extends StatelessWidget {
  const _SlideToCancelHint({
    required this.active,
    required this.progress,
  });

  final bool active;
  final double progress;

  @override
  Widget build(BuildContext context) {
    const label = 'slide to cancel';
    final fg = active ? Colors.red.shade700 : MiaColors.accentDeep;
    final bg = active
        ? Colors.red.shade50
        : MiaColors.accentDeep.withValues(alpha: 0.1 + progress * 0.08);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: active
              ? Colors.red.shade300
              : MiaColors.accentDeep.withValues(alpha: 0.25 + progress * 0.2),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            active ? Icons.delete_outline_rounded : Icons.keyboard_double_arrow_left_rounded,
            color: fg,
            size: 22,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: fg,
                letterSpacing: 0.1,
              ),
              maxLines: 1,
              overflow: TextOverflow.visible,
              softWrap: false,
            ),
          ),
        ],
      ),
    );
  }
}

class _RecordingDot extends StatefulWidget {
  const _RecordingDot();

  @override
  State<_RecordingDot> createState() => _RecordingDotState();
}

class _RecordingDotState extends State<_RecordingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.45, end: 1.0).animate(
        CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
      ),
      child: Container(
        width: 10,
        height: 10,
        decoration: const BoxDecoration(
          color: MiaColors.accentDeep,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class _LiveWaveform extends StatelessWidget {
  const _LiveWaveform({
    this.compact = false,
    this.levels = const [],
  });

  final bool compact;
  final List<double> levels;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        if (width <= 0) return const SizedBox.shrink();

        const barWidth = 3.0;
        const barGap = 2.5;
        final minBars = compact ? 10 : 16;
        final barCount = math.max(
          minBars,
          ((width + barGap) / (barWidth + barGap)).floor(),
        );
        final maxHeight = compact ? 20.0 : 24.0;
        final minHeight = compact ? 5.0 : 6.0;
        final amplitude = compact ? 10.0 : 14.0;
        final normalizedLevels = resampleWaveformLevels(levels, barCount);

        return SizedBox(
          height: maxHeight,
          width: width,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(barCount, (i) {
              final level = normalizedLevels[i];
              final h = minHeight + level * amplitude;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                curve: Curves.easeOut,
                width: barWidth,
                height: h,
                decoration: BoxDecoration(
                  color: MiaColors.accentDeep.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(2),
                ),
              );
            }),
          ),
        );
      },
    );
  }
}
