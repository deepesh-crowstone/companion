import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../data/mia_profile.dart';
import '../data/profile_legal_content.dart';
import '../services/analytics.dart';
import '../services/api_service.dart';
import '../services/personality_payment_service.dart';
import '../services/private_mode_controller.dart';
import 'account_credentials_sheet.dart';
import 'legal_content_sheet.dart';

// Brand tokens shared with PrivateModeRomanticBanner so the wall reads as a
// direct extension of that banner.
const _brandDeep = Color(0xFF3A0E4D);
const _brandPlum = Color(0xFF5B1B6E);
const _brandMagenta = Color(0xFFA8246F);
const _brandPink = Color(0xFFE0518F);
const _brandGold = Color(0xFFFFD27D);

const _backgroundGradient = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [_brandDeep, _brandPlum, _brandMagenta, _brandPink],
  stops: [0.0, 0.32, 0.72, 1.0],
);

/// Opens the full-screen private-mode paywall and resolves to whether the
/// user completed payment.
Future<bool> showPrivateModePaymentSheet(BuildContext context) {
  return Navigator.of(context)
      .push<bool>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => const _PrivateModePaymentWall(),
        ),
      )
      .then((value) => value ?? false);
}

class _PrivateModePaymentWall extends StatefulWidget {
  const _PrivateModePaymentWall();

  @override
  State<_PrivateModePaymentWall> createState() =>
      _PrivateModePaymentWallState();
}

class _PrivateModePaymentWallState extends State<_PrivateModePaymentWall>
    with SingleTickerProviderStateMixin {
  static const _offerDuration = Duration(minutes: 5);

  bool _paying = false;
  String? _error;
  Duration _remaining = _offerDuration;
  Timer? _timer;
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    unawaited(Analytics.track(AnalyticsEvents.paywallShown));
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3400),
    )..repeat();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _remaining = _offerDuration);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_remaining.inSeconds <= 1) {
        setState(() => _remaining = _offerDuration);
        return;
      }
      setState(() => _remaining -= const Duration(seconds: 1));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _anim.dispose();
    super.dispose();
  }

  String get _timerLabel {
    final m = _remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _remaining.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _pay() async {
    if (_paying) return;
    setState(() {
      _paying = true;
      _error = null;
    });

    try {
      final order = await ApiService.instance.createPrivateModeOrder();
      await PersonalityPaymentService.instance.startCheckout(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        environment: order.environment,
        onVerify: (orderId) async {
          final result = await ApiService.instance.verifyPrivateModeOrder(
            orderId,
          );
          if (!result.paid) {
            throw Exception('Payment not completed yet');
          }
          await PrivateModeController.instance.refreshAccess();
          await ApiService.instance.requireAccountCredentials();
          if (!mounted) return;
          await promptAccountCredentialsIfNeeded(context);
          if (!mounted) return;
          Navigator.of(context).pop(true);
        },
        onError: (message) {
          if (mounted) setState(() => _error = message);
        },
      );
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  void _onPayTapped() {
    unawaited(Analytics.track(AnalyticsEvents.paywallPayClicked));
    unawaited(_pay());
  }

  void _onPhotoCollageTapped() {
    unawaited(Analytics.track(AnalyticsEvents.paywallPhotoCollageClicked));
    unawaited(_pay());
  }

  void _onCloseTapped() {
    unawaited(Analytics.track(AnalyticsEvents.paywallCloseClicked));
    Navigator.of(context).pop(false);
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _brandDeep,
        body: Stack(
          children: [
            const Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: _backgroundGradient),
              ),
            ),
            SafeArea(
              child: Column(
                children: [
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(0, 6, 8, 0),
                      child: _CloseButton(
                        onTap: _onCloseTapped,
                      ),
                    ),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(20, 36, 20, 16),
                      child: Column(
                        children: [
                          Center(
                            child: _LockedPhotoPreview(
                              onTap: _paying ? null : _onPhotoCollageTapped,
                            ),
                          ),
                          const SizedBox(height: 18),
                          _Headline(),
                          const SizedBox(height: 6),
                          Text(
                            'Get unlimited private time with Zara',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.inter(
                              fontSize: 13.5,
                              color: Colors.white.withValues(alpha: 0.82),
                              height: 1.3,
                            ),
                          ),
                          const SizedBox(height: 22),
                          const _BenefitTile(
                            icon: Icons.verified_user_rounded,
                            title: '100% safe & private',
                            subtitle: 'Ye chats poori tarah private hain',
                          ),
                          const _BenefitTile(
                            icon: Icons.favorite_rounded,
                            title: 'Romantic chats & photos',
                            subtitle: 'Jaise aap chaaho waise bat karo',
                          ),
                          const _BenefitTile(
                            icon: Icons.call_rounded,
                            title: 'Private calls with Zara',
                            subtitle: 'Jab mann kare tab call karo',
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (_error != null) ...[
                          _ErrorNote(message: _error!),
                          const SizedBox(height: 10),
                        ],
                        Center(child: _OfferTimer(label: _timerLabel)),
                        const SizedBox(height: 10),
                        _UnlockButton(
                          animation: _anim,
                          paying: _paying,
                          onTap: _onPayTapped,
                        ),
                        _LegalLinks(disabled: _paying),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Headline extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Flexible(
          child: Text(
            'Romance, Call & Photos',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.15,
              letterSpacing: 0.1,
            ),
          ),
        ),
        const SizedBox(width: 7),
        const Icon(Icons.auto_awesome, size: 18, color: _brandGold),
      ],
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.16),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: const SizedBox(
          width: 36,
          height: 36,
          child: Icon(Icons.close_rounded, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

class _LockedPhotoPreview extends StatelessWidget {
  const _LockedPhotoPreview({this.onTap});

  final VoidCallback? onTap;

  static const _frontAsset = 'assets/images/paywall_preview.png';
  static const _baseFontSize = 14.0;
  static const _priceFontSize = _baseFontSize * 1.5;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width * 0.54;
    final height = width * 1.05;
    final gallery = MiaProfile.galleryAssets;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: width + 36,
        height: height + 28,
        child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 0,
            top: 10,
            child: Transform.rotate(
              angle: -0.16,
              child: _StackedPhotoCard(
                asset: gallery[1],
                width: width * 0.92,
                height: height * 0.92,
                blurSigma: 4,
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 6,
            child: Transform.rotate(
              angle: 0.14,
              child: _StackedPhotoCard(
                asset: gallery[2],
                width: width * 0.92,
                height: height * 0.92,
                blurSigma: 4,
              ),
            ),
          ),
          Positioned(
            bottom: 0,
            child: Transform.rotate(
              angle: -0.05,
              child: _StackedPhotoCard(
                asset: gallery[3],
                width: width * 0.9,
                height: height * 0.9,
                blurSigma: 5,
              ),
            ),
          ),
          _StackedPhotoCard(
            asset: _frontAsset,
            width: width,
            height: height,
            blurSigma: 7,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'Member Only Photos',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.18),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.45),
                    ),
                  ),
                  child: const Icon(
                    Icons.lock_rounded,
                    color: Colors.white,
                    size: 30,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      'Unlock photos at just ',
                      style: GoogleFonts.inter(
                        fontSize: _baseFontSize,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: 0.1,
                      ),
                    ),
                    Text(
                      '\u20B99',
                      style: GoogleFonts.inter(
                        fontSize: _priceFontSize,
                        fontWeight: FontWeight.w800,
                        color: _brandGold,
                        height: 1.0,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      ),
    );
  }
}

class _StackedPhotoCard extends StatelessWidget {
  const _StackedPhotoCard({
    required this.asset,
    required this.width,
    required this.height,
    required this.blurSigma,
    this.child,
  });

  final String asset;
  final double width;
  final double height;
  final double blurSigma;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.28),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(asset, fit: BoxFit.cover),
          ClipRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
              child: Container(
                color: Colors.black.withValues(alpha: 0.08),
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.04),
                  Colors.black.withValues(alpha: 0.22),
                ],
              ),
            ),
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}

class _BenefitTile extends StatelessWidget {
  const _BenefitTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.30)),
            ),
            child: Icon(icon, color: Colors.white, size: 19),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.inter(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    height: 1.3,
                    color: Colors.white.withValues(alpha: 0.78),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferTimer extends StatelessWidget {
  const _OfferTimer({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: _brandGold.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _brandGold.withValues(alpha: 0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.local_fire_department_rounded,
            size: 18,
            color: _brandGold,
          ),
          const SizedBox(width: 8),
          Text(
            'Offer ends in ',
            style: GoogleFonts.inter(
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: _brandGold,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorNote extends StatelessWidget {
  const _ErrorNote({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.22),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: GoogleFonts.inter(
          fontSize: 13,
          color: Colors.white,
          height: 1.3,
        ),
      ),
    );
  }
}

class _UnlockButton extends StatelessWidget {
  const _UnlockButton({
    required this.animation,
    required this.paying,
    required this.onTap,
  });

  final Animation<double> animation;
  final bool paying;
  final VoidCallback onTap;

  static const _label = Color(0xFFA8246F);
  static const _baseFontSize = 15.0;
  static const _priceFontSize = _baseFontSize * 1.5;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        // Two quick arrow nudges per cycle, matching the banner.
        final nudgeCycle = (animation.value * 2) % 1.0;
        final nudge = nudgeCycle < 0.22
            ? math.sin((nudgeCycle / 0.22) * math.pi)
            : 0.0;
        // Glossy sheen sweeps across early in the cycle, then rests.
        final shimmerT = Curves.easeInOut.transform(
          (animation.value / 0.55).clamp(0.0, 1.0),
        );
        final sweep = -0.3 + 1.6 * shimmerT;
        return DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.28),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(30),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: paying ? null : onTap,
              child: Stack(
                children: [
                  Container(
                    width: double.infinity,
                    height: 58,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: paying
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              valueColor: AlwaysStoppedAnimation(_label),
                            ),
                          )
                        : Row(
                            mainAxisSize: MainAxisSize.min,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.lock_open_rounded,
                                  size: 18, color: _label),
                              const SizedBox(width: 7),
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment:
                                    CrossAxisAlignment.baseline,
                                textBaseline: TextBaseline.alphabetic,
                                children: [
                                  Text(
                                    'Unlock at ',
                                    style: GoogleFonts.inter(
                                      fontSize: _baseFontSize,
                                      fontWeight: FontWeight.w800,
                                      color: _label,
                                      letterSpacing: 0.2,
                                    ),
                                  ),
                                  Text(
                                    '\u20B9299',
                                    style: GoogleFonts.inter(
                                      fontSize: _baseFontSize,
                                      fontWeight: FontWeight.w600,
                                      color: _label.withValues(alpha: 0.55),
                                      letterSpacing: 0.2,
                                      decoration: TextDecoration.lineThrough,
                                      decorationColor:
                                          _label.withValues(alpha: 0.7),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    '\u20B99',
                                    style: GoogleFonts.inter(
                                      fontSize: _priceFontSize,
                                      fontWeight: FontWeight.w800,
                                      color: _label,
                                      letterSpacing: 0.2,
                                      height: 1.0,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(width: 6),
                              Transform.translate(
                                offset: Offset(3 * nudge, 0),
                                child: const Icon(Icons.arrow_forward_rounded,
                                    size: 20, color: _label),
                              ),
                            ],
                          ),
                  ),
                  if (!paying)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                _label.withValues(alpha: 0.0),
                                _label.withValues(alpha: 0.14),
                                _label.withValues(alpha: 0.0),
                              ],
                              stops: [
                                (sweep - 0.18).clamp(0.0, 1.0),
                                sweep.clamp(0.0, 1.0),
                                (sweep + 0.18).clamp(0.0, 1.0),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _LegalLinks extends StatelessWidget {
  const _LegalLinks({required this.disabled});

  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final style = TextButton.styleFrom(
      foregroundColor: Colors.white.withValues(alpha: 0.85),
      minimumSize: const Size(0, 36),
      padding: const EdgeInsets.symmetric(horizontal: 8),
      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
    final textStyle = GoogleFonts.inter(fontSize: 12);

    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        TextButton(
          style: style,
          onPressed: disabled
              ? null
              : () => showLegalContentSheet(
                    context: context,
                    title: 'Privacy Policy',
                    body: ProfileLegalContent.privacyPolicy,
                  ),
          child: Text('Privacy Policy', style: textStyle),
        ),
        Text('·', style: GoogleFonts.inter(color: Colors.white54)),
        TextButton(
          style: style,
          onPressed: disabled
              ? null
              : () => showLegalContentSheet(
                    context: context,
                    title: 'Terms and Conditions',
                    body: ProfileLegalContent.termsAndConditions,
                  ),
          child: Text('Terms', style: textStyle),
        ),
      ],
    );
  }
}
