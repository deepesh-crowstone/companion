import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'mia_palette.dart';
import 'mia_theme.dart';

/// App-wide light/dark theme preference.
class ThemeController extends ChangeNotifier {
  ThemeController._();

  static final ThemeController instance = ThemeController._();

  static const _prefKey = 'mia_theme_mode';

  ThemeMode _mode = ThemeMode.light;

  ThemeMode get mode => _mode;
  bool get isDark => _mode == ThemeMode.dark;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    if (saved == 'dark') {
      _apply(ThemeMode.dark, persist: false);
    } else if (saved == 'light') {
      _apply(ThemeMode.light, persist: false);
    }
    notifyListeners();
  }

  Future<void> setLight() => _apply(ThemeMode.light);

  Future<void> setDark() => _apply(ThemeMode.dark);

  Future<void> _apply(ThemeMode mode, {bool persist = true}) async {
    if (_mode == mode && persist) return;
    _mode = mode;
    MiaColors.apply(mode == ThemeMode.dark ? MiaPalette.dark : MiaPalette.light);
    if (persist) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _prefKey,
        mode == ThemeMode.dark ? 'dark' : 'light',
      );
    }
    notifyListeners();
  }
}
