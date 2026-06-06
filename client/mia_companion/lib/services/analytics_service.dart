import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:posthog_flutter/posthog_flutter.dart';

import '../config.dart';
import 'posthog_bootstrap_web.dart'
    if (dart.library.io) 'posthog_bootstrap_stub.dart';

/// Product analytics via PostHog. Failures are swallowed so UI is never blocked.
class AnalyticsService {
  AnalyticsService._();

  static final AnalyticsService instance = AnalyticsService._();

  bool _ready = false;

  bool get isEnabled => posthogApiKey.isNotEmpty;

  Future<void> init() async {
    if (!isEnabled || _ready) return;

    try {
      // On web the plugin's setup() is a no-op; posthog-js must be initialized
      // directly (against the loader stub in web/index.html) before any call.
      if (kIsWeb) {
        initPosthogWeb(
          apiKey: posthogApiKey,
          host: posthogHost,
          proxyPath: posthogWebProxyPath,
        );
      }

      final config = PostHogConfig(posthogApiKey);
      config.host = posthogHost;
      config.debug = kDebugMode;
      config.captureApplicationLifecycleEvents = true;
      config.personProfiles = PostHogPersonProfiles.identifiedOnly;

      await Posthog().setup(config);
      await Posthog().register('platform', kIsWeb ? 'web' : 'android');
      _ready = true;
    } catch (_) {
      // Analytics should never interrupt the user flow.
    }
  }

  Future<void> identify({
    required int userId,
    required String username,
    bool accountClaimed = false,
  }) async {
    if (!_ready) return;

    try {
      await Posthog().identify(
        userId: userId.toString(),
        userProperties: {
          'username': username,
          'account_type': accountClaimed ? 'claimed' : 'guest',
        },
      );
    } catch (_) {}
  }

  Future<void> reset() async {
    if (!_ready) return;

    try {
      await Posthog().reset();
    } catch (_) {}
  }

  Future<void> capture(
    String eventName, {
    Map<String, Object?>? properties,
    bool anonymous = false,
  }) async {
    if (!_ready) return;

    try {
      final props = <String, Object>{};
      if (properties != null) {
        for (final entry in properties.entries) {
          final value = entry.value;
          if (value == null) continue;
          if (value is String || value is num || value is bool) {
            props[entry.key] = value;
          } else {
            props[entry.key] = value.toString();
          }
        }
      }
      if (anonymous) {
        props[r'$process_person_profile'] = false;
      }

      await Posthog().capture(
        eventName: eventName,
        properties: props.isEmpty ? null : props,
      );
    } catch (_) {}
  }
}
