/// Thrown when the server rejects the stored JWT (restart, secret change, expiry).
class SessionExpiredException implements Exception {
  SessionExpiredException([this.message = 'Session expired. Please log in again.']);
  final String message;

  @override
  String toString() => message;
}
