import 'package:audio_session/audio_session.dart';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../theme/mia_theme.dart';

/// Full-screen looping video background for the onboarding welcome screen.
class OnboardingVideoBackground extends StatefulWidget {
  const OnboardingVideoBackground({super.key});

  static const videoAsset = 'assets/onboarding_video.mp4';

  @override
  State<OnboardingVideoBackground> createState() =>
      _OnboardingVideoBackgroundState();
}

class _OnboardingVideoBackgroundState extends State<OnboardingVideoBackground> {
  VideoPlayerController? _controller;
  var _ready = false;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  Future<void> _initVideo() async {
    final controller = VideoPlayerController.asset(
      OnboardingVideoBackground.videoAsset,
    )..setLooping(true);

    try {
      final session = await AudioSession.instance;
      await session.configure(
        const AudioSessionConfiguration(
          avAudioSessionCategory: AVAudioSessionCategory.playback,
          avAudioSessionCategoryOptions:
              AVAudioSessionCategoryOptions.mixWithOthers,
          avAudioSessionMode: AVAudioSessionMode.moviePlayback,
        ),
      );
    } catch (_) {}

    try {
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await controller.setVolume(1);
      await controller.play();
      _controller = controller;
      setState(() => _ready = true);
    } catch (_) {
      await controller.dispose();
      if (!mounted) return;
      setState(() => _ready = false);
    }
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null) {
      controller.pause();
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _ready && _controller != null
            ? _VideoCover(controller: _controller!)
            : ColoredBox(color: MiaColors.background),
        const _OnboardingScrim(),
      ],
    );
  }
}

class _VideoCover extends StatelessWidget {
  const _VideoCover({required this.controller});

  final VideoPlayerController controller;

  @override
  Widget build(BuildContext context) {
    final size = controller.value.size;
    if (size.width == 0 || size.height == 0) {
      return ColoredBox(color: MiaColors.background);
    }

    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        alignment: Alignment.center,
        child: SizedBox(
          width: size.width,
          height: size.height,
          child: VideoPlayer(controller),
        ),
      ),
    );
  }
}

class _OnboardingScrim extends StatelessWidget {
  const _OnboardingScrim();

  @override
  Widget build(BuildContext context) {
    final topTintHeight = MediaQuery.sizeOf(context).height * 0.35;

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          height: topTintHeight,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.82),
                  Colors.black.withValues(alpha: 0.58),
                  Colors.black.withValues(alpha: 0.0),
                ],
                stops: const [0.0, 0.62, 1.0],
              ),
            ),
          ),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.transparent,
                MiaColors.background.withValues(alpha: 0.82),
              ],
              stops: const [0.55, 1.0],
            ),
          ),
        ),
      ],
    );
  }
}
