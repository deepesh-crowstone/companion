import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import 'mia_avatar.dart';

/// Pill-shaped chat header: avatar + name/status + call & menu actions.
class MiaChatHeader extends StatelessWidget implements PreferredSizeWidget {
  const MiaChatHeader({
    super.key,
    required this.onCall,
    required this.onMenu,
    required this.onMood,
    required this.onProfile,
    this.statusText = 'online now',
  });

  final VoidCallback onCall;
  final VoidCallback onMenu;
  final VoidCallback onMood;
  final VoidCallback onProfile;
  final String statusText;

  @override
  Size get preferredSize => const Size.fromHeight(88);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        child: Material(
          color: MiaColors.surface,
          elevation: 2,
          shadowColor: Colors.black.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(28),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                MiaAvatar(
                  size: 48,
                  onTap: onProfile,
                  showBorder: true,
                  borderWidth: 1.5,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        MiaProfile.name,
                        style: GoogleFonts.inter(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                          color: MiaColors.miaText,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      _StatusLine(text: statusText),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.mood_outlined, size: 22),
                  color: MiaColors.textPrimary,
                  tooltip: 'Zara mood',
                  onPressed: onMood,
                  visualDensity: VisualDensity.compact,
                ),
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
        ),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.text});

  final String text;

  static const _onlineLabel = 'online now';

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
