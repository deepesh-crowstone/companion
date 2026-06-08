import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';

/// Blurs [content] and shows an unlock row directly beneath it, inside the
/// message bubble — not as a full-bubble overlay.
class LockedAssistantBubbleContent extends StatelessWidget {
  const LockedAssistantBubbleContent({
    super.key,
    required this.content,
    required this.onUnlock,
  });

  final Widget content;
  final VoidCallback onUnlock;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onUnlock,
      behavior: HitTestBehavior.opaque,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
              child: content,
            ),
          ),
          const SizedBox(height: 11),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.lock_rounded,
                size: 15,
                color: MiaColors.accentDeep,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  'Unlock ${MiaProfile.name}\u2019s Reply',
                  style: GoogleFonts.inter(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: MiaColors.accentDeep,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
