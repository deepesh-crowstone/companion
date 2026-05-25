import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/chat_screen.dart';
import 'screens/new_user_screen.dart';
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
    SessionReset.onLogout = _handleLogout;
    SessionReset.onDeleteAccount = _handleDeleteAccount;
    _init();
  }

  @override
  void dispose() {
    SessionReset.onLogout = null;
    SessionReset.onDeleteAccount = null;
    super.dispose();
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
      final reachable = await ApiService.instance.checkHealth().timeout(
        const Duration(seconds: 8),
        onTimeout: () => false,
      );
      if (reachable) {
        await ApiService.instance.ensureAuthenticated();
      }
      showNewUser = !await hasStartedChatting();
    } catch (_) {
      // New user / chat screens handle unreachable server / auth errors.
    }
    if (!mounted) return;
    setState(() {
      _ready = true;
      _showNewUser = showNewUser;
    });
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
