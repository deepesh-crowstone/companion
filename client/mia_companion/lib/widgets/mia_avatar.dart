import 'package:flutter/material.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';

/// Circular profile photo for Mia (chat header, profile, voice call).
class MiaAvatar extends StatelessWidget {
  const MiaAvatar({
    super.key,
    required this.size,
    this.onTap,
    this.borderWidth = 0,
    this.showBorder = false,
  });

  final double size;
  final VoidCallback? onTap;
  final double borderWidth;
  final bool showBorder;

  @override
  Widget build(BuildContext context) {
    Widget avatar = ClipOval(
      child: Image.asset(
        MiaProfile.avatarAsset,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) =>
            _FallbackLetter(size: size),
      ),
    );

    if (showBorder && borderWidth > 0) {
      avatar = Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: MiaColors.surface,
            width: borderWidth,
          ),
          boxShadow: [
            BoxShadow(
              color: MiaColors.accent.withValues(alpha: 0.25),
              blurRadius: size * 0.2,
              offset: Offset(0, size * 0.06),
            ),
          ],
        ),
        child: avatar,
      );
    }

    if (onTap != null) {
      return Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: avatar,
        ),
      );
    }

    return avatar;
  }
}

class _FallbackLetter extends StatelessWidget {
  const _FallbackLetter({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [MiaColors.miaBubble, MiaColors.accent],
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        'M',
        style: TextStyle(
          fontSize: size * 0.42,
          fontWeight: FontWeight.w600,
          color: MiaColors.accentDeep,
        ),
      ),
    );
  }
}
