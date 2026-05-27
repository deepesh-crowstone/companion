import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ThemeController.instance.load();
  await DisappearingMessagesController.instance.load();
  await MoodController.instance.load();
  await AppsFlyerService.instance.init();
  runApp(const MiaApp());
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
    _theme.load().then((_) {
      _syncSystemChrome();
      if (mounted) setState(() {});
    });
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
    SystemChrome.setSystemUIOverlayStyle(
      _theme.isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
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
      home: const _Bootstrap(),
    );
  }
}

class _Bootstrap extends StatefulWidget {
  const _Bootstrap();

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
    AppsFlyerService.instance.clearPendingDeepLink();
  }

  Future<void> _handleLogout() async {
    try {
      await ApiService.instance.ensureAuthenticated();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _showNewUser = false;
      _ready = true;
      _chatScreenKey = UniqueKey();
    });
  }

  Future<void> _handleDeleteAccount() async {
    try {
      await ApiService.instance.ensureAuthenticated();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _showNewUser = true;
      _ready = true;
    });
  }

  Future<void> _init() async {
    var showNewUser = false;
    try {
      showNewUser = !await hasStartedChatting();
      if (!showNewUser) {
        final reachable = await ApiService.instance.checkHealth().timeout(
          const Duration(seconds: 8),
          onTimeout: () => false,
        );
        if (reachable) {
          await ApiService.instance.ensureAuthenticated();
        }
      }
    } catch (_) {
      // Chat screen handles unreachable server / auth errors for returning users.
    }
    if (!mounted) return;
    setState(() {
      _ready = true;
      _showNewUser = showNewUser;
    });
    _onDeepLinkChanged();
  }

  void _onStartedChatting() {
    setState(() => _showNewUser = false);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return Scaffold(
        body: Center(child: CircularProgressIndicator(color: MiaColors.accent)),
      );
    }

    if (_showNewUser) {
      return NewUserScreen(onStarted: _onStartedChatting);
    }

    return ChatScreen(key: _chatScreenKey);
  }
}
