import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// In-chat CTA after romantic intent in normal mode.
class PrivateModeUpsellBanner extends StatelessWidget {
  const PrivateModeUpsellBanner({super.key, required this.onTalkPrivately});

  final VoidCallback onTalkPrivately;

  static const _ctaColor = Color(0xFF5F269F);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Center(
        child: Material(
          color: const Color(0xFFFFF0F6),
          borderRadius: BorderRadius.circular(20),
          child: InkWell(
            onTap: onTalkPrivately,
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFE8B4D4)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_outline_rounded,
                      size: 18, color: Colors.pink.shade700),
                  const SizedBox(width: 10),
                  Text(
                    'Talk Privately with Zara',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: _ctaColor,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(Icons.arrow_forward_rounded,
                      size: 18, color: _ctaColor),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
