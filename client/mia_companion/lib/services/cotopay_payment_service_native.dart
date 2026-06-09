import 'dart:async';

import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfsubscriptioncheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsubssession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

import 'analytics.dart';

final _gateway = CFPaymentGatewayService();

Future<void> startSubscriptionCheckout({
  required String subscriptionId,
  required String subscriptionSessionId,
  required String environment,
  required Future<void> Function(String subscriptionId) onVerify,
  required void Function(String message) onError,
}) async {
  final completer = Completer<void>();

  _gateway.setCallback((verifiedSubscriptionId) async {
    try {
      await onVerify(verifiedSubscriptionId);
      if (!completer.isCompleted) completer.complete();
    } catch (e) {
      if (!completer.isCompleted) {
        completer.completeError(e);
      }
      onError(e.toString());
    }
  }, (errorResponse, _) {
    final message = errorResponse.getMessage() ?? 'Payment cancelled';
    onError(message);
    if (!completer.isCompleted) {
      completer.completeError(Exception(message));
    }
  });

  try {
    final cfEnv = environment == 'production'
        ? CFEnvironment.PRODUCTION
        : CFEnvironment.SANDBOX;

    final session = CFSubscriptionSessionBuilder()
        .setEnvironment(cfEnv)
        .setSubscriptionId(subscriptionId)
        .setSubscriptionSessionId(subscriptionSessionId)
        .build();

    final checkout =
        CFSubscriptionPaymentBuilder().setSession(session).build();

    _gateway.doPayment(checkout);
    unawaited(Analytics.track(AnalyticsEvents.paywallPayClicked));
    await completer.future;
  } on CFException catch (e) {
    onError(e.message);
    rethrow;
  }
}
