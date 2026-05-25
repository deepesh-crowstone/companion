import 'dart:async';
import 'dart:js_interop';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Lifts [child] above the virtual keyboard in mobile webviews that overlay
/// the keyboard without informing Flutter (e.g. Instagram in-app browser).
///
/// On regular Chrome / Safari the visual viewport overlap is already exposed
/// via `MediaQuery.viewInsets.bottom`, and `Scaffold.resizeToAvoidBottomInset`
/// handles the inset. We only apply the *residual* lift Flutter has not already
/// accounted for, so we never double-pad in normal browsers.
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
  static const _focusLossDebounce = Duration(milliseconds: 150);

  double _visualOverlap = 0;
  Timer? _focusLossTimer;
  bool _focusedSnapshot = false;
  late final web.EventListener _onViewportChange = _handleViewportChange.toJS;

  void _handleViewportChange(web.Event _) {
    _sync();
  }

  @override
  void initState() {
    super.initState();
    _focusedSnapshot = widget.focusNode.hasFocus;
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
      _focusedSnapshot = widget.focusNode.hasFocus;
      _sync();
    }
  }

  void _onFocusChanged() {
    if (widget.focusNode.hasFocus) {
      _focusLossTimer?.cancel();
      _focusLossTimer = null;
      if (!_focusedSnapshot) {
        setState(() => _focusedSnapshot = true);
      }
      return;
    }
    // Debounce focus loss so the brief blur during _sendText doesn't toggle
    // the lift on and off (visible flicker).
    _focusLossTimer?.cancel();
    _focusLossTimer = Timer(_focusLossDebounce, () {
      if (!mounted || widget.focusNode.hasFocus) return;
      setState(() => _focusedSnapshot = false);
    });
  }

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

    final overlap = math.max(
      0.0,
      web.window.innerHeight.toDouble() - vv.height - vv.offsetTop,
    );

    if ((overlap - _visualOverlap).abs() > 0.5) {
      setState(() => _visualOverlap = overlap);
    }
  }

  @override
  void dispose() {
    _focusLossTimer?.cancel();
    widget.focusNode.removeListener(_onFocusChanged);
    _detachListeners();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final flutterInset = MediaQuery.viewInsetsOf(context).bottom;
    // Only the part of the visual-viewport overlap Flutter hasn't already
    // accounted for. In normal browsers this is 0, so we add nothing on top
    // of Scaffold.resizeToAvoidBottomInset.
    final residual = math.max(0.0, _visualOverlap - flutterInset);
    final lift = (_focusedSnapshot && residual > _openThreshold)
        ? residual + _gap
        : 0.0;

    return Padding(
      padding: EdgeInsets.only(bottom: lift),
      child: widget.child,
    );
  }
}
