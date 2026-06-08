import 'analytics_device_context_io.dart'
    if (dart.library.html) 'analytics_device_context_web.dart';

/// Device/OS fields to attach to a PostHog person profile on [identify].
class AnalyticsDevicePersonProps {
  const AnalyticsDevicePersonProps({
    required this.set,
    required this.setOnce,
  });

  /// Current device — updated on each identify (e.g. user switches phones).
  final Map<String, Object> set;

  /// First-seen device — written once per person via PostHog `$set_once`.
  final Map<String, Object> setOnce;
}

/// Best-effort device context for person properties. Returns null on failure.
Future<AnalyticsDevicePersonProps?> collectDevicePersonProperties() =>
    collectDevicePersonPropertiesImpl();
