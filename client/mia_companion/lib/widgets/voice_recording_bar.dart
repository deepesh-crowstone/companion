import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';

/// Voice recording UI — locked (tap) or hold (slide to cancel).
class VoiceRecordingBar extends StatelessWidget {
  const VoiceRecordingBar({
    super.key,
    required this.duration,
    required this.locked,
    required this.slideCancelActive,
    required this.slideOffset,
    this.onCancelTap,
  });

  final Duration duration;
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
        onCancelTap: onCancelTap,
      );
    }

    return _HoldRecordingBar(
      durationLabel: _timerLabel,
      slideCancelActive: slideCancelActive,
      slideOffset: slideOffset,
    );
  }
}

/// Tap-to-lock: trash, timer, waveform.
class _LockedRecordingBar extends StatelessWidget {
  const _LockedRecordingBar({
    required this.durationLabel,
    required this.onCancelTap,
  });

  final String durationLabel;
  final VoidCallback? onCancelTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 6),
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
          const _RecordingDot(),
          const SizedBox(width: 8),
          Text(
            durationLabel,
            style: GoogleFonts.inter(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: MiaColors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const Spacer(),
          const _LiveWaveform(),
        ],
      ),
    );
  }
}

/// Push-to-talk: prominent slide-to-cancel, timer on the right.
class _HoldRecordingBar extends StatelessWidget {
  const _HoldRecordingBar({
    required this.durationLabel,
    required this.slideCancelActive,
    required this.slideOffset,
  });

  final String durationLabel;
  final bool slideCancelActive;
  final double slideOffset;

  @override
  Widget build(BuildContext context) {
    final slideShift = (slideOffset.clamp(-120.0, 0.0)) * 0.35;

    return Container(
      height: 52,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          Expanded(
            child: Transform.translate(
              offset: Offset(slideShift, 0),
              child: _SlideToCancelHint(
                active: slideCancelActive,
                progress: (slideOffset.abs() / 96).clamp(0.0, 1.0),
              ),
            ),
          ),
          const SizedBox(width: 8),
          const _RecordingDot(),
          const SizedBox(width: 8),
          Text(
            durationLabel,
            style: GoogleFonts.inter(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: MiaColors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: 10),
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

class _LiveWaveform extends StatefulWidget {
  const _LiveWaveform();

  @override
  State<_LiveWaveform> createState() => _LiveWaveformState();
}

class _LiveWaveformState extends State<_LiveWaveform>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat();
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) {
        return SizedBox(
          width: 36,
          height: 22,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(5, (i) {
              final phase = (_anim.value * 2 * math.pi) + (i * 0.9);
              final h = 6 + math.sin(phase).abs() * 12;
              return Container(
                width: 3,
                height: h,
                margin: const EdgeInsets.only(left: 2),
                decoration: BoxDecoration(
                  color: MiaColors.accentDeep.withValues(alpha: 0.75),
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
