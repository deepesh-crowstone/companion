/// Backend base URL.
/// Android emulator: use 10.0.2.2 to reach host machine localhost.
/// Physical device: use your computer's LAN IP, e.g. http://192.168.1.10:3000
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);
