import 'package:flutter/widgets.dart';

/// No-op on non-web platforms.
class WebKeyboardInset extends StatelessWidget {
  const WebKeyboardInset({
    super.key,
    required this.child,
    required this.focusNode,
  });

  final Widget child;
  final FocusNode focusNode;

  @override
  Widget build(BuildContext context) => child;
}
