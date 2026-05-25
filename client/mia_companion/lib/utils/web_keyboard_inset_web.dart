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
    // Use the full Flutter view's logical size, NOT the local MediaQuery.
    // Inside a Scaffold the local MediaQuery has already been shrunk by
    // viewInsets.bottom; subtracting the visual viewport from that would
    // give a residual of zero in every browser, including overlay webviews.
    //
    // The view-level size reflects what the Flutter engine actually painted —
    // if Flutter shrank the canvas to dodge the keyboard, this size shrinks
    // along with it, so the comparison stays accurate.
    final view = View.of(context);
    final viewHeight = view.physicalSize.height / view.devicePixelRatio;

    // How far the Flutter canvas extends below the visible visual viewport.
    // - Normal browser (Flutter shrinks canvas, OR no keyboard at all):
    //     canvas bottom <= visible bottom, overlap is 0.
    // - Overlay webview (canvas full, visualViewport shrunk by keyboard):
    //     canvas bottom > visible bottom, overlap = keyboard height.
    final overlap = viewHeight - _visibleBottom;
    final lift = (_focusedSnapshot && overlap > _openThreshold)
        ? overlap + _gap
        : 0.0;

    return Padding(
      padding: EdgeInsets.only(bottom: lift),
      child: widget.child,
    );
  }
}
