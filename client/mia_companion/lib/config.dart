/// Backend base URL (baked into release APKs).
///
/// Override for local dev only:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000`
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://api.chatlife.online',
);

/// Normalized base URL (no trailing slash).
String get resolvedApiBaseUrl {
  final trimmed = apiBaseUrl.trim();
  if (trimmed.isEmpty) return trimmed;
  return trimmed.replaceAll(RegExp(r'/+$'), '');
}

bool get isProductionApi =>
    resolvedApiBaseUrl.startsWith('https://') &&
    (resolvedApiBaseUrl.contains('railway.app') ||
        resolvedApiBaseUrl.contains('chatlife.online'));

/// AppsFlyer dev key (override: `--dart-define=APPSFLYER_DEV_KEY=...`).
const String appsFlyerDevKey = String.fromEnvironment(
  'APPSFLYER_DEV_KEY',
  defaultValue: 'E6cfHyEyaPkUZ28x8EL2B6',
);

/// OneLink template ID from AppsFlyer (e.g. `Ab1c`).
/// Override: `--dart-define=APPSFLYER_ONELINK_ID=Ab1c`
const String appsFlyerOneLinkId = String.fromEnvironment(
  'APPSFLYER_ONELINK_ID',
  defaultValue: '',
);

/// OneLink subdomain — must match AndroidManifest intent-filter host.
/// Override: `--dart-define=APPSFLYER_ONELINK_HOST=yourbrand.onelink.me`
const String appsFlyerOneLinkHost = String.fromEnvironment(
  'APPSFLYER_ONELINK_HOST',
  defaultValue: 'chatlife.onelink.me',
);

/// Custom URI scheme for OneLink fallback links — must match AndroidManifest.
/// Override: `--dart-define=APPSFLYER_DEEPLINK_SCHEME=zara`
const String appsFlyerDeepLinkScheme = String.fromEnvironment(
  'APPSFLYER_DEEPLINK_SCHEME',
  defaultValue: 'zara',
);
