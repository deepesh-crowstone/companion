import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../models/zara_mood.dart';
import '../services/mood_controller.dart';
import '../theme/mia_theme.dart';
import 'mia_avatar.dart';

/// Full-width chat header: avatar + name/status (left), personality (center), call & menu (right).
class MiaChatHeader extends StatelessWidget implements PreferredSizeWidget {
  const MiaChatHeader({
    super.key,
    required this.onCall,
    required this.onMenu,
    required this.onMood,
    required this.onProfile,
    this.statusText = 'Active',
  });

  final VoidCallback onCall;
  final VoidCallback onMenu;
  final VoidCallback onMood;
  final VoidCallback onProfile;
  final String statusText;

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
                      onTap: onProfile,
                      showBorder: true,
                      borderWidth: 1.5,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            MiaProfile.name,
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
                  ],
                ),
              ),
              _MoodPill(onTap: onMood),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.phone_outlined, size: 22),
                      color: MiaColors.textPrimary,
                      tooltip: 'voice call',
                      onPressed: onCall,
                      visualDensity: VisualDensity.compact,
                    ),
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
      case ZaraMood.naughty:
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
