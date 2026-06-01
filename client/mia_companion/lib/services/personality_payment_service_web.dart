import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'api_service.dart';

const _sdkUrl = 'https://sdk.cashfree.com/js/v3/cashfree.js';

bool _sdkReady = false;
Future<void>? _sdkLoading;

/// Web checkout backed by the Cashfree JS SDK (v3). The native
/// `flutter_cashfree_pg_sdk` plugin's web path is legacy (`dart:html`/`dart:js`)
/// and was previously disabled, so on the web we drive the same Cashfree order
/// through the browser SDK directly using the `paymentSessionId` returned by our
/// backend. The backend order status remains the source of truth.
Future<void> startCheckout({
  required String orderId,
  required String paymentSessionId,
  required String environment,
  required Future<void> Function(String orderId) onVerify,
  required void Function(String message) onError,
}) async {
  try {
    await _ensureSdkLoaded();
  } catch (_) {
    onError('Could not load the payment module. Please try again.');
    return;
  }

  final mode = environment == 'production' ? 'production' : 'sandbox';

  unawaited(
    ApiService.instance.trackEvent(
      'personality_pay_clicked',
      eventTime: DateTime.now(),
    ),
  );

  CashfreeCheckoutResult result;
  try {
    final cashfree = _cashfree(CashfreeInitOptions(mode: mode));
    final promise = cashfree.checkout(
      CashfreeCheckoutOptions(
        paymentSessionId: paymentSessionId,
        redirectTarget: '_modal',
      ),
    );
    result = await promise.toDart;
  } catch (_) {
    onError('Payment could not be started. Please try again.');
    return;
  }

  // The client-side promise is only a hint; the backend order status is the
  // source of truth. Verify whenever the modal reports a completed attempt.
  if (result.paymentDetails != null) {
    try {
      await onVerify(orderId);
    } catch (e) {
      onError(e.toString().replaceFirst('Exception: ', ''));
    }
    return;
  }

  final error = result.error;
  if (error != null) {
    onError(error.message ?? 'Payment cancelled');
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
  external JSPromise<CashfreeCheckoutResult> checkout(
    CashfreeCheckoutOptions options,
  );
}

extension type CashfreeInitOptions._(JSObject _) implements JSObject {
  external factory CashfreeInitOptions({required String mode});
}

extension type CashfreeCheckoutOptions._(JSObject _) implements JSObject {
  external factory CashfreeCheckoutOptions({
    required String paymentSessionId,
    required String redirectTarget,
  });
}

extension type CashfreeCheckoutResult._(JSObject _) implements JSObject {
  external CashfreeCheckoutError? get error;
  external JSAny? get paymentDetails;
}

extension type CashfreeCheckoutError._(JSObject _) implements JSObject {
  external String? get message;
}
