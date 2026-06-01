import 'dart:async';

import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

import 'api_service.dart';

final _gateway = CFPaymentGatewayService();

Future<void> startCheckout({
  required String orderId,
  required String paymentSessionId,
  required String environment,
  required Future<void> Function(String orderId) onVerify,
  required void Function(String message) onError,
}) async {
  final completer = Completer<void>();

  _gateway.setCallback((verifiedOrderId) async {
    try {
      await onVerify(verifiedOrderId);
      if (!completer.isCompleted) completer.complete();
    } catch (e) {
      if (!completer.isCompleted) {
        completer.completeError(e);
      }
      onError(e.toString());
    }
  }, (errorResponse, failedOrderId) {
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

    final session = CFSessionBuilder()
        .setEnvironment(cfEnv)
        .setOrderId(orderId)
        .setPaymentSessionId(paymentSessionId)
        .build();

    final checkout = CFWebCheckoutPaymentBuilder().setSession(session).build();

    _gateway.doPayment(checkout);
    unawaited(
      ApiService.instance.trackEvent(
        'personality_pay_clicked',
        eventTime: DateTime.now(),
      ),
    );
    await completer.future;
  } on CFException catch (e) {
    onError(e.message);
    rethrow;
  }
}
