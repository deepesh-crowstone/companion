import 'analytics_service.dart';
import 'api_service.dart';

/// Central catalog of product-analytics event names.
///
/// Add a new event here, then fire it with [Analytics.track]. This keeps event
/// names consistent across the Flutter web and Android clients (a typo in an
/// event name silently fragments the data in PostHog), and gives you one place
/// to see everything the app reports.
///
/// Event names follow PostHog's recommended `object_verb` style in snake_case.
abstract final class AnalyticsEvents {
  const AnalyticsEvents._();

  // Acquisition / onboarding
  static const siteExplored = 'site_explored';
  static const startChatting = 'start_chatting_with_zara';
  static const pageViewed = 'page_viewed';

  // Private mode
  static const privateModeUpsellTap = 'private_mode_upsell_tap';
  static const privateModeBannerTap = 'private_mode_banner_tap';
  static const paywallShown = 'paywall_shown';
  static const paywallPayClicked = 'paywall_pay_clicked';
  static const paywallPhotoCollageClicked = 'paywall_photo_collage_clicked';
  static const paywallCloseClicked = 'paywall_close_clicked';
  static const privateModeOn = 'private_mode_on';
  static const privateModeOff = 'private_mode_off';

  // Personalities
  static const personalityUnlockClicked = 'personality_unlock_clicked';
  static const personalityPayClicked = 'personality_pay_clicked';

  // Engagement
  static const callButtonClicked = 'call_button_clicked';
  static const callPreviewStarted = 'call_preview_started';
}

/// Events that may fire before the user authenticates.
///
/// These must also be whitelisted server-side (`ANONYMOUS_EVENTS` in
/// `server/src/routes/events.ts`) and are sent to PostHog without creating a
/// person profile (cheaper, and avoids identifying anonymous traffic).
const Set<String> _anonymousEvents = {
  AnalyticsEvents.siteExplored,
  AnalyticsEvents.pageViewed,
};

/// App-wide analytics entry point.
///
/// [track] fans a single event out to PostHog (web + Android, via
/// [AnalyticsService]) and the backend `/events` store (via
/// [ApiService.trackEvent]). Both destinations are best-effort and never throw,
/// so it is safe to call from anywhere without `await`.
///
/// ```dart
/// Analytics.track(AnalyticsEvents.callButtonClicked);
/// Analytics.track(
///   AnalyticsEvents.siteExplored,
///   properties: {'exploration_type': 'visited'},
/// );
/// ```
abstract final class Analytics {
  const Analytics._();

  /// Records [event]. When [anonymous] is omitted it is inferred from
  /// [_anonymousEvents] so pre-login events stay anonymous automatically.
  static Future<void> track(
    String event, {
    Map<String, Object?>? properties,
    DateTime? eventTime,
    bool? anonymous,
  }) {
    return ApiService.instance.trackEvent(
      event,
      eventTime: eventTime ?? DateTime.now(),
      properties: properties,
      anonymous: anonymous ?? _anonymousEvents.contains(event),
    );
  }

  /// Links subsequent events to a known user. Usually handled automatically by
  /// [ApiService] on login/register; exposed here for completeness.
  static Future<void> identify({
    required int userId,
    required String username,
    bool accountClaimed = false,
  }) {
    return AnalyticsService.instance.identify(
      userId: userId,
      username: username,
      accountClaimed: accountClaimed,
    );
  }

  /// Clears the current identity (call on logout).
  static Future<void> reset() => AnalyticsService.instance.reset();
}
