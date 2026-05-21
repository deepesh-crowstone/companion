import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/chat_message.dart';
import 'session_expired.dart';

class ApiService {
  ApiService._() : _client = _createClient();
  static final ApiService instance = ApiService._();

  static const _tokenKey = 'mia_auth_token';
  static const _usernameKey = 'mia_username';
  static const _timeout = Duration(seconds: 30);
  static const _healthTimeout = Duration(seconds: 45);

  final http.Client _client;

  static http.Client _createClient() {
    final httpClient = HttpClient()
      ..connectionTimeout = _timeout
      ..idleTimeout = _timeout;
    return IOClient(httpClient);
  }

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

  Future<Map<String, dynamic>> register(String username, String password) async {
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
    return _handleAuthResponse(res);
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
      ({
        ChatMessage user,
        ChatMessage assistant,
        List<ChatMessage> assistants,
      })> sendText(
    String text,
  ) async {
    final batch = await sendTextBatch([text]);
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
      })> sendTextBatch(
    List<String> texts,
  ) async {
    final res = await _post(
      Uri.parse('$resolvedApiBaseUrl/messages/text/batch'),
      headers: _authHeaders,
      body: jsonEncode({'texts': texts}),
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

  Future<({ChatMessage user, ChatMessage assistant})> sendVoice(
    File audioFile,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$resolvedApiBaseUrl/messages/voice'),
    );
    request.headers['Authorization'] = 'Bearer $_token';
    request.files.add(
      await http.MultipartFile.fromPath('audio', audioFile.path),
    );

    try {
      final streamed = await request.send().timeout(_timeout);
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
    } on SocketException {
      throw Exception(_connectionError());
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
  }) {
    return _wrap(() => _client.post(uri, headers: headers, body: body));
  }

  Future<http.Response> _wrap(
    Future<http.Response> Function() request,
  ) async {
    try {
      return await request().timeout(_timeout);
    } on TimeoutException {
      throw Exception(_connectionError());
    } on SocketException {
      throw Exception(_connectionError());
    } on http.ClientException catch (e) {
      throw Exception(_connectionError(detail: e.message));
    } on HandshakeException catch (e) {
      throw Exception(_connectionError(detail: e.message));
    } on TlsException catch (e) {
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
