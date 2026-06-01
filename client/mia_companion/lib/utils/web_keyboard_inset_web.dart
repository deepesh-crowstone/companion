import 'dart:async';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// Lifts [child] above the virtual keyboard in mobile webviews that overlay
/// the keyboard without informing Flutter (e.g. Instagram in-app browser).
///
/// Invariant: the bottom of [child] must not extend below the visual viewport
/// (`visualViewport.height + offsetTop`). We compare the full Flutter view's
/// size — not the local `MediaQuery`, which is already shrunk by the Scaffold —
/// so we never apply a lift Flutter has already handled.
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

  /// Visible bottom of the visual viewport, in CSS/logical pixels.
  /// Defaults to [double.infinity] so that the initial frame (before the first
  /// `_sync`) yields zero lift.
  double _visibleBottom = double.infinity;
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

    final visibleBottom = vv.height + vv.offsetTop;
    if ((visibleBottom - _visibleBottom).abs() > 0.5) {
      setState(() => _visibleBottom = visibleBottom);
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
    // Work in the full Flutter view's logical pixels (raw view, not the local
    // MediaQuery, which a parent Scaffold may have already shrunk).
    final view = View.of(context);
    final dpr = view.devicePixelRatio;
    final viewHeight = view.physicalSize.height / dpr;

    // Keyboard inset the Flutter engine already reports and the Scaffold has
    // therefore already lifted the input by. This is 0 in overlay webviews that
    // hide the keyboard from the engine, but on modern mobile browsers the
    // engine reports the real keyboard height here.
    final handledInset = view.viewInsets.bottom / dpr;

    // How far the painted canvas extends below the visible visual viewport,
    // i.e. the total keyboard overlap over the full canvas.
    final overlap = viewHeight - _visibleBottom;

    // Only add the overlap Flutter has NOT already handled. Without subtracting
    // [handledInset] we would lift a second time on top of the Scaffold's own
    // resize and push the input far above the keyboard (double lift).
    final residual = overlap - handledInset;
    final lift = (_focusedSnapshot && residual > _openThreshold)
        ? residual + _gap
        : 0.0;

    return Padding(
      padding: EdgeInsets.only(bottom: lift),
      child: widget.child,
    );
  }
}
