import 'dart:async';

import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:posthog_flutter/posthog_flutter.dart';

import '../config.dart';
import 'analytics_device_context.dart';
import 'mixpanel_service.dart';
import 'posthog_bootstrap_web.dart'
    if (dart.library.io) 'posthog_bootstrap_stub.dart';

/// Product analytics via PostHog and Mixpanel. Failures are swallowed so UI is
/// never blocked.
class AnalyticsService {
  AnalyticsService._();

  static final AnalyticsService instance = AnalyticsService._();

  bool _ready = false;

  bool get isEnabled => posthogApiKey.isNotEmpty;

  Future<void> init() async {
    await MixpanelService.instance.init();

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
    if (_ready) {
      try {
        final device = await collectDevicePersonProperties();
        await Posthog().identify(
          userId: userId.toString(),
          userProperties: {
            'username': username,
            'account_type': accountClaimed ? 'claimed' : 'guest',
            ...?device?.set,
          },
          userPropertiesSetOnce: device?.setOnce,
        );
      } catch (_) {}
    }

    unawaited(
      MixpanelService.instance.identify(
        userId: userId,
        username: username,
        accountClaimed: accountClaimed,
      ),
    );
  }

  Future<void> reset() async {
    if (_ready) {
      try {
        await Posthog().reset();
      } catch (_) {}
    }

    unawaited(MixpanelService.instance.reset());
  }

  Future<void> capture(
    String eventName, {
    Map<String, Object?>? properties,
    bool anonymous = false,
  }) async {
    if (_ready) {
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

    unawaited(
      MixpanelService.instance.capture(
        eventName,
        properties: properties,
      ),
    );
  }
}
