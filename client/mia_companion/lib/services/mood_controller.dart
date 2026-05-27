import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/personality_access.dart';
import '../models/zara_mood.dart';
import 'api_service.dart';

class MoodController extends ChangeNotifier {
  MoodController._();

  static final MoodController instance = MoodController._();

  static const _prefKey = 'zara_mood';

  ZaraMood _mood = ZaraMood.friendly;
  PersonalityAccess? _access;

  ZaraMood get mood => _mood;
  PersonalityAccess? get access => _access;
  bool get passActive => _access?.passActive ?? false;

  bool canUseMood(ZaraMood mood) => !mood.requiresPass || passActive;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _mood = ZaraMood.fromServerValue(prefs.getString(_prefKey));
    notifyListeners();
  }

  Future<void> refreshAccess() async {
    try {
      _access = await ApiService.instance.fetchPersonalityAccess();
      if (!canUseMood(_mood)) {
        _mood = ZaraMood.friendly;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefKey, _mood.serverValue);
      }
      notifyListeners();
    } catch (_) {
      // Keep local mood if status cannot be loaded offline.
    }
  }

  void applyAccess(PersonalityAccess access) {
    _access = access;
    notifyListeners();
  }

  Future<void> setMood(ZaraMood mood) async {
    if (_mood == mood) return;
    if (!canUseMood(mood)) return;
    _mood = mood;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, mood.serverValue);
    notifyListeners();
  }
}
