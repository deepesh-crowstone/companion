import 'package:flutter/material.dart';

import '../theme/mia_theme.dart';

/// Full-screen portrait background shared across auth and chat.
///
/// Background layers are pinned to the full screen height so opening the
/// keyboard does not rescale the image when [Scaffold.resizeToAvoidBottomInset]
/// shrinks the body.
class MiaBackground extends StatelessWidget {
  const MiaBackground({super.key, required this.child});

  static const imageAsset = 'assets/images/auth_background.webp';

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;

    return Stack(
      fit: StackFit.expand,
      clipBehavior: Clip.none,
      children: [
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight,
          child: const _MiaBackgroundLayers(),
        ),
        child,
      ],
    );
  }
}

class _MiaBackgroundLayers extends StatelessWidget {
  const _MiaBackgroundLayers();

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          MiaBackground.imageAsset,
          fit: BoxFit.cover,
          alignment: Alignment.centerLeft,
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                MiaColors.background.withValues(alpha: 0.15),
                MiaColors.background.withValues(alpha: 0.45),
                MiaColors.background.withValues(alpha: 0.88),
              ],
              stops: const [0.0, 0.42, 1.0],
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: [
                Colors.transparent,
                MiaColors.background.withValues(alpha: 0.35),
                MiaColors.background.withValues(alpha: 0.82),
              ],
              stops: const [0.0, 0.55, 1.0],
            ),
          ),
        ),
      ],
    );
  }
}
