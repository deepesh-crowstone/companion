import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme/mia_theme.dart';

class DisappearingMessagesBanner extends StatelessWidget {
  const DisappearingMessagesBanner({super.key, required this.enabled});

  final bool enabled;

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
              Icon(
                Icons.timer_outlined,
                size: 16,
                color: MiaColors.accentDeep,
              ),
              const SizedBox(width: 8),
              Text(
                enabled
                    ? 'You turned on disappearing messages'
                    : 'You turned off disappearing messages',
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
}
