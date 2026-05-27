import 'package:flutter/foundation.dart';

import '../models/app_deep_link.dart';
import 'appsflyer_service_stub.dart'
    if (dart.library.io) 'appsflyer_service_io.dart';

class AppsFlyerService {
  AppsFlyerService._();

  static final instance = AppsFlyerService._();

  final pendingDeepLink = ValueNotifier<PendingAppDeepLink?>(null);

  Future<void> init() => initAppsFlyer(this);

  void setPendingDeepLink(PendingAppDeepLink link) {
    pendingDeepLink.value = link;
  }

  void clearPendingDeepLink() {
    pendingDeepLink.value = null;
  }
}
