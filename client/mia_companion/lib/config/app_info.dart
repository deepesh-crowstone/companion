/// Static app metadata (keep in sync with pubspec.yaml version).
class AppInfo {
  static const version = '1.0.0';
  static const buildNumber = '1';

  static String get versionLabel => 'v$version ($buildNumber)';
}
