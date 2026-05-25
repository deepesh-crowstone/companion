import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import 'mia_avatar.dart';

/// Welcome card shown to new users: Zara's profile, online status, and CTA.
class StartChattingCard extends StatelessWidget {
  const StartChattingCard({
    super.key,
    required this.onStart,
    this.loading = false,
  });

  final VoidCallback? onStart;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          const MiaAvatar(size: 108, showBorder: true, borderWidth: 3),
          const SizedBox(height: 20),
          Text(MiaProfile.name, style: MiaTheme.serifTitle(size: 32)),
          const SizedBox(height: 6),
          Text(
            MiaProfile.tagline,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: MiaColors.statusPink,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          const _OnlineStatus(),
          const SizedBox(height: 36),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: loading ? null : onStart,
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Start Chatting with Zara'),
            ),
          ),
        ],
      ),
    );
  }
}

class _OnlineStatus extends StatelessWidget {
  const _OnlineStatus();

  @override
  Widget build(BuildContext context) {
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
        Text(
          'online now',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: MiaColors.textMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}
