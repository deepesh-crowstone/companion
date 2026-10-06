import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

/// Tracks which profile-specific scripted call clip plays next.
///
/// Clip URLs are loaded from the server on each call tap so the list can change
/// without an app update. Once every available clip has been played, [takeNext]
/// returns `null` and the caller falls back to the payment wall.
class CallSequenceController {
  CallSequenceController._();

  static final CallSequenceController instance = CallSequenceController._();

  static const _indexKeyPrefix = 'mia_call_sequence_index';

  final Map<String, int> _indexes = {};

  String _indexKey(String profileSlug) => '${_indexKeyPrefix}_$profileSlug';

  Future<void> _ensureLoaded(String profileSlug) async {
    if (_indexes.containsKey(profileSlug)) return;
    final prefs = await SharedPreferences.getInstance();
    _indexes[profileSlug] = prefs.getInt(_indexKey(profileSlug)) ?? 0;
  }

  Future<List<String>> _fetchUrls(String profileSlug) {
    return ApiService.instance.fetchCallPreviewAudioUrls(
      profileSlug: profileSlug,
    );
  }

  /// Whether there is still an unplayed clip waiting for the next call tap.
  Future<bool> hasNext(String profileSlug) async {
    await _ensureLoaded(profileSlug);
    final urls = await _fetchUrls(profileSlug);
    return _indexes[profileSlug]! < urls.length;
  }

  /// Returns the next clip URL and advances (persisting) the sequence, or `null`
  /// when every available clip has already been played.
  Future<String?> takeNext(String profileSlug) async {
    await _ensureLoaded(profileSlug);
    final urls = await _fetchUrls(profileSlug);
    final index = _indexes[profileSlug]!;
    if (index >= urls.length) return null;
    final url = urls[index];
    _indexes[profileSlug] = index + 1;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_indexKey(profileSlug), _indexes[profileSlug]!);
    return url;
  }
}
