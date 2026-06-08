import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';

/// Subtle in-chat hint shown once when a free user is one message away from the
/// daily limit. Deliberately low-key so it primes the upsell without making the
/// companion feel like a metered service.
class FreeMessagesLeftChip extends StatelessWidget {
  const FreeMessagesLeftChip({super.key, required this.remaining});

  final int remaining;

  static const _textColor = Color(0xFF5F269F);

  @override
  Widget build(BuildContext context) {
    final label = remaining <= 1
        ? 'Last free message with ${MiaProfile.name} today'
        : '$remaining free messages left with ${MiaProfile.name} today';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF0F6),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE8B4D4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.bolt_rounded, size: 15, color: Colors.pink.shade700),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: _textColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
