import 'ads_conversion_service_web.dart'
    if (dart.library.io) 'ads_conversion_service_stub.dart' as platform;

/// Mirrors high-intent activation events to Google Ads as conversions so
/// campaign bidding optimizes toward real users instead of raw page views.
///
/// Web only: the Google tag (`gtag.js`) lives in `web/index.html`. On mobile
/// every call is a no-op via the conditional-import stub.
class AdsConversionService {
  AdsConversionService._();
  static final instance = AdsConversionService._();

  /// Conversion label for the "start chatting" activation, from Google Ads
  /// (Goals -> Conversions -> "Start chatting", a manual Sign-up event).
  ///
  /// Set to an empty string to disable conversion reporting (ships inert).
  static const startChattingSendTo = 'AW-18203322848/l0QyCKu8kLccEODTguhD';

  /// Reports `start_chatting_with_zara` as a Google Ads conversion.
  /// No-op on mobile and whenever [startChattingSendTo] is unset.
  void trackStartChatting() {
    if (startChattingSendTo.isEmpty) return;
    platform.trackConversion(startChattingSendTo);
  }
}
