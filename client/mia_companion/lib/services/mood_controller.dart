import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/personality_access.dart';
import '../models/zara_mood.dart';
import 'api_service.dart';
import 'pricing_controller.dart';

class MoodController extends ChangeNotifier {
  MoodController._();

  static final MoodController instance = MoodController._();

  static const _defaultProfileSlug = 'zara';

  String _activeProfileSlug = _defaultProfileSlug;
  ZaraMood _mood = ZaraMood.friendly;
  PersonalityAccess? _access;

  String get activeProfileSlug => _activeProfileSlug;
  ZaraMood get mood => _mood;
  PersonalityAccess? get access => _access;
  bool get passActive => _access?.passActive ?? false;

  String _prefKeyFor(String profileSlug) => 'companion_mood_$profileSlug';

  bool canUseMood(ZaraMood mood) => !mood.requiresPass || passActive;

  Future<void> setActiveProfile(String profileSlug) async {
    final normalized = profileSlug.trim().toLowerCase();
    if (normalized.isEmpty || normalized == _activeProfileSlug) return;
    _activeProfileSlug = normalized;
    final prefs = await SharedPreferences.getInstance();
    _mood = ZaraMood.fromServerValue(prefs.getString(_prefKeyFor(normalized)));
    _access = null;
    notifyListeners();
    unawaited(refreshAccess());
  }

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _mood = ZaraMood.fromServerValue(
      prefs.getString(_prefKeyFor(_activeProfileSlug)),
    );
    notifyListeners();
  }

  Future<void> refreshAccess() async {
    try {
      _access = await ApiService.instance.fetchPersonalityAccess(
        profileSlug: _activeProfileSlug,
      );
      if (_access != null) {
        PricingController.instance.applyPersonality(
          priceInr: _access!.priceInr,
          strikePriceInr: _access!.strikePriceInr,
          passDays: _access!.passDays,
        );
      }
      if (!canUseMood(_mood)) {
        _mood = ZaraMood.friendly;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_prefKeyFor(_activeProfileSlug), _mood.serverValue);
      }
      notifyListeners();
    } catch (_) {
      // Keep local mood if status cannot be loaded offline.
    }
  }

  void applyAccess(PersonalityAccess access) {
    _access = access;
    PricingController.instance.applyPersonality(
      priceInr: access.priceInr,
      strikePriceInr: access.strikePriceInr,
      passDays: access.passDays,
    );
    notifyListeners();
  }

  Future<void> setMood(ZaraMood mood) async {
    if (_mood == mood) return;
    if (!canUseMood(mood)) return;
    _mood = mood;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefKeyFor(_activeProfileSlug), mood.serverValue);
    notifyListeners();
  }
}
