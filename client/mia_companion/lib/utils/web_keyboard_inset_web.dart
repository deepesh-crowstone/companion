import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Lifts [child] above overlay keyboards in mobile webviews (e.g. Instagram)
/// where the layout viewport does not shrink when the IME opens.
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

  double _lift = 0;
  double _baselineWindowHeight = 0;
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
    if (!widget.focusNode.hasFocus) {
      if (_lift != 0 && mounted) setState(() => _lift = 0);
      return;
    }
    _sync();
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
    if (!widget.focusNode.hasFocus) {
      if (_lift != 0 && mounted) setState(() => _lift = 0);
      return;
    }

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

    final shrink = _baselineWindowHeight - windowHeight;
    final manualLift = overlap > _openThreshold && shrink < overlap * 0.35
        ? overlap + _gap
        : 0.0;

    if ((manualLift - _lift).abs() > 0.5 && mounted) {
      setState(() => _lift = manualLift);
    }
  }

  @override
  void dispose() {
    widget.focusNode.removeListener(_onFocusChanged);
    _detachListeners();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Keep a stable wrapper so focus is not lost when lift becomes non-zero.
    return Padding(
      padding: EdgeInsets.only(bottom: _lift),
      child: widget.child,
    );
  }
}
