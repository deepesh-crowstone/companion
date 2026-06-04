/// Client-side validation aligned with server auth rules.
class AccountAuthValidation {
  static String? usernameError(String username) {
    final trimmed = username.trim();
    if (trimmed.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (trimmed.length > 32) {
      return 'Username must be 32 characters or fewer';
    }
    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(trimmed)) {
      return 'Use letters, numbers, and underscores only';
    }
    return null;
  }

  static String? passwordError(String password) {
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  static String friendlyAuthError(Object error) {
    final msg = error.toString().replaceFirst('Exception: ', '');
    if (msg.contains('Username already taken')) {
      return 'That username is taken — try another';
    }
    if (msg.contains('Invalid username or password')) {
      return 'Wrong username or password';
    }
    return msg;
  }
}
