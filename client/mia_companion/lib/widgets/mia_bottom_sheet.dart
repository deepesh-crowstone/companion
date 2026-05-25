import 'package:flutter/material.dart';

import '../theme/mia_theme.dart';
import '../theme/theme_controller.dart';

/// Bottom sheet shell that updates surface color when the theme changes.
class MiaBottomSheetSurface extends StatelessWidget {
  const MiaBottomSheetSurface({super.key, required this.child});

  final Widget child;

  static const _radius = BorderRadius.vertical(top: Radius.circular(20));

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ThemeController.instance,
      builder: (context, _) {
        return Material(
          color: MiaColors.surface,
          borderRadius: _radius,
          clipBehavior: Clip.antiAlias,
          child: child,
        );
      },
    );
  }
}

/// Shared [showModalBottomSheet] defaults for Mia sheets.
Future<T?> showMiaBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    backgroundColor: Colors.transparent,
    builder: (ctx) => MiaBottomSheetSurface(child: builder(ctx)),
  );
}
