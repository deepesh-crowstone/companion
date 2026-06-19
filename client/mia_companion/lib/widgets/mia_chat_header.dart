import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../models/zara_mood.dart';
import '../services/mood_controller.dart';
import '../theme/mia_theme.dart';
import 'mia_avatar.dart';

/// Full-width chat header: avatar + name/status (left), personality (center), menu (right).
class MiaChatHeader extends StatelessWidget implements PreferredSizeWidget {
  const MiaChatHeader({
    super.key,
    required this.onCall,
    required this.onMenu,
    required this.onMood,
    required this.onProfile,
    this.companionName,
    this.avatarAsset,
    this.statusText = 'Active',
    this.showMoodPicker = true,
  });

  final VoidCallback onCall;
  final VoidCallback onMenu;
  final VoidCallback onMood;
  final VoidCallback onProfile;
  final String? companionName;
  final String? avatarAsset;
  final String statusText;
  final bool showMoodPicker;

  @override
  Size get preferredSize => const Size.fromHeight(80);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: MiaColors.surface,
      elevation: 2,
      shadowColor: Colors.black.withValues(alpha: 0.06),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    MiaAvatar(
                      size: 44,
                      assetPath: avatarAsset,
                      onTap: onProfile,
                      showBorder: true,
                      borderWidth: 1.5,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: onProfile,
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  companionName ?? MiaProfile.name,
                                  style: GoogleFonts.inter(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: MiaColors.miaText,
                                    height: 1.2,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                _StatusLine(text: statusText),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (showMoodPicker) _MoodPill(onTap: onMood),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    _CallButton(
                      onTap: onCall,
                      companionName: companionName ?? MiaProfile.name,
                    ),
                    const SizedBox(width: 2),
                    IconButton(
                      icon: const Icon(Icons.more_vert, size: 22),
                      color: MiaColors.textPrimary,
                      tooltip: 'menu',
                      onPressed: onMenu,
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Attention-grabbing call action: filled accent circle with a slow
/// "breathing" glow so the eye is drawn to it without it feeling noisy.
class _CallButton extends StatefulWidget {
  const _CallButton({required this.onTap, required this.companionName});

  final VoidCallback onTap;
  final String companionName;

  @override
  State<_CallButton> createState() => _CallButtonState();
}

class _CallButtonState extends State<_CallButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTap() {
    HapticFeedback.mediumImpact();
    widget.onTap();
  }

  Widget _buildVisual({required double glowAlpha, required double scale}) {
    return Transform.scale(
      scale: scale,
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [MiaColors.accent, MiaColors.accentDeep],
          ),
          boxShadow: [
            BoxShadow(
              color: MiaColors.accent.withValues(alpha: glowAlpha),
              blurRadius: 14,
              spreadRadius: 1.5,
            ),
          ],
        ),
        child: const Icon(
          Icons.call_rounded,
          color: Colors.white,
          size: 20,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;

    return Tooltip(
      message: 'Call ${widget.companionName}',
      child: Semantics(
        button: true,
        label: 'Call ${widget.companionName}',
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _handleTap,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: reduceMotion
                  ? _buildVisual(glowAlpha: 0.4, scale: 1)
                  : AnimatedBuilder(
                      animation: _controller,
                      builder: (context, _) {
                        final t = Curves.easeInOut.transform(_controller.value);
                        return _buildVisual(
                          glowAlpha: 0.28 + 0.34 * t,
                          scale: 1 + 0.06 * t,
                        );
                      },
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MoodPill extends StatelessWidget {
  const _MoodPill({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: MoodController.instance,
      builder: (context, _) {
        final mood = MoodController.instance.mood;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Material(
            color: MiaColors.accent.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(20),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(20),
              splashColor: MiaColors.accent.withValues(alpha: 0.25),
              highlightColor: MiaColors.accent.withValues(alpha: 0.12),
              child: Ink(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _moodIcon(mood),
                        size: 16,
                        color: MiaColors.accentDeep,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        mood.label,
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: MiaColors.accentDeep,
                        ),
                      ),
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: Center(
                          child: Transform.scale(
                            scale: 1.5,
                            child: Icon(
                              Icons.arrow_drop_down_rounded,
                              size: 18,
                              color: MiaColors.accentDeep,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  static IconData _moodIcon(ZaraMood mood) {
    switch (mood) {
      case ZaraMood.friendly:
        return Icons.sentiment_satisfied_alt_rounded;
      case ZaraMood.funny:
        return Icons.theater_comedy_outlined;
      case ZaraMood.caring:
        return Icons.favorite_border_rounded;
      case ZaraMood.bold:
        return Icons.local_fire_department_outlined;
    }
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.text});

  final String text;

  static const _onlineLabel = 'Active';

  @override
  Widget build(BuildContext context) {
    final style = GoogleFonts.inter(
      fontSize: 12,
      color: MiaColors.textMuted,
      fontWeight: FontWeight.w400,
    );

    if (text != _onlineLabel) {
      return Text(
        text,
        style: style,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: MiaColors.online,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            text,
            style: style,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
