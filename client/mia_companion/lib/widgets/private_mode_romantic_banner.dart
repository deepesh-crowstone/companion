import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Sticky upsell below the chat header before private mode is purchased.
class PrivateModeRomanticBanner extends StatelessWidget {
  const PrivateModeRomanticBanner({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                const Color(0xFFFFF0F6),
                const Color(0xFFF8E8FF),
              ],
            ),
            border: Border(
              bottom: BorderSide(color: const Color(0xFFE8B4D4).withValues(alpha: 0.6)),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Row(
              children: [
                Icon(Icons.favorite_rounded, color: Colors.pink.shade400, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Romantic chats with Zara and Photos',
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF6B2D5C),
                          height: 1.25,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'By clicking here you confirm that you are 18+ years',
                        style: GoogleFonts.inter(
                          fontSize: 11,
                          color: const Color(0xFF8B5A7A),
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: Colors.pink.shade300,
                  size: 24,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
