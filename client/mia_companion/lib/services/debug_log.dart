// #region agent log
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class DebugLog {
  static const String _endpoint =
      'http://localhost:7882/ingest/7f9db260-5ba3-44d5-b5b3-f16d55ba1869';
  static const String _sessionId = '020a15';

  static void send({
    required String location,
    required String message,
    required String hypothesisId,
    Map<String, dynamic>? data,
  }) {
    unawaited(_post(location: location, message: message, hypothesisId: hypothesisId, data: data));
  }

  static Future<void> _post({
    required String location,
    required String message,
    required String hypothesisId,
    Map<String, dynamic>? data,
  }) async {
    try {
      await http
          .post(
            Uri.parse(_endpoint),
            headers: {
              'Content-Type': 'application/json',
              'X-Debug-Session-Id': _sessionId,
            },
            body: jsonEncode({
              'sessionId': _sessionId,
              'runId': 'voice-call',
              'hypothesisId': hypothesisId,
              'location': location,
              'message': message,
              'data': data ?? {},
              'timestamp': DateTime.now().millisecondsSinceEpoch,
            }),
          )
          .timeout(const Duration(seconds: 2));
    } catch (_) {
      // ignore network failures
    }
  }
}
// #endregion
