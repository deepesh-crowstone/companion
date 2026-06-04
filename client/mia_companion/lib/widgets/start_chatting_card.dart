import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Bottom CTA for the onboarding welcome screen.
class StartChattingCard extends StatelessWidget {
  const StartChattingCard({
    super.key,
    required this.onStart,
    this.onLogin,
    this.loading = false,
    this.loginLoading = false,
  });

  final VoidCallback? onStart;
  final VoidCallback? onLogin;
  final bool loading;
  final bool loginLoading;

  static const _buttonColor = Color(0xFF5F269F);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
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
            if (onLogin != null) ...[
              const SizedBox(height: 10),
              Center(
                child: TextButton(
                  onPressed: (loading || loginLoading) ? null : onLogin,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: loginLoading
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white.withValues(alpha: 0.9),
                          ),
                        )
                      : Text(
                          'Existing User',
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: _buttonColor,
                            decoration: TextDecoration.underline,
                            decorationColor: _buttonColor,
                          ),
                        ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
