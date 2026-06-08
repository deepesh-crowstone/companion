import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

/// Tracks how many free text messages a non-paying user has sent today.
///
/// Free users get [limit] messages per calendar day (local time) and the
/// counter rolls over at midnight. The limit itself is configured by the
/// backend (`FREE_DAILY_MESSAGE_LIMIT`, fetched via [refreshConfig]) so it can
/// change without an app update; [defaultDailyLimit] is used until the first
/// fetch and as the offline fallback. Paid users (the private-mode pass) are
/// never gated, so callers must check the pass *before* consulting this
/// controller. State is persisted in SharedPreferences so the limit survives
/// app restarts (counting is intentionally client-side only and resets if the
/// user clears app data).
class FreeMessageController extends ChangeNotifier {
  FreeMessageController._();

  static final FreeMessageController instance = FreeMessageController._();

  /// Fallback used before the backend limit is fetched (and if it fails).
  static const int defaultDailyLimit = 5;

  static const _countKey = 'mia_free_messages_count';
  static const _dayKey = 'mia_free_messages_day';
  static const _limitKey = 'mia_free_messages_limit';

  int _sentToday = 0;
  int _limit = defaultDailyLimit;
  String? _day;
  bool _loaded = false;

  int get sentToday => _sentToday;

  /// Free messages allowed per day, set by the backend and cached locally.
  int get limit => _limit;

  /// Messages still available today, in the range `0..limit`.
  int get remaining => (_limit - _sentToday).clamp(0, _limit).toInt();

  bool get limitReached => _sentToday >= _limit;

  static String _todayKey() {
    final now = DateTime.now();
    final month = now.month.toString().padLeft(2, '0');
    final day = now.day.toString().padLeft(2, '0');
    return '${now.year}-$month-$day';
  }

  /// Loads persisted usage and rolls the counter over when the day changes.
  /// Safe to call repeatedly; the first call hydrates from disk.
  Future<void> ensureLoaded() async {
    final prefs = await SharedPreferences.getInstance();
    final today = _todayKey();
    if (!_loaded) {
      _sentToday = prefs.getInt(_countKey) ?? 0;
      _limit = prefs.getInt(_limitKey) ?? defaultDailyLimit;
      _day = prefs.getString(_dayKey) ?? today;
      _loaded = true;
    }
    if (_day != today) {
      _sentToday = 0;
      _day = today;
      await prefs.setInt(_countKey, 0);
      await prefs.setString(_dayKey, today);
    }
    notifyListeners();
  }

  /// Pulls the daily limit from the backend so it can be tuned from Railway
  /// without an app update. Best-effort: keeps the cached/default value on
  /// failure, and caches the new value for the next launch.
  Future<void> refreshConfig() async {
    try {
      final limit = await ApiService.instance.fetchFreeMessageLimit();
      if (limit < 0 || limit == _limit) return;
      _limit = limit;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_limitKey, limit);
      notifyListeners();
    } catch (_) {
      // Keep the cached/default limit on transient errors.
    }
  }

  /// Bumps [sentToday] to at least [count] from today's message history so
  /// blur state stays correct after a reload.
  Future<void> syncSentTodayFromHistory(int count) async {
    await ensureLoaded();
    if (count <= _sentToday) return;
    _sentToday = count;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_countKey, _sentToday);
    await prefs.setString(_dayKey, _day ?? _todayKey());
    notifyListeners();
  }

  /// Records one sent free message. Increments in memory immediately (so
  /// synchronous gate checks are accurate) and then persists.
  Future<void> recordSent() async {
    await ensureLoaded();
    _sentToday += 1;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_countKey, _sentToday);
    await prefs.setString(_dayKey, _day ?? _todayKey());
  }

  /// Clears today's usage. Exposed for debugging / QA.
  Future<void> reset() async {
    final prefs = await SharedPreferences.getInstance();
    _sentToday = 0;
    _day = _todayKey();
    _loaded = true;
    await prefs.setInt(_countKey, 0);
    await prefs.setString(_dayKey, _day!);
    notifyListeners();
  }
}
