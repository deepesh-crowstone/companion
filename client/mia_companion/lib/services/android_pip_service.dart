import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';

/// Android picture-in-picture entry for ongoing voice calls.
class AndroidPipService {
  AndroidPipService._();

  static const _channel = MethodChannel('com.mia.companion.mia_companion/pip');

  static Future<bool> enter() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      final entered = await _channel.invokeMethod<bool>('enter');
      return entered ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }
}
