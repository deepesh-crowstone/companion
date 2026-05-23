import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_background.dart';
import '../widgets/start_chatting_card.dart';

const _startedChattingKey = 'mia_started_chatting';
const startChattingEventName = 'start_chatting_with_zara';

/// Returns whether the user has already tapped through the welcome screen.
Future<bool> hasStartedChatting() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_startedChattingKey) ?? false;
}

/// Marks the welcome screen as completed so returning users skip it.
Future<void> markStartedChatting() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_startedChattingKey, true);
}

class NewUserScreen extends StatefulWidget {
  const NewUserScreen({super.key, required this.onStarted});

  final VoidCallback onStarted;

  @override
  State<NewUserScreen> createState() => _NewUserScreenState();
}

class _NewUserScreenState extends State<NewUserScreen> {
  bool _loading = true;
  bool _starting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      if (!ApiService.instance.isLoggedIn) {
        await ApiService.instance.ensureAuthenticated();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
      return;
    }
    if (!mounted) return;
    setState(() => _loading = false);
  }

  Future<void> _onStartChatting() async {
    if (_starting) return;
    setState(() => _starting = true);

    final eventTime = DateTime.now();
    unawaited(
      ApiService.instance.trackEvent(
        startChattingEventName,
        eventTime: eventTime,
      ),
    );

    await markStartedChatting();
    if (!mounted) return;
    widget.onStarted();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MiaColors.background,
      body: MiaBackground(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
              ? _ErrorState(message: _error!, onRetry: _init)
              : Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(vertical: 32),
                    child: StartChattingCard(
                      loading: _starting,
                      onStart: _onStartChatting,
                    ),
                  ),
                ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: onRetry, child: const Text('try again')),
        ],
      ),
    );
  }
}
