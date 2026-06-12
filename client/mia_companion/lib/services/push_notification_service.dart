import 'package:flutter/foundation.dart';

import 'push_notification_service_stub.dart'
    if (dart.library.io) 'push_notification_service_io.dart';

class PushNotificationService {
  PushNotificationService._();

  static final instance = PushNotificationService._();

  final openedFromNotification = ValueNotifier<bool>(false);

  Future<void> init() => initPushNotifications(this);

  Future<void> syncWithServer() => syncPushTokenWithServer(this);

  Future<void> unregisterFromServer() => unregisterPushTokenFromServer(this);

  void markOpenedFromNotification() {
    openedFromNotification.value = true;
  }

  void clearOpenedFromNotification() {
    openedFromNotification.value = false;
  }
}
