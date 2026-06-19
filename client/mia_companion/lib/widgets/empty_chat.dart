import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import 'mia_avatar.dart';

class EmptyChat extends StatelessWidget {
  const EmptyChat({
    super.key,
    this.companionName,
    this.avatarAsset,
  });

  final String? companionName;
  final String? avatarAsset;

  @override
  Widget build(BuildContext context) {
    final name = companionName ?? MiaProfile.name;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            MiaAvatar(
              size: 88,
              assetPath: avatarAsset,
              showBorder: true,
              borderWidth: 2,
            ),
            const SizedBox(height: 24),
            Text(
              'say hi to $name',
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
          ],
        ),
      ),
    );
  }
}
