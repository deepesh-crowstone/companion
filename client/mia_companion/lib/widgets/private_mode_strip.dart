import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/private_mode_controller.dart';

/// Enter / active private mode control below the chat header.
class PrivateModeStrip extends StatelessWidget {
  const PrivateModeStrip({
    super.key,
    required this.onEnter,
    required this.onExit,
  });

  final VoidCallback onEnter;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: PrivateModeController.instance,
      builder: (context, _) {
        final active = PrivateModeController.instance.privateModeActive;
        if (active) {
          return _ActiveStrip(onExit: onExit);
        }
        return _EnterStrip(onEnter: onEnter);
      },
    );
  }
}

class _EnterStrip extends StatelessWidget {
  const _EnterStrip({required this.onEnter});

  final VoidCallback onEnter;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF2D1B3D),
      child: InkWell(
        onTap: onEnter,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Icon(Icons.lock_open_rounded, color: Colors.pink.shade200, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Enter Private Mode',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: Colors.pink.shade200),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveStrip extends StatelessWidget {
  const _ActiveStrip({required this.onExit});

  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF1F1528),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
        child: Row(
          children: [
            Icon(Icons.visibility_off_rounded, color: Colors.pink.shade200, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Private Mode On',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Private chats disappear after exiting private mode',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: Colors.white.withValues(alpha: 0.72),
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onExit,
              tooltip: 'Exit private mode',
              icon: Icon(Icons.logout_rounded, color: Colors.pink.shade200, size: 22),
              visualDensity: VisualDensity.compact,
            ),
          ],
        ),
      ),
    );
  }
}
