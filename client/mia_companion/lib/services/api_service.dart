import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models/chat_message.dart';
import 'session_expired.dart';

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  static const _tokenKey = 'mia_auth_token';
  static const _usernameKey = 'mia_username';
  static const _timeout = Duration(seconds: 20);

  final http.Client _client = http.Client();

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
        Uri.parse('$apiBaseUrl/auth/me'),
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
      // Network blip — keep session; send will surface connection errors.
      return true;
    }
  }

  /// Quick check that the phone can reach the backend.
  Future<bool> checkHealth() async {
    try {
      final res = await _get(Uri.parse('$apiBaseUrl/health'));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Map<String, dynamic>> register(String username, String password) async {
    final res = await _post(
      Uri.parse('$apiBaseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    return _handleAuthResponse(res);
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    final res = await _post(
      Uri.parse('$apiBaseUrl/auth/login'),
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
      Uri.parse('$apiBaseUrl/messages'),
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

  Future<({ChatMessage user, ChatMessage assistant})> sendText(
    String text,
  ) async {
    final batch = await sendTextBatch([text]);
    return (user: batch.users.last, assistant: batch.assistant);
  }

  Future<({List<ChatMessage> users, ChatMessage assistant})> sendTextBatch(
    List<String> texts,
  ) async {
    final res = await _post(
      Uri.parse('$apiBaseUrl/messages/text/batch'),
      headers: _authHeaders,
      body: jsonEncode({'texts': texts}),
    );
    _guardAuth(res);
    if (res.statusCode >= 400) {
      throw Exception(_errorFrom(res));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    final userList = data['userMessages'] as List<dynamic>;
    return (
      users: userList
          .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
          .toList(),
      assistant: ChatMessage.fromJson(
        data['assistantMessage'] as Map<String, dynamic>,
      ),
    );
  }

  Future<({ChatMessage user, ChatMessage assistant})> sendVoice(
    File audioFile,
  ) async {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$apiBaseUrl/messages/voice'),
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
      Uri.parse('$apiBaseUrl/realtime/session'),
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
    }
  }

  String _connectionError({String? detail}) {
    final extra = detail != null ? '\n$detail' : '';
    return 'Cannot reach server at $apiBaseUrl.$extra\n'
        '1. Run: cd server && npm run dev\n'
        '2. On Mac run: ipconfig getifaddr en0\n'
        '3. Re-run app with: flutter run --dart-define=API_BASE_URL=http://YOUR_MAC_IP:3000\n'
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
