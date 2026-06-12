import 'package:flutter/material.dart';

import '../services/api_service.dart';
import 'disappearing_messages_controller.dart';
import 'private_mode_controller.dart';
import 'push_notification_service.dart';

typedef SessionResetHandler = Future<void> Function();

/// Bridges profile actions back to the app root bootstrap state.
class SessionReset {
  SessionReset._();

  static SessionResetHandler? onLogout;
  static SessionResetHandler? onDeleteAccount;

  static Future<void> logout(BuildContext context) async {
    await PushNotificationService.instance.unregisterFromServer();
    await ApiService.instance.logout();
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
    await onLogout?.call();
  }

  static Future<void> deleteAccount(BuildContext context) async {
    await PushNotificationService.instance.unregisterFromServer();
    await ApiService.instance.clearLocalAccountData();
    await DisappearingMessagesController.instance.clearPermanentHidden();
    PrivateModeController.instance.clear();
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
    await onDeleteAccount?.call();
  }
}
