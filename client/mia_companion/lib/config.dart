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

/// PostHog project API key — a public, client-side ingestion key (safe to
/// commit; it can only send events, never read data). Baked in so every build
/// has analytics by default. Override per environment with
/// `--dart-define=POSTHOG_API_KEY=...`, or set it to an empty string to disable.
const String posthogApiKey = String.fromEnvironment(
  'POSTHOG_API_KEY',
  defaultValue: 'phc_s3EYNcgzA5YVsaQbwDm6vgo3iRC8u8rzMACRsLpsjgCX',
);

/// PostHog ingest host (US or EU cloud). Defaults to EU.
/// Override: `--dart-define=POSTHOG_HOST=https://us.i.posthog.com`
const String posthogHost = String.fromEnvironment(
  'POSTHOG_HOST',
  defaultValue: 'https://eu.i.posthog.com',
);

/// Web only: relative path to a first-party PostHog reverse proxy (nginx routes
/// it to PostHog so ad/tracker blockers don't drop events). Empty means talk to
/// [posthogHost] directly. Enabled for the Railway web build via the Dockerfile
/// (`--dart-define=POSTHOG_WEB_PROXY_PATH=/zr-relay`); left empty for local web
/// runs and non-Railway hosts (which have no matching proxy). Mobile ignores it.
const String posthogWebProxyPath = String.fromEnvironment(
  'POSTHOG_WEB_PROXY_PATH',
  defaultValue: '',
);

/// Mixpanel project token — a public, client-side ingestion token (safe to
/// commit; it can only send events, never read data). Override per environment
/// with `--dart-define=MIXPANEL_TOKEN=...`, or set it to an empty string to
/// disable.
const String mixpanelToken = String.fromEnvironment(
  'MIXPANEL_TOKEN',
  defaultValue: '7eb3f70ac4e60e6465dad9358b1c3e43',
);
