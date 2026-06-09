import 'dart:async';

import 'cotopay_payment_service_stub.dart'
    if (dart.library.js_interop) 'cotopay_payment_service_web.dart'
    if (dart.library.io) 'cotopay_payment_service_native.dart'
    as platform;

typedef SubscriptionVerifyCallback = Future<void> Function(
  String subscriptionId,
);

/// Cashfree subscription (autopay) checkout for private-mode mandate setup.
class CotopayPaymentService {
  CotopayPaymentService._();
  static final instance = CotopayPaymentService._();

  /// Starts mandate authorisation checkout (₹1 trial, ₹199 recurring from day 2).
  ///
  /// On mobile this uses the native Cashfree SDK; on web it uses
  /// `subscriptionsCheckout` from the Cashfree JS SDK.
  Future<void> startSubscriptionCheckout({
    required String subscriptionId,
    required String subscriptionSessionId,
    required String environment,
    required SubscriptionVerifyCallback onVerify,
    required void Function(String message) onError,
  }) {
    return platform.startSubscriptionCheckout(
      subscriptionId: subscriptionId,
      subscriptionSessionId: subscriptionSessionId,
      environment: environment,
      onVerify: onVerify,
      onError: onError,
    );
  }
}
