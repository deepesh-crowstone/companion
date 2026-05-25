import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:just_audio/just_audio.dart';

import '../theme/mia_theme.dart';

/// Voice note row: [play] — [waveform] — [duration]
class VoiceNoteBubble extends StatefulWidget {
  const VoiceNoteBubble({
    super.key,
    required this.isUser,
    required this.isPlaying,
    required this.seed,
    this.audioUrl,
    this.onPlay,
    this.fallbackDurationSec,
  });

  final bool isUser;
  final bool isPlaying;
  final int seed;
  final String? audioUrl;
  final VoidCallback? onPlay;
  final int? fallbackDurationSec;

  @override
  State<VoiceNoteBubble> createState() => _VoiceNoteBubbleState();
}

class _VoiceNoteBubbleState extends State<VoiceNoteBubble>
    with SingleTickerProviderStateMixin {
  Duration? _duration;
  late final List<double> _barHeights;
  late final AnimationController _playAnim;

  @override
  void initState() {
    super.initState();
    _barHeights = _generateWaveform(widget.seed);
    _playAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    );
    _loadDuration();
  }

  @override
  void didUpdateWidget(VoiceNoteBubble oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isPlaying && !_playAnim.isAnimating) {
      _playAnim.repeat();
    } else if (!widget.isPlaying && _playAnim.isAnimating) {
      _playAnim.stop();
      _playAnim.reset();
    }
  }

  @override
  void dispose() {
    _playAnim.dispose();
    super.dispose();
  }

  Future<void> _loadDuration() async {
    if (widget.fallbackDurationSec != null) {
      setState(
        () => _duration = Duration(seconds: widget.fallbackDurationSec!),
      );
      return;
    }
    final url = widget.audioUrl;
    if (url == null) return;
    try {
      final player = AudioPlayer();
      final loadedDuration = await player.setUrl(url);
      final d =
          loadedDuration ??
          player.duration ??
          await player.durationStream
              .where((value) => value != null)
              .first
              .timeout(const Duration(seconds: 2), onTimeout: () => null);
      await player.dispose();
      if (mounted && d != null) setState(() => _duration = d);
    } catch (_) {
      if (mounted && widget.fallbackDurationSec != null) {
        setState(
          () => _duration = Duration(seconds: widget.fallbackDurationSec!),
        );
      }
    }
  }

  List<double> _generateWaveform(int seed) {
    final rng = math.Random(seed);
    return List.generate(32, (_) => 6 + rng.nextDouble() * 22);
  }

  String get _durationLabel {
    final d = _duration;
    if (d == null) return '--:--';
    final s = d.inSeconds;
    final m = s ~/ 60;
    final r = s % 60;
    return '${m.toString().padLeft(2, '0')}:${r.toString().padLeft(2, '0')}';
  }

  Color get _fg => widget.isUser ? MiaColors.miaText : MiaColors.accentDeep;
  Color get _fgMuted => MiaColors.textMuted;

  @override
  Widget build(BuildContext context) {
    if (widget.isPlaying && !_playAnim.isAnimating) {
      _playAnim.repeat();
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.onPlay,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: math.min(MediaQuery.sizeOf(context).width * 0.72, 280),
          child: Row(
            children: [
              Icon(
                widget.isPlaying ? Icons.pause : Icons.play_arrow,
                color: _fg,
                size: 28,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SizedBox(
                  height: 28,
                  child: AnimatedBuilder(
                    animation: _playAnim,
                    builder: (context, _) {
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: List.generate(_barHeights.length, (i) {
                          final base = _barHeights[i];
                          final boost = widget.isPlaying
                              ? math.sin(
                                      _playAnim.value * math.pi * 2 + i * 0.45,
                                    ) *
                                    6
                              : 0.0;
                          final h = (base + boost).clamp(4.0, 28.0);
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 0.8,
                              ),
                              child: Container(
                                height: h,
                                decoration: BoxDecoration(
                                  color: _fg.withValues(
                                    alpha: widget.isPlaying ? 0.95 : 0.55,
                                  ),
                                  borderRadius: BorderRadius.circular(1.5),
                                ),
                              ),
                            ),
                          );
                        }),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                _durationLabel,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: _fgMuted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
