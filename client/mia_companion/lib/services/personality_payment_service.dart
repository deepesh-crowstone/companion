import 'dart:async';

import 'personality_payment_service_stub.dart'
    if (dart.library.js_interop) 'personality_payment_service_web.dart'
    if (dart.library.io) 'personality_payment_service_native.dart'
    as platform;

typedef PaymentVerifyCallback = Future<void> Function(String orderId);

class PersonalityPaymentService {
  PersonalityPaymentService._();
  static final instance = PersonalityPaymentService._();

  /// Starts the personality pass checkout for the given Cashfree order.
  ///
  /// On mobile this drives the native Cashfree SDK; on web it falls back to the
  /// Cashfree JS SDK using the same [paymentSessionId]. Either way [onVerify] is
  /// invoked once the gateway reports a completed attempt so the backend can be
  /// asked for the authoritative payment status.
  Future<void> startCheckout({
    required String orderId,
    required String paymentSessionId,
    required String environment,
    required PaymentVerifyCallback onVerify,
    required void Function(String message) onError,
  }) {
    return platform.startCheckout(
      orderId: orderId,
      paymentSessionId: paymentSessionId,
      environment: environment,
      onVerify: onVerify,
      onError: onError,
    );
  }
}
