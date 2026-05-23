import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/chat_screen.dart';
import 'screens/new_user_screen.dart';
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
  bool _showNewUser = false;

  @override
  void initState() {
    super.initState();
    _init();
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
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_showNewUser) {
      return NewUserScreen(onStarted: _onStartedChatting);
    }

    return const ChatScreen();
  }
}
