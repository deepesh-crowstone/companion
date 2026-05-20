import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';

class EmptyChat extends StatelessWidget {
  const EmptyChat({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: MiaColors.miaBubble,
                boxShadow: [
                  BoxShadow(
                    color: MiaColors.accent.withValues(alpha: 0.2),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Icon(
                Icons.favorite_outline,
                color: MiaColors.accentDeep,
                size: 36,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'say hi to mia',
              style: MiaTheme.serifTitle(size: 22),
            ),
            const SizedBox(height: 10),
            Text(
              'text her, send a voice note, or tap the phone icon for a live call.',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 14,
                height: 1.45,
                color: MiaColors.textMuted,
              ),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: MiaColors.miaBubble.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                "you're up early 👀",
                style: GoogleFonts.inter(
                  fontSize: 15,
                  color: MiaColors.textPrimary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
