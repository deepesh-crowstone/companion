import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:just_audio/just_audio.dart';

import '../data/mia_profile.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_avatar.dart';

/// Minimal full-screen call experience that plays a single pre-recorded clip,
/// presented as if Zara is speaking on a voice call.
///
/// Pops itself when the clip finishes playing or when the user hangs up; the
/// caller decides what to show next (e.g. the payment wall).
class Mp3CallScreen extends StatefulWidget {
  const Mp3CallScreen({super.key, required this.audioUrl});

  final String audioUrl;

  @override
  State<Mp3CallScreen> createState() => _Mp3CallScreenState();
}

class _Mp3CallScreenState extends State<Mp3CallScreen>
    with TickerProviderStateMixin {
  final _player = AudioPlayer();
  StreamSubscription<PlayerState>? _playerSub;
  Timer? _timer;
  int _seconds = 0;
  bool _connected = false;
  bool _ended = false;

  late final AnimationController _pulse;
  late final AnimationController _wave;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
    _wave = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _start();
  }

  Future<void> _start() async {
    try {
      await _player.setUrl(widget.audioUrl);
      _playerSub = _player.playerStateStream.listen((state) {
        if (state.processingState == ProcessingState.completed) {
          _hangUp();
        }
      });
      if (!mounted) return;
      setState(() => _connected = true);
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _seconds++);
      });
      await _player.play();
    } catch (_) {
      _hangUp();
    }
  }

  Future<void> _hangUp() async {
    if (_ended) return;
    _ended = true;
    _timer?.cancel();
    await _player.stop();
    if (mounted) Navigator.of(context).pop();
  }

  String get _duration {
    final m = (_seconds ~/ 60).toString().padLeft(2, '0');
    final s = (_seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  void dispose() {
    _timer?.cancel();
    _playerSub?.cancel();
    _pulse.dispose();
    _wave.dispose();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              MiaColors.callGradientTop,
              MiaColors.callGradientMid,
              MiaColors.callGradientBottom,
            ],
            stops: const [0.0, 0.45, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 16),
              Text(
                'VOICE CALL',
                style: GoogleFonts.inter(
                  color: Colors.white54,
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              AnimatedBuilder(
                animation: _pulse,
                builder: (context, child) {
                  final scale = 1.0 + (_pulse.value * 0.06);
                  return Transform.scale(scale: scale, child: child);
                },
                child: Container(
                  width: 168,
                  height: 168,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.35),
                      width: 2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: MiaColors.accent.withValues(alpha: 0.45),
                        blurRadius: 48,
                        spreadRadius: 4,
                      ),
                    ],
                  ),
                  child: const MiaAvatar(size: 168),
                ),
              ),
              const SizedBox(height: 26),
              Text(
                MiaProfile.name,
                style: GoogleFonts.playfairDisplay(
                  fontSize: 38,
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _connected ? MiaColors.online : Colors.orange,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _connected ? 'on the line · $_duration' : 'connecting…',
                    style: GoogleFonts.inter(
                      color: Colors.white70,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 30),
              _SpeakingBars(animation: _wave, active: _connected),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.only(bottom: 40),
                child: GestureDetector(
                  onTap: _hangUp,
                  child: Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFE53935),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFE53935)
                              .withValues(alpha: 0.55),
                          blurRadius: 20,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.call_end_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SpeakingBars extends StatelessWidget {
  const _SpeakingBars({required this.animation, required this.active});

  final Animation<double> animation;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: AnimatedBuilder(
        animation: animation,
        builder: (context, _) {
          return Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(7, (i) {
              final phase = (animation.value + i * 0.16) % 1.0;
              final t = (math.sin(phase * 2 * math.pi) + 1) / 2;
              final height = active ? 10 + t * 28 : 10.0;
              return Container(
                width: 4,
                height: height,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(2),
                ),
              );
            }),
          );
        },
      ),
    );
  }
}
