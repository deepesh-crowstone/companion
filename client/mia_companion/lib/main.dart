import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'models/app_deep_link.dart';
import 'navigation/deep_link_navigation.dart';
import 'screens/chat_screen.dart';
import 'screens/new_user_screen.dart';
import 'services/appsflyer_service.dart';
import 'services/api_service.dart';
import 'services/disappearing_messages_controller.dart';
import 'services/mood_controller.dart';
import 'services/session_reset.dart';
import 'theme/mia_theme.dart';
import 'theme/theme_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && Platform.isAndroid) {
    unawaited(
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge),
    );
  }
  // Clean path-based URLs on web (no `#`), so the chat interface is /chat/.
  usePathUrlStrategy();
  runApp(const MiaApp());
  unawaited(_loadStartupState());
}

Future<void> _loadStartupState() async {
  await Future.wait<void>([
    ThemeController.instance.load(),
    DisappearingMessagesController.instance.load(),
    MoodController.instance.load(),
    AppsFlyerService.instance.init(),
  ]);
}

class MiaApp extends StatefulWidget {
  const MiaApp({super.key});

  @override
  State<MiaApp> createState() => _MiaAppState();
}

class _MiaAppState extends State<MiaApp> {
  final _theme = ThemeController.instance;

  @override
  void initState() {
    super.initState();
    _theme.addListener(_onThemeChanged);
    _syncSystemChrome();
  }

  @override
  void dispose() {
    _theme.removeListener(_onThemeChanged);
    super.dispose();
  }

  void _onThemeChanged() {
    _syncSystemChrome();
    setState(() {});
  }

  void _syncSystemChrome() {
    final base =
        _theme.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark;
    SystemChrome.setSystemUIOverlayStyle(
      base.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Colors.transparent,
        systemNavigationBarContrastEnforced: false,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: rootNavigatorKey,
      title: 'Zara',
      debugShowCheckedModeBanner: false,
      theme: MiaTheme.light(),
      darkTheme: MiaTheme.dark(),
      themeMode: _theme.mode,
      // Web uses real paths (e.g. /chat/). Route every entry through the
      // bootstrap, which decides between the landing page and chat interface.
      onGenerateInitialRoutes: (initialRoute) => <Route<dynamic>>[
        MaterialPageRoute<dynamic>(
          builder: (_) => _Bootstrap(initialPath: initialRoute),
        ),
      ],
      onGenerateRoute: (settings) => MaterialPageRoute<dynamic>(
        builder: (_) => const _Bootstrap(),
        settings: settings,
      ),
    );
  }
}

class _Bootstrap extends StatefulWidget {
  const _Bootstrap({this.initialPath = '/'});

  /// Path the web app was opened at (e.g. `/chat/`); `/` on other platforms.
  final String initialPath;

  @override
  State<_Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<_Bootstrap> {
  bool _ready = false;
  bool _showNewUser = false;
  Key _chatScreenKey = UniqueKey();

  @override
  void initState() {
    super.initState();
    AppsFlyerService.instance.pendingDeepLink.addListener(_onDeepLinkChanged);
    SessionReset.onLogout = _handleLogout;
    SessionReset.onDeleteAccount = _handleDeleteAccount;
    _init();
  }

  @override
  void dispose() {
    AppsFlyerService.instance.pendingDeepLink.removeListener(_onDeepLinkChanged);
    SessionReset.onLogout = null;
    SessionReset.onDeleteAccount = null;
    super.dispose();
  }

  /// The chat interface lives at `/chat/`, the landing page at `/`.
  static bool _pathIsChat(String path) => path == '/chat' || path == '/chat/';

  /// Web only: keep the browser address bar in sync with the visible screen.
  void _syncBrowserUrl() {
    if (!kIsWeb) return;
    final onChatUrl = _pathIsChat(Uri.base.path);
    if (_showNewUser && onChatUrl) {
      SystemNavigator.routeInformationUpdated(
        uri: Uri.parse('/'),
        replace: true,
      );
    } else if (!_showNewUser && !onChatUrl) {
      SystemNavigator.routeInformationUpdated(
        uri: Uri.parse('/chat/'),
        replace: true,
      );
    }
  }

  /// Web only: records a visit to the landing page (chatlife.online/).
  /// Anonymous so it fires for first-time visitors before any account exists.
  void _trackSiteVisited() {
    if (!kIsWeb) return;
    unawaited(
      ApiService.instance.trackEvent(
        siteExploredEventName,
        eventTime: DateTime.now(),
        properties: const {'exploration_type': siteExploredTypeVisited},
        anonymous: true,
      ),
    );
  }

  void _onDeepLinkChanged() {
    final link = AppsFlyerService.instance.pendingDeepLink.value;
    if (link == null || !_ready) return;
    _handleDeepLink(link);
  }

  void _handleDeepLink(PendingAppDeepLink link) {
    switch (link.destination) {
      case AppDeepLinkDestination.onboarding:
        setState(() => _showNewUser = true);
      case AppDeepLinkDestination.chat:
        setState(() => _showNewUser = false);
      case AppDeepLinkDestination.zaraProfile:
      case AppDeepLinkDestination.userProfile:
      case AppDeepLinkDestination.voiceCall:
        setState(() => _showNewUser = false);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          applyAppDeepLink(link);
        });
    }
    _syncBrowserUrl();
    AppsFlyerService.instance.clearPendingDeepLink();
  }

  Future<void> _handleLogout() async {
    final claimed = await ApiService.instance.hasClaimedAccount();
    await ApiService.instance.logout();
    if (!mounted) return;
    setState(() {
      _showNewUser = claimed;
      _ready = true;
      _chatScreenKey = UniqueKey();
    });
    _syncBrowserUrl();
  }

  Future<void> _handleDeleteAccount() async {
    if (!mounted) return;
    setState(() {
      _showNewUser = true;
      _ready = true;
    });
    _syncBrowserUrl();
  }

  Future<void> _init() async {
    final startOnChat = kIsWeb && _pathIsChat(widget.initialPath);
    if (startOnChat) {
      if (!mounted) return;
      setState(() {
        _ready = true;
        _showNewUser = false;
      });
      _syncBrowserUrl();
      _onDeepLinkChanged();
      unawaited(_warmUpSession());
      return;
    }

    var showNewUser = true;
    try {
      showNewUser = !await hasStartedChatting();
    } catch (_) {
      // Default to the landing page if local prefs are unavailable.
    }
    if (!mounted) return;
    setState(() {
      _ready = true;
      _showNewUser = showNewUser;
    });
    _syncBrowserUrl();
    if (showNewUser) {
      _trackSiteVisited();
    } else {
      unawaited(_warmUpSession());
    }
    _onDeepLinkChanged();
  }

  /// Pre-authenticate in the background so chat can load messages sooner.
  Future<void> _warmUpSession() async {
    try {
      final reachable = await ApiService.instance.checkHealth().timeout(
        const Duration(seconds: 8),
        onTimeout: () => false,
      );
      if (!reachable) return;

      try {
        await ApiService.instance.ensureAuthenticated();
      } catch (_) {
        if (!mounted) return;
        if (await ApiService.instance.hasClaimedAccount()) {
          setState(() => _showNewUser = true);
          _syncBrowserUrl();
        }
      }
    } catch (_) {
      // Chat and onboarding screens surface connection/auth errors themselves.
    }
  }

  void _onStartedChatting() {
    setState(() => _showNewUser = false);
    _syncBrowserUrl();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: CircularProgressIndicator(color: MiaColors.accent),
          ),
        ),
      );
    }

    if (_showNewUser) {
      return NewUserScreen(onStarted: _onStartedChatting);
    }

    return ChatScreen(key: _chatScreenKey);
  }
}
