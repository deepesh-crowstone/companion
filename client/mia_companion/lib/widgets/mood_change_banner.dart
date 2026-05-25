import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/zara_mood.dart';
import '../theme/mia_theme.dart';

class MoodChangeBanner extends StatelessWidget {
  const MoodChangeBanner({super.key, required this.mood});

  final ZaraMood mood;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: MiaColors.accent.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(_iconFor(mood), size: 16, color: MiaColors.accentDeep),
              const SizedBox(width: 8),
              Text(
                "You changed Zara's personality to ${mood.label}",
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: MiaColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _iconFor(ZaraMood mood) {
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
