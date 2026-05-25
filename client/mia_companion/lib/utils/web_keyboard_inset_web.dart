import 'dart:async';
import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Lifts [child] above the virtual keyboard in mobile webviews that overlay
/// the keyboard instead of resizing the layout (e.g. Instagram in-app browser).
///
/// On regular Chrome/Safari the layout viewport shrinks and Flutter's
/// `Scaffold.resizeToAvoidBottomInset` already handles the inset — in that case
/// this widget stays a no-op so we never apply the inset twice.
class WebKeyboardInset extends StatefulWidget {
  const WebKeyboardInset({
    super.key,
    required this.child,
    required this.focusNode,
  });

  final Widget child;
  final FocusNode focusNode;

  @override
  State<WebKeyboardInset> createState() => _WebKeyboardInsetState();
}

class _WebKeyboardInsetState extends State<WebKeyboardInset> {
  static const _gap = 10.0;
  static const _openThreshold = 8.0;
  static const _focusLossDebounce = Duration(milliseconds: 120);

  double _overlayLift = 0;
  double _baselineWindowHeight = 0;
  Timer? _clearTimer;
  late final web.EventListener _onViewportChange = _handleViewportChange.toJS;

  void _handleViewportChange(web.Event _) {
    _sync();
  }

  @override
  void initState() {
    super.initState();
    _baselineWindowHeight = _windowHeight;
    widget.focusNode.addListener(_onFocusChanged);
    _attachListeners();
    WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
  }

  @override
  void didUpdateWidget(covariant WebKeyboardInset oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.focusNode != widget.focusNode) {
      oldWidget.focusNode.removeListener(_onFocusChanged);
      widget.focusNode.addListener(_onFocusChanged);
      _sync();
    }
  }

  void _onFocusChanged() {
    if (widget.focusNode.hasFocus) {
      _clearTimer?.cancel();
      _clearTimer = null;
      _sync();
      return;
    }
    // Debounce focus loss so refocusing right after sending doesn't flicker.
    _clearTimer?.cancel();
    _clearTimer = Timer(_focusLossDebounce, () {
      if (!mounted || widget.focusNode.hasFocus) return;
      if (_overlayLift != 0) setState(() => _overlayLift = 0);
    });
  }

  double get _windowHeight => web.window.innerHeight.toDouble();

  void _attachListeners() {
    web.window.visualViewport?.addEventListener('resize', _onViewportChange);
    web.window.visualViewport?.addEventListener('scroll', _onViewportChange);
    web.window.addEventListener('resize', _onViewportChange);
  }

  void _detachListeners() {
    web.window.visualViewport?.removeEventListener('resize', _onViewportChange);
    web.window.visualViewport?.removeEventListener('scroll', _onViewportChange);
    web.window.removeEventListener('resize', _onViewportChange);
  }

  void _sync() {
    if (!mounted) return;

    final vv = web.window.visualViewport;
    if (vv == null) return;

    final windowHeight = _windowHeight;
    final overlap = math.max(
      0.0,
      windowHeight - vv.height - vv.offsetTop,
    );

    if (overlap < _openThreshold) {
      _baselineWindowHeight = windowHeight;
    }

    // If the layout viewport shrank by roughly the keyboard height, the
    // browser is in resize mode — Flutter already adjusts via viewInsets, so
    // we must not add our own lift on top of that.
    final shrink = _baselineWindowHeight - windowHeight;
    final isOverlayKeyboard =
        overlap > _openThreshold && shrink < overlap * 0.35;

    final nextLift = isOverlayKeyboard ? overlap + _gap : 0.0;

    if ((nextLift - _overlayLift).abs() > 0.5) {
      setState(() => _overlayLift = nextLift);
    }
  }

  @override
  void dispose() {
    _clearTimer?.cancel();
    widget.focusNode.removeListener(_onFocusChanged);
    _detachListeners();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Stable wrapper so focus is preserved when the lift changes.
    return Padding(
      padding: EdgeInsets.only(bottom: _overlayLift),
      child: widget.child,
    );
  }
}
