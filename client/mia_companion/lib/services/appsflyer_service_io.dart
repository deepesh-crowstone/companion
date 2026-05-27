import 'dart:io';

import 'package:appsflyer_sdk/appsflyer_sdk.dart';
import 'package:flutter/foundation.dart';

import '../config.dart';
import '../models/app_deep_link.dart';
import 'appsflyer_service.dart';

Future<void> initAppsFlyer(AppsFlyerService service) async {
  if (!Platform.isAndroid) return;
  if (appsFlyerDevKey.isEmpty) return;

  final sdk = AppsflyerSdk(
    AppsFlyerOptions(
      afDevKey: appsFlyerDevKey,
      appInviteOneLink:
          appsFlyerOneLinkId.isEmpty ? null : appsFlyerOneLinkId,
      showDebug: kDebugMode,
      manualStart: true,
    ),
  );

  sdk.onDeepLinking((DeepLinkResult result) {
    if (result.status != Status.FOUND) {
      if (kDebugMode) {
        debugPrint('AppsFlyer deep link status: ${result.status}');
      }
      return;
    }

    final deepLink = result.deepLink;
    if (deepLink == null) return;

    final pending = PendingAppDeepLink.fromDeepLinkValue(
      deepLink.deepLinkValue,
      campaign: deepLink.campaign,
      mediaSource: deepLink.mediaSource,
      isDeferred: deepLink.isDeferred ?? false,
    );
    if (pending == null) {
      if (kDebugMode) {
        debugPrint(
          'AppsFlyer deep link ignored: ${deepLink.deepLinkValue ?? deepLink}',
        );
      }
      return;
    }

    if (kDebugMode) {
      debugPrint(
        'AppsFlyer deep link: ${pending.destination.name} '
        '(deferred=${pending.isDeferred}, campaign=${pending.campaign})',
      );
    }
    service.setPendingDeepLink(pending);
  });

  await sdk.initSdk(
    registerConversionDataCallback: true,
    registerOnDeepLinkingCallback: true,
  );

  sdk.startSDK(
    onSuccess: () {
      if (kDebugMode) {
        debugPrint('AppsFlyer SDK initialized');
      }
    },
    onError: (errorCode, errorMessage) {
      if (kDebugMode) {
        debugPrint('AppsFlyer SDK error $errorCode: $errorMessage');
      }
    },
  );
}
