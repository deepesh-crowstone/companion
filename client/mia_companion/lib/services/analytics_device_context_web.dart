import 'package:device_info_plus/device_info_plus.dart';

import 'analytics_device_context.dart';

Future<AnalyticsDevicePersonProps?> collectDevicePersonPropertiesImpl() async {
  try {
    final info = await DeviceInfoPlugin().webBrowserInfo;
    final userAgent = info.userAgent ?? '';
    final deviceType = _deviceTypeFromUserAgent(userAgent);

    final set = <String, Object>{
      r'$device_type': deviceType,
      r'$os_name': info.platform ?? 'Web',
      if (info.browserName.name.isNotEmpty) r'$browser': info.browserName.name,
    };

    return AnalyticsDevicePersonProps(
      set: set,
      setOnce: {
        r'$initial_device_type': deviceType,
        r'$initial_os_name': info.platform ?? 'Web',
        if (info.browserName.name.isNotEmpty)
          r'$initial_browser': info.browserName.name,
      },
    );
  } catch (_) {
    return null;
  }
}

String _deviceTypeFromUserAgent(String userAgent) {
  final ua = userAgent.toLowerCase();
  if (ua.contains('ipad') || ua.contains('tablet')) return 'Tablet';
  if (ua.contains('mobile') || ua.contains('iphone') || ua.contains('android')) {
    return 'Mobile';
  }
  return 'Desktop';
}
