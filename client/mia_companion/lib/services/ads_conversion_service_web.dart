import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Reports a Google Ads conversion through the global `gtag()` installed in
/// `web/index.html`. Any failure (gtag blocked by an ad blocker, not yet
/// loaded, etc.) is swallowed so conversion tracking can never break onboarding.
void trackConversion(String sendTo) {
  try {
    final params = JSObject()..['send_to'] = sendTo.toJS;
    _gtag('event', 'conversion', params);
  } catch (_) {
    // Intentionally ignored: tracking is best-effort.
  }
}

@JS('gtag')
external void _gtag(String command, String eventName, JSObject params);
