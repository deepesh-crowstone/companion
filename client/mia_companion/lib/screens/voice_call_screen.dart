import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:permission_handler/permission_handler.dart';

import '../services/api_service.dart';
import '../services/realtime_call_service.dart';
import '../theme/mia_theme.dart';
import '../widgets/mia_avatar.dart';

class VoiceCallScreen extends StatefulWidget {
  const VoiceCallScreen({super.key});

  @override
  State<VoiceCallScreen> createState() => _VoiceCallScreenState();
}

class _VoiceCallScreenState extends State<VoiceCallScreen>
    with SingleTickerProviderStateMixin {
  final _call = RealtimeCallService();
  Timer? _timer;
  int _seconds = 0;
  String _transcript = 'connecting…';
  List<int> _bars = List.filled(28, 10);
  bool _muted = false;
  bool _speaker = false;
  String? _error;
  bool _connected = false;
  bool _starting = true;

  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
    _startCall();
  }

  Future<void> _startCall() async {
    final mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      setState(() {
        _starting = false;
        _error = 'microphone permission is required for calls';
        _transcript = 'permission denied';
      });
      return;
    }

    _call.connectionController.stream.listen((state) {
      if (!mounted) return;
      if (state == CallConnectionState.ready) {
        setState(() {
          _connected = true;
          _starting = false;
          _error = null;
          _transcript = '…say something — i\'m listening';
        });
      } else if (state == CallConnectionState.error) {
        setState(() {
          _starting = false;
          _connected = false;
        });
      }
    });

    _call.transcriptController.stream.listen((t) {
      if (!mounted || t.isEmpty) return;
      setState(() {
        if (t.contains('error') ||
            t.contains('failed') ||
            t.contains('denied') ||
            t.contains('disconnect')) {
          _error = t;
        }
        _transcript = t.startsWith('…') ? t : '…$t';
      });
    });

    _call.levelController.stream.listen((level) {
      if (!mounted) return;
      setState(() {
        _bars = List.generate(28, (i) {
          final wobble = (math.sin(_seconds * 0.4 + i * 0.5) * 8).toInt();
          return (level + wobble).clamp(6, 56);
        });
      });
    });

    try {
      final session = await ApiService.instance.createRealtimeSession();
      final config = session['sessionConfig'] as Map<String, dynamic>;

      await _call.connect(
        wsUrl: session['wsUrl'] as String,
        token: session['token'] as String,
        sessionConfig: config,
      );

      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _seconds++);
      });
    } catch (e) {
      setState(() {
        _starting = false;
        _error = e.toString().replaceFirst('Exception: ', '');
        _transcript = 'couldn\'t connect';
      });
    }
  }

  String get _duration {
    final m = (_seconds ~/ 60).toString().padLeft(2, '0');
    final s = (_seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _endCall() async {
    await _call.hangUp();
    _timer?.cancel();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulse.dispose();
    _call.hangUp();
    _call.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              MiaColors.callGradientTop,
              MiaColors.callGradientMid,
              MiaColors.callGradientBottom,
            ],
            stops: [0.0, 0.45, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  children: [
                    _GlassButton(icon: Icons.arrow_back, onTap: _endCall),
                    Expanded(
                      child: Text(
                        'VOICE CALL',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.inter(
                          color: Colors.white54,
                          fontSize: 11,
                          letterSpacing: 2,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: 44),
                  ],
                ),
              ),
              const SizedBox(height: 32),
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
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      const MiaAvatar(size: 168),
                      if (_starting)
                        Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.black.withValues(alpha: 0.45),
                          ),
                          child: const Center(
                            child: CircularProgressIndicator(
                              color: Colors.white70,
                              strokeWidth: 2,
                            ),
                          ),
                        )
                      else if (!_connected)
                        Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.black.withValues(alpha: 0.35),
                          ),
                          child: Icon(
                            Icons.signal_wifi_off_rounded,
                            size: 40,
                            color: Colors.white.withValues(alpha: 0.85),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 28),
              Text(
                'Mia',
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
                    _connected
                        ? 'on the line · $_duration'
                        : _starting
                            ? 'connecting…'
                            : 'not connected',
                    style: GoogleFonts.inter(
                      color: Colors.white70,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),
              SizedBox(
                height: 52,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: _bars.map((h) {
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 100),
                      width: 3,
                      height: h.toDouble(),
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 28),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Container(
                  width: double.infinity,
                  constraints: const BoxConstraints(minHeight: 72),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 18,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.28),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                  child: Text(
                    _error ?? _transcript,
                    style: GoogleFonts.inter(
                      color: Colors.white.withValues(alpha: 0.95),
                      fontSize: 15,
                      fontStyle: FontStyle.italic,
                      height: 1.45,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              const Spacer(),
              Padding(
                padding: const EdgeInsets.fromLTRB(32, 0, 32, 28),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _CallAction(
                      icon: _muted ? Icons.mic_off_rounded : Icons.mic_rounded,
                      label: 'MUTE',
                      active: _muted,
                      onTap: () async {
                        final next = !_muted;
                        setState(() => _muted = next);
                        await _call.setMuted(next);
                      },
                    ),
                    _CallAction(
                      icon: _speaker
                          ? Icons.volume_up_rounded
                          : Icons.hearing_rounded,
                      label: _speaker ? 'SPEAKER' : 'EARPIECE',
                      active: _speaker,
                      onTap: () async {
                        final next = !_speaker;
                        setState(() => _speaker = next);
                        await _call.setSpeaker(next);
                      },
                    ),
                    GestureDetector(
                      onTap: _endCall,
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
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlassButton extends StatelessWidget {
  const _GlassButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.14),
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}

class _CallAction extends StatelessWidget {
  const _CallAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: active
                  ? Colors.white.withValues(alpha: 0.22)
                  : Colors.white.withValues(alpha: 0.1),
            ),
            child: Icon(icon, color: Colors.white.withValues(alpha: 0.85)),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: GoogleFonts.inter(
              color: Colors.white54,
              fontSize: 10,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
