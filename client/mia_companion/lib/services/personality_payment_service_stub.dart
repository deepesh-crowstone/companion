import 'dart:async';

Future<void> startCheckout({
  required String orderId,
  required String paymentSessionId,
  required String environment,
  required Future<void> Function(String orderId) onVerify,
  required void Function(String message) onError,
}) async {
  onError('Payments are not supported on this platform.');
}
