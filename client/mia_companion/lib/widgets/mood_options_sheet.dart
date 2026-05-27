import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/zara_mood.dart';
import '../services/mood_controller.dart';
import '../theme/mia_theme.dart';
import 'mia_bottom_sheet.dart';
import 'personality_unlock_sheet.dart';

Future<void> showMoodOptionsSheet(BuildContext context) {
  unawaited(MoodController.instance.refreshAccess());
  return showMiaBottomSheet<void>(
    context: context,
    builder: (ctx) => ListenableBuilder(
      listenable: MoodController.instance,
      builder: (context, _) {
        final controller = MoodController.instance;
        final selected = controller.mood;
        final passActive = controller.passActive;
        final expiry = formatPersonalityExpiry(controller.access?.unlockedUntil);

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
                    "Select Zara's Personality",
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: MiaColors.textPrimary,
                    ),
                  ),
                ),
              ),
              if (passActive && expiry.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'All personalities unlocked until $expiry',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: MiaColors.accentDeep,
                        fontWeight: FontWeight.w500,
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
                  trailing: _trailingFor(mood, selected, controller),
                  onTap: () async {
                    if (!controller.canUseMood(mood)) {
                      Navigator.pop(ctx);
                      if (!context.mounted) return;
                      await showPersonalityUnlockSheet(
                        context: context,
                        mood: mood,
                      );
                      return;
                    }
                    await controller.setMood(mood);
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

Widget? _trailingFor(
  ZaraMood mood,
  ZaraMood selected,
  MoodController controller,
) {
  if (selected == mood) {
    return Icon(Icons.check, color: MiaColors.accentDeep);
  }
  if (!controller.canUseMood(mood)) {
    return Icon(Icons.lock_outline, color: MiaColors.textMuted, size: 20);
  }
  return null;
}

IconData _iconFor(ZaraMood mood) {
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
