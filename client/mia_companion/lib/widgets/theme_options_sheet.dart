import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';
import '../theme/theme_controller.dart';
import 'mia_bottom_sheet.dart';

Future<void> showThemeOptionsSheet(BuildContext context) {
  return showMiaBottomSheet<void>(
    context: context,
    builder: (ctx) {
      final isDark = ThemeController.instance.isDark;
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
                  'Theme',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: MiaColors.textPrimary,
                  ),
                ),
              ),
            ),
            ListTile(
              leading: Icon(Icons.light_mode_outlined, color: MiaColors.accentDeep),
              title: Text('Light theme', style: TextStyle(color: MiaColors.textPrimary)),
              trailing: isDark
                  ? null
                  : Icon(Icons.check, color: MiaColors.accentDeep),
              onTap: () async {
                await ThemeController.instance.setLight();
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: Icon(Icons.dark_mode_outlined, color: MiaColors.accentDeep),
              title: Text('Dark theme', style: TextStyle(color: MiaColors.textPrimary)),
              trailing: isDark
                  ? Icon(Icons.check, color: MiaColors.accentDeep)
                  : null,
              onTap: () async {
                await ThemeController.instance.setDark();
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      );
    },
  );
}
