import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

/// Tracks which scripted "Zara call" clip plays next, persisted across launches.
///
/// Clip URLs are loaded from the server on each call tap so the list can change
/// without an app update. Once every available clip has been played, [takeNext]
/// returns `null` and the caller falls back to the payment wall.
class CallSequenceController {
  CallSequenceController._();

  static final CallSequenceController instance = CallSequenceController._();

  static const _indexKey = 'mia_call_sequence_index';

  int? _index;

  Future<void> _ensureLoaded() async {
    if (_index != null) return;
    final prefs = await SharedPreferences.getInstance();
    _index = prefs.getInt(_indexKey) ?? 0;
  }

  Future<List<String>> _fetchUrls() {
    return ApiService.instance.fetchCallPreviewAudioUrls();
  }

  /// Whether there is still an unplayed clip waiting for the next call tap.
  Future<bool> hasNext() async {
    await _ensureLoaded();
    final urls = await _fetchUrls();
    return _index! < urls.length;
  }

  /// Returns the next clip URL and advances (persisting) the sequence, or `null`
  /// when every available clip has already been played.
  Future<String?> takeNext() async {
    await _ensureLoaded();
    final urls = await _fetchUrls();
    final index = _index!;
    if (index >= urls.length) return null;
    final url = urls[index];
    _index = index + 1;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_indexKey, _index!);
    return url;
  }
}
