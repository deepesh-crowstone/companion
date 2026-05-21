import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/auth_screen.dart';
import 'screens/chat_screen.dart';
import 'services/api_service.dart';
import 'theme/mia_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const MiaApp());
}

class MiaApp extends StatelessWidget {
  const MiaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Zara',
      debugShowCheckedModeBanner: false,
      theme: MiaTheme.light(),
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
  bool _loggedIn = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    var loggedIn = false;
    try {
      await ApiService.instance.loadSession();
      if (ApiService.instance.isLoggedIn) {
        final reachable = await ApiService.instance.checkHealth().timeout(
          const Duration(seconds: 8),
          onTimeout: () => false,
        );
        loggedIn = reachable && await ApiService.instance.validateSession();
      }
    } catch (_) {
      loggedIn = false;
    }
    if (!mounted) return;
    setState(() {
      _loggedIn = loggedIn;
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return _loggedIn ? const ChatScreen() : const AuthScreen();
  }
}
