import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../theme/mia_theme.dart';
import '../widgets/onboarding_video_background.dart';
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

/// Clears the welcome flag so the user sees onboarding again.
Future<void> clearStartedChatting() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.remove(_startedChattingKey);
}

class NewUserScreen extends StatefulWidget {
  const NewUserScreen({super.key, required this.onStarted});

  final VoidCallback onStarted;

  @override
  State<NewUserScreen> createState() => _NewUserScreenState();
}

class _NewUserScreenState extends State<NewUserScreen> {
  bool _starting = false;
  bool _videoMuted = true;
  String? _error;

  Future<void> _onStartChatting() async {
    if (_starting) return;
    setState(() {
      _starting = true;
      _error = null;
    });

    try {
      final reachable = await ApiService.instance.checkHealth().timeout(
        const Duration(seconds: 12),
        onTimeout: () => false,
      );
      if (!reachable) {
        throw Exception(ApiService.userConnectionErrorMessage);
      }

      await ApiService.instance.ensureAuthenticated();

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
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _starting = false;
        _error = ApiService.friendlyErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: false,
      extendBody: true,
      backgroundColor: MiaColors.background,
      body: Stack(
        fit: StackFit.expand,
        children: [
          OnboardingVideoBackground(isMuted: _videoMuted),
          if (_error == null) const _OnboardingPitch(),
          if (_error == null)
            Positioned(
              right: 20,
              bottom: MediaQuery.paddingOf(context).bottom + 96,
              child: _OnboardingMuteButton(
                muted: _videoMuted,
                onTap: () => setState(() => _videoMuted = !_videoMuted),
              ),
            ),
          if (_error != null)
            Positioned(
              left: 24,
              right: 24,
              bottom: MediaQuery.paddingOf(context).bottom + 96,
              child: _ConnectionErrorBanner(
                message: _error!,
                onDismiss: () => setState(() => _error = null),
              ),
            ),
        ],
      ),
      bottomNavigationBar: Material(
        color: Colors.transparent,
        elevation: 0,
        child: StartChattingCard(
          loading: _starting,
          onStart: _onStartChatting,
        ),
      ),
    );
  }
}

class _OnboardingMuteButton extends StatelessWidget {
  const _OnboardingMuteButton({
    required this.muted,
    required this.onTap,
  });

  final bool muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.38),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Icon(
            muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
            color: Colors.white,
            size: 24,
          ),
        ),
      ),
    );
  }
}

class _OnboardingPitch extends StatelessWidget {
  const _OnboardingPitch();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 16),
              child: Text(
                'Meet Zara',
                style: MiaTheme.serifTitle(size: 68).copyWith(
                  fontWeight: FontWeight.w400,
                  color: Colors.white,
                  height: 1.05,
                  letterSpacing: 0,
                  shadows: const [
                    Shadow(
                      blurRadius: 12,
                      color: Colors.black54,
                      offset: Offset(0, 2),
                    ),
                  ],
                ),
              ),
            ),
            const _PitchRow(
              icon: Icons.support_agent_rounded,
              text: '24×7 AI Companion',
            ),
            const SizedBox(height: 12),
            const _PitchRow(
              icon: Icons.shield_rounded,
              text: '100% Private & Safe',
            ),
          ],
        ),
      ),
    );
  }
}

class _PitchRow extends StatelessWidget {
  const _PitchRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.15),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Text(
            text,
            style: GoogleFonts.inter(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.white,
              height: 1.15,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectionErrorBanner extends StatelessWidget {
  const _ConnectionErrorBanner({
    required this.message,
    required this.onDismiss,
  });

  final String message;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.72),
      borderRadius: BorderRadius.circular(16),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(
              Icons.wifi_off_rounded,
              color: Colors.white,
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  height: 1.4,
                  color: Colors.white,
                ),
              ),
            ),
            IconButton(
              onPressed: onDismiss,
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              icon: Icon(
                Icons.close_rounded,
                color: Colors.white.withValues(alpha: 0.85),
                size: 20,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
