import 'dart:async';

Future<void> startSubscriptionCheckout({
  required String subscriptionId,
  required String subscriptionSessionId,
  required String environment,
  required Future<void> Function(String subscriptionId) onVerify,
  required void Function(String message) onError,
}) async {
  onError('Subscription payments are not supported on this platform.');
}
