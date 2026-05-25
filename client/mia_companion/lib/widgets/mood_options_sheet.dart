import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/zara_mood.dart';
import '../services/mood_controller.dart';
import '../theme/mia_theme.dart';
import 'mia_bottom_sheet.dart';

Future<void> showMoodOptionsSheet(BuildContext context) {
  return showMiaBottomSheet<void>(
    context: context,
    builder: (ctx) => ListenableBuilder(
      listenable: MoodController.instance,
      builder: (context, _) {
        final selected = MoodController.instance.mood;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: MiaColors.miaBubble,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    "Select Zara's Mood",
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: MiaColors.textPrimary,
                    ),
                  ),
                ),
              ),
              for (final mood in ZaraMood.values)
                ListTile(
                  leading: Icon(_iconFor(mood), color: MiaColors.accentDeep),
                  title: Text(
                    mood.label,
                    style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600,
                      color: MiaColors.textPrimary,
                    ),
                  ),
                  subtitle: Text(
                    mood.description,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: MiaColors.textMuted,
                    ),
                  ),
                  trailing: selected == mood
                      ? Icon(Icons.check, color: MiaColors.accentDeep)
                      : null,
                  onTap: () async {
                    await MoodController.instance.setMood(mood);
                    if (ctx.mounted) Navigator.pop(ctx);
                  },
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    ),
  );
}

IconData _iconFor(ZaraMood mood) {
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
