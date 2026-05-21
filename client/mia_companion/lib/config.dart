/// Backend base URL (baked into release APKs).
///
/// Override for local dev only:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000`
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://companion-production-850d.up.railway.app',
);

/// Normalized base URL (no trailing slash).
String get resolvedApiBaseUrl {
  final trimmed = apiBaseUrl.trim();
  if (trimmed.isEmpty) return trimmed;
  return trimmed.replaceAll(RegExp(r'/+$'), '');
}

bool get isProductionApi =>
    resolvedApiBaseUrl.startsWith('https://') &&
    resolvedApiBaseUrl.contains('railway.app');
