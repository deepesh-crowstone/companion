import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/mia_theme.dart';
import 'mia_avatar.dart';
import 'message_bubble.dart';

enum MiaPresenceKind { typing, recording }

/// WhatsApp-style presence: Mia's avatar + compact activity bubble.
class MiaPresenceRow extends StatelessWidget {
  const MiaPresenceRow({
    super.key,
    required this.kind,
    this.compactTop = false,
  });

  final MiaPresenceKind kind;
  final bool compactTop;

  static const double _avatarSize = 28;
  static const double _bubbleMinHeight = 36;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        top: compactTop
            ? MessageBubble.gapSameSender
            : MessageBubble.gapNewSender,
        bottom: 2,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          MiaAvatar(size: _avatarSize),
          const SizedBox(width: 8),
          _PresenceBubble(kind: kind),
        ],
      ),
    );
  }
}

class _PresenceBubble extends StatelessWidget {
  const _PresenceBubble({required this.kind});

  final MiaPresenceKind kind;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: MiaPresenceRow._bubbleMinHeight),
      padding: EdgeInsets.symmetric(
        horizontal: kind == MiaPresenceKind.typing ? 14 : 16,
        vertical: kind == MiaPresenceKind.typing ? 10 : 9,
      ),
      decoration: BoxDecoration(
        color: MiaColors.miaBubble,
        borderRadius: MiaTheme.bubbleShape(isUser: false),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: kind == MiaPresenceKind.typing
          ? const _WhatsAppTypingDots()
          : const _WhatsAppRecordingMic(),
    );
  }
}

/// Three dots that bounce in sequence (WhatsApp typing indicator).
class _WhatsAppTypingDots extends StatefulWidget {
  const _WhatsAppTypingDots();

  @override
  State<_WhatsAppTypingDots> createState() => _WhatsAppTypingDotsState();
}

class _WhatsAppTypingDotsState extends State<_WhatsAppTypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  static const _dotSize = 6.0;
  static const _dotSpacing = 4.0;
  static const _bounce = 4.0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return SizedBox(
          height: _dotSize + _bounce,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(3, (i) {
              final phase = (_controller.value * 2 * math.pi) - (i * 0.75);
              final y = math.sin(phase) * _bounce;
              return Padding(
                padding: EdgeInsets.only(left: i == 0 ? 0 : _dotSpacing),
                child: Transform.translate(
                  offset: Offset(0, -y),
                  child: Container(
                    width: _dotSize,
                    height: _dotSize,
                    decoration: BoxDecoration(
                      color: MiaColors.textMuted.withValues(
                        alpha: 0.55 + 0.35 * ((math.sin(phase) + 1) / 2),
                      ),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              );
            }),
          ),
        );
      },
    );
  }
}

/// Mic icon pulse while Mia is "recording audio" (WhatsApp-style).
class _WhatsAppRecordingMic extends StatefulWidget {
  const _WhatsAppRecordingMic();

  @override
  State<_WhatsAppRecordingMic> createState() => _WhatsAppRecordingMicState();
}

class _WhatsAppRecordingMicState extends State<_WhatsAppRecordingMic>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _pulse;

  static const _micColor = Color(0xFFE54D42);

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _pulse = Tween(begin: 0.75, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        return Opacity(
          opacity: _pulse.value,
          child: Transform.scale(
            scale: 0.92 + (_pulse.value * 0.08),
            child: child,
          ),
        );
      },
      child: const Icon(
        Icons.mic_rounded,
        size: 18,
        color: _micColor,
      ),
    );
  }
}
