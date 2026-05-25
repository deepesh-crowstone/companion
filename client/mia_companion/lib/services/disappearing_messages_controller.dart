import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/chat_message.dart';

/// User preference for 24-hour disappearing chat messages.
///
/// Messages that expire while the feature is enabled are permanently hidden,
/// even if the user turns the toggle off later.
class DisappearingMessagesController extends ChangeNotifier {
  DisappearingMessagesController._();

  static final DisappearingMessagesController instance =
      DisappearingMessagesController._();

  static const _enabledPrefKey = 'mia_disappearing_messages';
  static const _hiddenIdsPrefKey = 'mia_permanently_hidden_message_ids';
  static const ttl = Duration(hours: 24);

  bool _enabled = false;
  final Set<int> _permanentlyHiddenIds = {};

  bool get enabled => _enabled;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _enabled = prefs.getBool(_enabledPrefKey) ?? false;
    _permanentlyHiddenIds
      ..clear()
      ..addAll(_readHiddenIds(prefs.getString(_hiddenIdsPrefKey)));
    notifyListeners();
  }

  Set<int> _readHiddenIds(String? raw) {
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return {};
      return decoded.map((e) => int.parse(e.toString())).toSet();
    } catch (_) {
      return {};
    }
  }

  Future<void> setEnabled(bool value) async {
    if (_enabled == value) return;
    _enabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledPrefKey, value);
    notifyListeners();
  }

  List<ChatMessage> filterMessages(List<ChatMessage> messages) {
    final now = DateTime.now();
    return messages.where((message) {
      if (_permanentlyHiddenIds.contains(message.id)) return false;
      if (!_enabled) return true;
      return now.difference(message.createdAt) < ttl;
    }).toList();
  }

  /// Marks messages past the TTL as permanently hidden while the feature is on.
  Future<void> markExpiredMessages(Iterable<ChatMessage> messages) async {
    if (!_enabled) return;

    var changed = false;
    final now = DateTime.now();
    for (final message in messages) {
      if (_permanentlyHiddenIds.contains(message.id)) continue;
      if (now.difference(message.createdAt) >= ttl) {
        changed = _permanentlyHiddenIds.add(message.id) || changed;
      }
    }

    if (!changed) return;
    await _persistHiddenIds();
    notifyListeners();
  }

  Future<void> _persistHiddenIds() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(_permanentlyHiddenIds.toList()..sort());
    await prefs.setString(_hiddenIdsPrefKey, encoded);
  }

  /// Clears permanently hidden message ids (e.g. on account delete).
  Future<void> clearPermanentHidden() async {
    if (_permanentlyHiddenIds.isEmpty) return;
    _permanentlyHiddenIds.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_hiddenIdsPrefKey);
    notifyListeners();
  }
}
