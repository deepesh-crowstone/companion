import 'package:flutter/material.dart';

import '../theme/mia_theme.dart';

/// WhatsApp-style control to jump to the latest messages.
class ScrollToBottomButton extends StatelessWidget {
  const ScrollToBottomButton({super.key, required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      color: MiaColors.surface,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(
            Icons.keyboard_arrow_down_rounded,
            color: MiaColors.accentDeep,
            size: 28,
          ),
        ),
      ),
    );
  }
}
