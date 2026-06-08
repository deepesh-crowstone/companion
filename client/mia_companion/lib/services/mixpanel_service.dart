import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:mixpanel_flutter/mixpanel_flutter.dart';

import '../config.dart';
import 'analytics_device_context.dart';

/// Product analytics via Mixpanel. Failures are swallowed so UI is never blocked.
class MixpanelService {
  MixpanelService._();

  static final MixpanelService instance = MixpanelService._();

  Mixpanel? _client;

  bool get isEnabled => mixpanelToken.isNotEmpty;

  Future<void> init() async {
    if (!isEnabled || _client != null) return;

    try {
      final client = await Mixpanel.init(
        mixpanelToken,
        trackAutomaticEvents: false,
      );
      if (kDebugMode) {
        client.setLoggingEnabled(true);
      }
      client.registerSuperProperties({'platform': kIsWeb ? 'web' : 'android'});
      _client = client;
    } catch (_) {
      // Analytics should never interrupt the user flow.
    }
  }

  Future<void> identify({
    required int userId,
    required String username,
    bool accountClaimed = false,
  }) async {
    final client = _client;
    if (client == null) return;

    try {
      await client.identify(userId.toString());
      final people = client.getPeople();
      people
        ..set('username', username)
        ..set('account_type', accountClaimed ? 'claimed' : 'guest');

      final device = await collectDevicePersonProperties();
      if (device != null) {
        for (final entry in device.set.entries) {
          people.set(entry.key, entry.value);
        }
        for (final entry in device.setOnce.entries) {
          people.setOnce(entry.key, entry.value);
        }
      }
    } catch (_) {}
  }

  Future<void> reset() async {
    final client = _client;
    if (client == null) return;

    try {
      await client.reset();
    } catch (_) {}
  }

  Future<void> capture(
    String eventName, {
    Map<String, Object?>? properties,
  }) async {
    final client = _client;
    if (client == null) return;

    try {
      final props = _sanitizeProperties(properties);
      await client.track(
        eventName,
        properties: props.isEmpty ? null : props,
      );
    } catch (_) {}
  }

  Map<String, dynamic> _sanitizeProperties(Map<String, Object?>? properties) {
    final props = <String, dynamic>{};
    if (properties == null) return props;

    for (final entry in properties.entries) {
      final value = entry.value;
      if (value == null) continue;
      if (value is String || value is num || value is bool) {
        props[entry.key] = value;
      } else {
        props[entry.key] = value.toString();
      }
    }
    return props;
  }
}
