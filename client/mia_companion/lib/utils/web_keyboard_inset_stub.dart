import 'package:flutter/widgets.dart';

/// No-op on non-web platforms.
class WebKeyboardInset extends StatelessWidget {
  const WebKeyboardInset({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => child;
}
