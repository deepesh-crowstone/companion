import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Bottom CTA for the onboarding welcome screen.
class StartChattingCard extends StatelessWidget {
  const StartChattingCard({
    super.key,
    required this.onStart,
    this.loading = false,
  });

  final VoidCallback? onStart;
  final bool loading;

  static const _buttonColor = Color(0xFF5F269F);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: loading ? null : onStart,
            style: FilledButton.styleFrom(
              backgroundColor: _buttonColor,
              disabledBackgroundColor: _buttonColor.withValues(alpha: 0.7),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.symmetric(vertical: 20),
            ),
            child: loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Start Chatting with Zara',
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Icon(Icons.arrow_forward_rounded, size: 22),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
