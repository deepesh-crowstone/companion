import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/chat_message.dart';
import '../models/personality_access.dart';
import '../models/private_mode_access.dart';
import '../models/zara_mood.dart';
import '../models/voice_upload.dart';
import 'session_expired.dart';
import 'http_client_factory.dart';

class ApiService {
  ApiService._() : _client = createHttpClient();
  static final ApiService instance = ApiService._();

  static const _tokenKey = 'mia_auth_token';
  static const _usernameKey = 'mia_username';
  static const _guestPasswordKey = 'mia_guest_password';
  static const _accountClaimedKey = 'mia_account_claimed';
  static const _credentialsRequiredKey = 'mia_credentials_required';
  static const _startedChattingKey = 'mia_started_chatting';
  static const _guestAdjectives = [
    'happy',
    'lucky',
    'calm',
    'swift',
    'bold',
    'keen',
    'warm',
    'bright',
  ];
  static const _guestNouns = [
    'fox',
    'owl',
    'star',
    'wave',
    'leaf',
    'moon',
    'dawn',
    'spark',
  ];
  static const _timeout = Duration(seconds: 30);
  // Text replies wait on the LLM, which can take well over the default 30s.
  static const _replyTimeout = Duration(seconds: 90);
  static const _voiceTimeout = Duration(seconds: 90);
  static const _healthTimeout = Duration(seconds: 45);

  final http.Client _client;

  String? _token;
  String? _username;

  String? get token => _token;
  String? get username => _username;
  bool get isLoggedIn => _token != null;

  Future<void> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    _username = prefs.getString(_usernameKey);
  }

  Future<void> _saveSession(String token, String username) async {
    _token = token;
    _username = username;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_usernameKey, username);
  }

  Future<void> logout() async {
    _token = null;
    _username = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_usernameKey);
  }

  /// Whether the user chose a username/password (after unlock or login).
  Future<bool> hasClaimedAccount() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_accountClaimedKey) ?? false;
  }

  /// Marks this device as using a real account (not auto-guest).
  Future<void> markAccountClaimed() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_accountClaimedKey, true);
    await prefs.remove(_guestPasswordKey);
    await prefs.remove(_credentialsRequiredKey);
  }

  /// After personality unlock, user must choose credentials before using the app.
  Future<void> requireAccountCredentials() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_credentialsRequiredKey, true);
  }

  /// True when the user still owes a self-chosen username/password.
  Future<bool> needsAccountCredentials() async {
    if (await hasClaimedAccount()) return false;
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_credentialsRequiredKey) ?? false;
  }

  /// Clears all local account/session data (logout + guest creds + welcome flag).
  Future<void> clearLocalAccountData() async {
    await logout();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_guestPasswordKey);
    await prefs.remove(_accountClaimedKey);
    await prefs.remove(_credentialsRequiredKey);
    await prefs.remove(_startedChattingKey);
  }

  static const userConnectionErrorMessage =
      "Can't connect to Zara right now. Check your internet connection and try again.";

  static bool isConnectionFailure(String message) {
    return message.contains('Cannot reach server') ||
        message.contains('Connection timed out') ||
        message.contains('SocketException') ||
        message.contains(userConnectionErrorMessage);
  }

  static String friendlyErrorMessage(Object error) {
    final msg = error.toString().replaceFirst('Exception: ', '');
    if (isConnectionFailure(msg)) return userConnectionErrorMessage;
    return msg;
  }

  /// Ensures a valid session exists, registering a guest user in the background if needed.
  Future<void> ensureAuthenticated() async {
    await loadSession();
    if (isLoggedIn && await validateSession()) return;

    if (await hasClaimedAccount()) {
      throw Exception('Please log in to continue.');
    }

    if (await needsAccountCredentials()) {
      if (isLoggedIn && await validateSession()) return;
      throw Exception('Please save your account to continue.');
    }

    final prefs = await SharedPreferences.getInstance();
    final storedUsername = prefs.getString(_usernameKey);
    final storedPassword = prefs.getString(_guestPasswordKey);
    if (storedUsername != null && storedPassword != null) {
      try {
        await login(storedUsername, storedPassword);
        if (await validateSession()) return;
      } catch (_) {
        // Fall through to fresh guest registration.
      }
    }

    for (var attempt = 0; attempt < 5; attempt++) {
      final username = _generateGuestUsername();
      final password = _generateGuestPassword();
      try {
        await register(username, password);
        await prefs.setString(_guestPasswordKey, password);
        return;
      } catch (e) {
        final msg = e.toString();
        if (!msg.contains('already taken') || attempt == 4) rethrow;
      }
    }
  }

  String _generateGuestUsername() {
    final random = Random();
    final adjective = _guestAdjectives[random.nextInt(_guestAdjectives.length)];
    final noun = _guestNouns[random.nextInt(_guestNouns.length)];
    final suffix = random.nextInt(9000) + 1000;
    return '${adjective}_$noun$suffix';
  }

  String _generateGuestPassword() {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final random = Random.secure();
    return List.generate(16, (_) => chars[random.nextInt(chars.length)]).join();
  }

  /// Returns false and clears storage if the saved token is no longer valid.
  Future<bool> validateSession() async {
    if (_token == null) return false;
    try {
      final res = await _get(
        Uri.parse('$resolvedApiBaseUrl/auth/me'),
        headers: _authHeaders,
      );
      if (res.statusCode == 401) {
        await logout();
        return false;
      }
      return res.statusCode == 200;
    } on SessionExpiredException {
      return false;
    } catch (_) {
      // Don't skip to chat when the server is unreachable.
      return await checkHealth();
    }
  }

  /// Quick check that the phone can reach the backend.
  Future<bool> checkHealth() async {
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        final res = await _client
            .get(Uri.parse('$resolvedApiBaseUrl/health'))
            .timeout(_healthTimeout);
        if (res.statusCode == 200) return true;
      } catch (_) {
        if (attempt == 0) {
          await Future<void>.delayed(const Duration(milliseconds: 800));
        }
      }
    }
    return false;
  }

  Map<String, String> get _authHeaders => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> register(
    String username,
    String password,
  ) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    return _handleAuthResponse(res);
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    final body = await _handleAuthResponse(res);
    await markAccountClaimed();
    return body;
  }

  /// Replaces the auto-generated guest username with a chosen one.
  Future<Map<String, dynamic>> setCredentials(
    String username,
    String password,
  ) async {
    final res = await _patch(
      Uri.parse('$resolvedApiBaseUrl/auth/credentials'),
      headers: _authHeaders,
      body: jsonEncode({'username': username, 'password': password}),
    );
    _guardAuth(res);
    final body = await _handleAuthResponse(res);
    await markAccountClaimed();
    return body;
  }

  Future<Map<String, dynamic>> _handleAuthResponse(http.Response res) async {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw Exception(body['error'] ?? 'Authentication failed');
    }
    await _saveSession(
      body['token'] as String,
      (body['user'] as Map)['username'] as String,
    );
    return body;
  }

  Future<List<ChatMessage>> fetchMessages() async {
    final res = await _get(
      Uri.parse('$resolvedApiBaseUrl/messages'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final list = data['messages'] as List<dynamic>;
    return list
        .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<
    ({ChatMessage user, ChatMessage assistant, List<ChatMessage> assistants})
  >
  sendText(String text, {ZaraMood? mood}) async {
    final batch = await sendTextBatch([text], mood: mood);
    return (
      user: batch.users.last,
      assistant: batch.assistant,
      assistants: batch.assistants,
    );
  }

  Future<
    ({
      List<ChatMessage> users,
      ChatMessage assistant,
      List<ChatMessage> assistants,
    })
  >
  sendTextBatch(List<String> texts, {ZaraMood? mood}) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/messages/text/batch'),
      headers: _authHeaders,
      body: jsonEncode({
        'texts': texts,
        if (mood != null) 'mood': mood.serverValue,
      }),
      timeout: _replyTimeout,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final userList = data['userMessages'] as List<dynamic>;
    final assistantList = data['assistantMessages'] as List<dynamic>?;
    final assistants = assistantList != null && assistantList.isNotEmpty
        ? assistantList
              .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
              .toList()
        : [
            ChatMessage.fromJson(
              data['assistantMessage'] as Map<String, dynamic>,
            ),
          ];
    return (
      users: userList
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      assistant: ChatMessage.fromJson(
        data['assistantMessage'] as Map<String, dynamic>,
      ),
      assistants: assistants,
    );
  }

  Future<({ChatMessage user, ChatMessage assistant})> sendVoice(VoiceUpload audio, {ZaraMood? mood}) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$resolvedApiBaseUrl/messages/voice'),
    );
    request.headers['Authorization'] = 'Bearer $_token';
    if (mood != null) {
      request.fields['mood'] = mood.serverValue;
    }
    final contentType = MediaType.parse(audio.mimeType);
    final bytes = audio.bytes;
    if (bytes != null) {
      request.files.add(
        http.MultipartFile.fromBytes(
          'audio',
          bytes,
          filename: audio.filename,
          contentType: contentType,
        ),
      );
    } else {
      request.files.add(
        await http.MultipartFile.fromPath(
          'audio',
          audio.filePath!,
          filename: audio.filename,
          contentType: contentType,
        ),
      );
    }

    try {
      final streamed = await request.send().timeout(_voiceTimeout);
      final res = await http.Response.fromStream(streamed);
      _guardAuth(res);
      if (res.statusCode >= 400) {
        throw Exception(_errorFrom(res));
      }
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      return (
        user: ChatMessage.fromJson(data['userMessage'] as Map<String, dynamic>),
        assistant: ChatMessage.fromJson(
          data['assistantMessage'] as Map<String, dynamic>,
        ),
      );
    } on TimeoutException {
      throw Exception(_connectionError());
    } on http.ClientException catch (e) {
      throw Exception(_connectionError(detail: e.message));
    }
  }

  Future<PersonalityAccess> fetchPersonalityAccess() async {
    final res = await _get(
      Uri.parse('$resolvedApiBaseUrl/personalities/status'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PersonalityAccess.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<PersonalityPaymentOrder> createPersonalityOrder() async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/personalities/orders'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PersonalityPaymentOrder.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<PrivateModeAccess> fetchPrivateModeAccess() async {
    final res = await _get(
      Uri.parse('$resolvedApiBaseUrl/private-mode/status'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PrivateModeAccess.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<PrivateModePaymentOrder> createPrivateModeOrder() async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/private-mode/orders'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PrivateModePaymentOrder.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<PrivateModeVerifyResult> verifyPrivateModeOrder(String orderId) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/private-mode/orders/$orderId/verify'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PrivateModeVerifyResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  Future<void> setUserAge(int age) async {
    final res = await _patch(
      Uri.parse('$resolvedApiBaseUrl/private-mode/age'),
      headers: _authHeaders,
      body: jsonEncode({'age': age}),
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
  }

  Future<PrivateModeAccess> enterPrivateMode() async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/private-mode/enter'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return fetchPrivateModeAccess();
  }

  Future<({PrivateModeAccess access, int deletedMessageCount})> exitPrivateMode() async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/private-mode/exit'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final access = await fetchPrivateModeAccess();
    return (
      access: access,
      deletedMessageCount: body['deletedMessageCount'] as int? ?? 0,
    );
  }

  Future<PersonalityVerifyResult> verifyPersonalityOrder(String orderId) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/personalities/orders/$orderId/verify'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return PersonalityVerifyResult.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  /// Records a product analytics event. Failures are swallowed so UI is not blocked.
  Future<void> trackEvent(
    String eventName, {
    DateTime? eventTime,
    Map<String, Object?>? properties,
    bool anonymous = false,
  }) async {
    try {
      final res = await _post(
        Uri.parse('$resolvedApiBaseUrl/events'),
        headers: anonymous
            ? const {'Content-Type': 'application/json'}
            : _authHeaders,
        body: jsonEncode({
          'eventName': eventName,
          if (eventTime != null)
            'eventTime': eventTime.toUtc().toIso8601String(),
          if (properties != null && properties.isNotEmpty)
            'eventProperties': properties,
        }),
      );
      if (!anonymous && res.statusCode == 401) {
        await logout();
      }
    } catch (_) {
      // Analytics should never interrupt the user flow.
    }
  }

  Future<Map<String, dynamic>> createRealtimeSession() async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/realtime/session'),
      headers: _authHeaders,
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  void _guardAuth(http.Response res) {
    if (res.statusCode == 401) {
      logout();
      throw SessionExpiredException();
    }
  }

  Future<http.Response> _get(Uri uri, {Map<String, String>? headers}) {
    return _wrap(() => _client.get(uri, headers: headers));
  }

  Future<http.Response> _post(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
  }) {
    return _wrap(
      () => _client.post(uri, headers: headers, body: body),
      timeout: timeout,
    );
  }

  Future<http.Response> _patch(
    Uri uri, {
    Map<String, String>? headers,
    Object? body,
    Duration? timeout,
  }) {
    return _wrap(
      () => _client.patch(uri, headers: headers, body: body),
      timeout: timeout,
    );
  }

  Future<http.Response> _wrap(
    Future<http.Response> Function() request, {
    Duration? timeout,
  }) async {
    try {
      return await request().timeout(timeout ?? _timeout);
    } on TimeoutException {
      throw Exception(_connectionError());
    } on http.ClientException catch (e) {
      throw Exception(_connectionError(detail: e.message));
    }
  }

  String _connectionError({String? detail}) {
    final extra = detail != null ? '\n$detail' : '';
    final url = resolvedApiBaseUrl;
    if (isProductionApi) {
      return 'Cannot reach server at $url.$extra\n'
          '1. On your phone browser open: $url/health (should show {"ok":true})\n'
          '2. Stop the app, then run:\n'
          '   flutter run --dart-define=API_BASE_URL=$url\n'
          '3. Hot reload does not change API_BASE_URL — full restart required.';
    }
    return 'Cannot reach server at $url.$extra\n'
        '1. Run: cd server && npm run dev\n'
        '2. On Mac run: ipconfig getifaddr en0\n'
        '3. Re-run: flutter run --dart-define=API_BASE_URL=http://YOUR_MAC_IP:3000\n'
        '4. Phone browser should open http://YOUR_MAC_IP:3000/health';
  }

  String _errorFrom(http.Response res) {
    try {
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      return body['error'] as String? ?? 'Request failed (${res.statusCode})';
    } catch (_) {
      return 'Request failed (${res.statusCode})';
    }
  }
}
