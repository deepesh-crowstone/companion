import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/mia_theme.dart';

/// Mic: tap to lock-record, long-press for push-to-talk (slide left to cancel).
class VoiceNoteMicButton extends StatefulWidget {
  const VoiceNoteMicButton({
    super.key,
    required this.enabled,
    required this.holdActive,
    required this.onTapStartAndLock,
    required this.onHoldStart,
    required this.onHoldSend,
    required this.onHoldCancel,
    required this.onSlideUpdate,
  });

  final bool enabled;
  final bool holdActive;
  final Future<void> Function() onTapStartAndLock;
  final Future<void> Function() onHoldStart;
  final VoidCallback onHoldSend;
  final VoidCallback onHoldCancel;
  final void Function(double offset, bool cancelActive) onSlideUpdate;

  @override
  State<VoiceNoteMicButton> createState() => _VoiceNoteMicButtonState();
}

class _VoiceNoteMicButtonState extends State<VoiceNoteMicButton> {
  static const _cancelSlideThreshold = 96.0;

  bool _longPressActive = false;
  bool _slideCancelled = false;
  bool _busy = false;

  Future<void> _handleTap() async {
    if (!widget.enabled || _busy || widget.holdActive) return;
    _busy = true;
    HapticFeedback.mediumImpact();
    try {
      await widget.onTapStartAndLock();
    } finally {
      if (mounted) _busy = false;
    }
  }

  Future<void> _handleLongPressStart() async {
    if (!widget.enabled || _busy || widget.holdActive) return;
    _busy = true;
    _longPressActive = true;
    _slideCancelled = false;
    widget.onSlideUpdate(0, false);
    HapticFeedback.mediumImpact();
    try {
      await widget.onHoldStart();
    } finally {
      _busy = false;
    }
    if (!mounted) return;
    if (_longPressActive && !widget.holdActive) {
      _longPressActive = false;
    }
  }

  void _handleLongPressMoveUpdate(LongPressMoveUpdateDetails details) {
    if (!_longPressActive || _slideCancelled || !widget.holdActive) return;

    final deltaX = details.offsetFromOrigin.dx;
    if (deltaX < -_cancelSlideThreshold) {
      _slideCancelled = true;
      _longPressActive = false;
      HapticFeedback.mediumImpact();
      widget.onSlideUpdate(deltaX, true);
      widget.onHoldCancel();
    } else {
      widget.onSlideUpdate(deltaX, false);
    }
  }

  void _handleLongPressEnd() {
    if (_slideCancelled) {
      _slideCancelled = false;
      _longPressActive = false;
      widget.onSlideUpdate(0, false);
      return;
    }

    if (!_longPressActive || !widget.holdActive) return;
    _longPressActive = false;
    widget.onSlideUpdate(0, false);
    widget.onHoldSend();
  }

  void _handleLongPressCancel() {
    if (_slideCancelled) {
      _slideCancelled = false;
      widget.onSlideUpdate(0, false);
      return;
    }
    if (_longPressActive && widget.holdActive) {
      widget.onHoldCancel();
    }
    _longPressActive = false;
    widget.onSlideUpdate(0, false);
  }

  @override
  Widget build(BuildContext context) {
    final bg = widget.holdActive
        ? MiaColors.accentDeep
        : MiaColors.miaBubble;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.enabled && !widget.holdActive ? _handleTap : null,
      onLongPressStart:
          widget.enabled && !widget.holdActive ? (_) => _handleLongPressStart() : null,
      onLongPressEnd: widget.enabled ? (_) => _handleLongPressEnd() : null,
      onLongPressMoveUpdate:
          widget.enabled ? _handleLongPressMoveUpdate : null,
      onLongPressCancel: widget.enabled ? _handleLongPressCancel : null,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: bg,
          shape: BoxShape.circle,
          boxShadow: widget.holdActive
              ? [
                  BoxShadow(
                    color: MiaColors.accentDeep.withValues(alpha: 0.35),
                    blurRadius: 12,
                    spreadRadius: 1,
                  ),
                ]
              : null,
        ),
        child: Icon(
          Icons.mic,
          color: widget.holdActive ? Colors.white : MiaColors.accentDeep,
          size: 22,
        ),
      ),
    );
  }
}
