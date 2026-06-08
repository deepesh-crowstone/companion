/// Static app metadata (keep in sync with pubspec.yaml version).
class AppInfo {
  static const version = '2.1.0';
  static const buildNumber = '21';

  static String get versionLabel => 'v$version ($buildNumber)';
}
