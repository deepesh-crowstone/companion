import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/zara_mood.dart';

class MoodController extends ChangeNotifier {
  MoodController._();

  static final MoodController instance = MoodController._();

  static const _prefKey = 'zara_mood';

  ZaraMood _mood = ZaraMood.friendly;

  ZaraMood get mood => _mood;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _mood = ZaraMood.fromServerValue(prefs.getString(_prefKey));
    notifyListeners();
  }

  Future<void> setMood(ZaraMood mood) async {
    if (_mood == mood) return;
    _mood = mood;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKey, mood.serverValue);
    notifyListeners();
  }
}
