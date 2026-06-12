import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/pricing_controller.dart';
import 'pass_price_labels.dart';

/// Sticky upsell below the chat header before private mode is purchased.
///
/// Rendered as a premium floating card: rich romantic gradient, a soft
/// breathing glow, a slow shimmer sweep and a glassy heart badge to draw the
/// eye toward the unlock action.
class PrivateModeRomanticBanner extends StatefulWidget {
  const PrivateModeRomanticBanner({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  State<PrivateModeRomanticBanner> createState() =>
      _PrivateModeRomanticBannerState();
}

class _PrivateModeRomanticBannerState extends State<PrivateModeRomanticBanner>
    with SingleTickerProviderStateMixin {
  static const double _radius = 18;

  late final AnimationController _controller;
  late final Animation<double> _shimmer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3400),
    )..repeat();
    // Shimmer sweeps across early in the cycle, then rests for a beat.
    _shimmer = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0, 0.55, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bannerWidth = MediaQuery.sizeOf(context).width * 0.9;

    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 10, 0, 8),
      child: Center(
        child: SizedBox(
          width: bannerWidth,
          child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          // Gentle 0..1 breathing value for the glow + heart pulse.
          final pulse = 0.5 + 0.5 * math.sin(_controller.value * 2 * math.pi);
          final sweep = -0.3 + 1.6 * _shimmer.value;
          // Two quick nudges per cycle (2x the prior arrow frequency).
          final nudgeCycle = (_controller.value * 2) % 1.0;
          final nudge = nudgeCycle < 0.22
              ? math.sin((nudgeCycle / 0.22) * math.pi)
              : 0.0;
          return DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_radius),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFB5246B)
                      .withValues(alpha: 0.30 + 0.14 * pulse),
                  blurRadius: 20 + 8 * pulse,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(_radius),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: widget.onTap,
                splashColor: Colors.white.withValues(alpha: 0.18),
                highlightColor: Colors.white.withValues(alpha: 0.08),
                child: Stack(
                  children: [
                    const Positioned.fill(child: _GradientBase()),
                    Positioned.fill(child: _ShimmerSweep(position: sweep)),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 13),
                      child: SizedBox(
                        width: double.infinity,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Center(child: _HeartBadge(pulse: pulse)),
                            const SizedBox(height: 9),
                            _BannerCopy(nudge: nudge),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
          ),
        ),
      ),
    );
  }
}

class _GradientBase extends StatelessWidget {
  const _GradientBase();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF5B1B6E),
            Color(0xFFA8246F),
            Color(0xFFE0518F),
          ],
          stops: [0.0, 0.55, 1.0],
        ),
      ),
    );
  }
}

class _ShimmerSweep extends StatelessWidget {
  const _ShimmerSweep({required this.position});

  /// Center of the highlight band, swept from <0 to >1.
  final double position;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withValues(alpha: 0.0),
              Colors.white.withValues(alpha: 0.22),
              Colors.white.withValues(alpha: 0.0),
            ],
            stops: [
              (position - 0.18).clamp(0.0, 1.0),
              position.clamp(0.0, 1.0),
              (position + 0.18).clamp(0.0, 1.0),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeartBadge extends StatelessWidget {
  const _HeartBadge({required this.pulse});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 25,
      height: 25,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.32),
            Colors.white.withValues(alpha: 0.12),
          ],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.45)),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.22 * pulse),
            blurRadius: 12 * pulse,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Center(
        child: Transform.scale(
          scale: 1 + 0.08 * pulse,
          child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 13),
        ),
      ),
    );
  }
}

class _BannerCopy extends StatelessWidget {
  const _BannerCopy({required this.nudge});

  /// 0..1 attention value forwarded to the CTA arrow.
  final double nudge;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Romance, Call & Photos',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 16.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1.2,
                    letterSpacing: 0.1,
                  ),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.auto_awesome, size: 14, color: Color(0xFFFFD27D)),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.verified_user_rounded,
                  size: 12,
                  color: Colors.white.withValues(alpha: 0.75),
                ),
                const SizedBox(width: 5),
                Text(
                  'Only for 18+ age',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    color: Colors.white.withValues(alpha: 0.82),
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 11),
          Center(child: _UnlockCTA(nudge: nudge)),
        ],
      ),
    );
  }
}

class _UnlockCTA extends StatelessWidget {
  const _UnlockCTA({required this.nudge});

  /// 0..1 attention value that slides the arrow to the right and back.
  final double nudge;

  static const _label = Color(0xFFA8246F);
  static const _baseFontSize = 13.0;
  static const _priceFontSize = _baseFontSize * 1.5;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(13, 7, 10, 7),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF3B0E48).withValues(alpha: 0.28),
            blurRadius: 9,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_open_rounded, size: 15, color: _label),
          const SizedBox(width: 5),
          ListenableBuilder(
            listenable: PricingController.instance,
            builder: (context, _) {
              final pricing = PricingController.instance.privateMode;
              if (pricing == null) {
                return Text(
                  'Unlock',
                  style: GoogleFonts.inter(
                    fontSize: _baseFontSize,
                    fontWeight: FontWeight.w800,
                    color: _label,
                  ),
                );
              }

              return PassUnlockPriceRow(
                pricing: pricing,
                prefix: 'Unlock at ',
                labelColor: _label,
                baseFontSize: _baseFontSize,
                priceFontSize: _priceFontSize,
                showArrow: true,
                arrowNudge: nudge,
                arrowSize: 16,
              );
            },
          ),
        ],
      ),
    );
  }
}
