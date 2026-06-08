import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';

import 'analytics_device_context.dart';

Future<AnalyticsDevicePersonProps?> collectDevicePersonPropertiesImpl() async {
  if (!Platform.isAndroid) return null;

  try {
    final info = await DeviceInfoPlugin().androidInfo;
    final set = <String, Object>{
      r'$device_manufacturer': info.manufacturer,
      r'$device_model': info.model,
      r'$device_name': info.device,
      r'$device_type': 'Mobile',
      r'$os_name': 'Android',
      r'$os_version': info.version.release,
      r'$is_emulator': !info.isPhysicalDevice,
    };

    return AnalyticsDevicePersonProps(
      set: set,
      setOnce: {
        r'$initial_device_manufacturer': info.manufacturer,
        r'$initial_device_model': info.model,
        r'$initial_device_name': info.device,
        r'$initial_os_name': 'Android',
        r'$initial_os_version': info.version.release,
      },
    );
  } catch (_) {
    return null;
  }
}
