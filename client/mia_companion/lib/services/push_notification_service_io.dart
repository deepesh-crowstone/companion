import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'api_service.dart';
import 'push_notification_service.dart';

String? _cachedToken;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (DefaultFirebaseOptions.isConfigured) {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } else {
    await Firebase.initializeApp();
  }
}

Future<void> initPushNotifications(PushNotificationService service) async {
  if (!Platform.isAndroid) return;

  try {
    if (DefaultFirebaseOptions.isConfigured) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    } else {
      await Firebase.initializeApp();
    }
  } catch (e) {
    if (kDebugMode) {
      debugPrint(
        'Push notifications skipped: Firebase init failed ($e). '
        'Add android/app/google-services.json from Firebase Console.',
      );
    }
    return;
  }

  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  final messaging = FirebaseMessaging.instance;
  await messaging.setForegroundNotificationPresentationOptions(
    alert: true,
    badge: true,
    sound: true,
  );

  final settings = await messaging.requestPermission();
  if (settings.authorizationStatus == AuthorizationStatus.denied) {
    if (kDebugMode) {
      debugPrint('Push notifications denied by user.');
    }
    return;
  }

  FirebaseMessaging.onMessageOpenedApp.listen((_) {
    service.markOpenedFromNotification();
  });

  final initialMessage = await messaging.getInitialMessage();
  if (initialMessage != null) {
    service.markOpenedFromNotification();
  }

  messaging.onTokenRefresh.listen((token) {
    _cachedToken = token;
    syncPushTokenWithServer(service);
  });

  _cachedToken = await messaging.getToken();
  if (kDebugMode && _cachedToken != null) {
    debugPrint('FCM token ready');
  }
}

Future<void> syncPushTokenWithServer(PushNotificationService service) async {
  if (!Platform.isAndroid) return;

  final token = _cachedToken ?? await FirebaseMessaging.instance.getToken();
  if (token == null || token.isEmpty) return;
  _cachedToken = token;

  if (!ApiService.instance.isLoggedIn) return;

  try {
    await ApiService.instance.registerPushToken(token);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('Failed to register push token: $e');
    }
  }
}

Future<void> unregisterPushTokenFromServer(
  PushNotificationService service,
) async {
  if (!Platform.isAndroid) return;

  final token = _cachedToken ?? await FirebaseMessaging.instance.getToken();
  if (token == null || token.isEmpty) return;

  try {
    await ApiService.instance.unregisterPushToken(token);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('Failed to unregister push token: $e');
    }
  }
}
