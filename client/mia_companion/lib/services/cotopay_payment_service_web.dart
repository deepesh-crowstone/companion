import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'analytics.dart';

const _sdkUrl = 'https://sdk.cashfree.com/js/v3/cashfree.js';

bool _sdkReady = false;
Future<void>? _sdkLoading;

/// Web subscription checkout via Cashfree JS SDK `subscriptionsCheckout`.
/// Backend subscription status remains the source of truth.
Future<void> startSubscriptionCheckout({
  required String subscriptionId,
  required String subscriptionSessionId,
  required String environment,
  required Future<void> Function(String subscriptionId) onVerify,
  required void Function(String message) onError,
}) async {
  try {
    await _ensureSdkLoaded();
  } catch (_) {
    onError('Could not load the payment module. Please try again.');
    return;
  }

  final mode = environment == 'production' ? 'production' : 'sandbox';

  unawaited(Analytics.track(AnalyticsEvents.paywallPayClicked));

  CashfreeSubscriptionCheckoutResult result;
  try {
    final cashfree = _cashfree(CashfreeInitOptions(mode: mode));
    final promise = cashfree.subscriptionsCheckout(
      CashfreeSubscriptionCheckoutOptions(
        subsSessionId: subscriptionSessionId,
        redirectTarget: '_modal',
      ),
    );
    result = await promise.toDart;
  } catch (_) {
    onError('Payment could not be started. Please try again.');
    return;
  }

  final error = result.error;
  if (error != null) {
    onError(error.message ?? 'Payment cancelled');
    return;
  }

  // The modal promise is only a hint; verify against the backend.
  if (result.paymentDetails != null || result.subscriptionDetails != null) {
    try {
      await onVerify(subscriptionId);
    } catch (e) {
      onError(e.toString().replaceFirst('Exception: ', ''));
    }
    return;
  }

  onError('Payment cancelled');
}

Future<void> _ensureSdkLoaded() {
  if (_sdkReady) return Future<void>.value();
  final pending = _sdkLoading;
  if (pending != null) return pending;

  final completer = Completer<void>();
  _sdkLoading = completer.future;

  final script = web.HTMLScriptElement()
    ..src = _sdkUrl
    ..async = true;

  script.addEventListener(
    'load',
    (web.Event _) {
      _sdkReady = true;
      if (!completer.isCompleted) completer.complete();
    }.toJS,
  );
  script.addEventListener(
    'error',
    (web.Event _) {
      _sdkLoading = null;
      if (!completer.isCompleted) {
        completer.completeError(StateError('Failed to load Cashfree SDK'));
      }
    }.toJS,
  );

  web.document.head!.appendChild(script);
  return completer.future;
}

@JS('Cashfree')
external CashfreeSdk _cashfree(CashfreeInitOptions options);

extension type CashfreeSdk._(JSObject _) implements JSObject {
  external JSPromise<CashfreeSubscriptionCheckoutResult> subscriptionsCheckout(
    CashfreeSubscriptionCheckoutOptions options,
  );
}

extension type CashfreeInitOptions._(JSObject _) implements JSObject {
  external factory CashfreeInitOptions({required String mode});
}

extension type CashfreeSubscriptionCheckoutOptions._(JSObject _)
    implements JSObject {
  external factory CashfreeSubscriptionCheckoutOptions({
    required String subsSessionId,
    required String redirectTarget,
  });
}

extension type CashfreeSubscriptionCheckoutResult._(JSObject _)
    implements JSObject {
  external CashfreeCheckoutError? get error;
  external JSAny? get paymentDetails;
  external JSAny? get subscriptionDetails;
}

extension type CashfreeCheckoutError._(JSObject _) implements JSObject {
  external String? get message;
}
