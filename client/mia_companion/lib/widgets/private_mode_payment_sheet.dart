import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../services/api_service.dart';
import '../services/personality_payment_service.dart';
import '../services/private_mode_controller.dart';
import '../theme/mia_theme.dart';

Future<bool> showPrivateModePaymentSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _PrivateModePaymentSheet(),
  ).then((value) => value ?? false);
}

class _PrivateModePaymentSheet extends StatefulWidget {
  const _PrivateModePaymentSheet();

  @override
  State<_PrivateModePaymentSheet> createState() =>
      _PrivateModePaymentSheetState();
}

class _PrivateModePaymentSheetState extends State<_PrivateModePaymentSheet> {
  static const _ctaColor = Color(0xFF5F269F);
  static const _offerDuration = Duration(minutes: 5);

  bool _paying = false;
  bool _confirmed18 = false;
  String? _error;
  Duration _remaining = _offerDuration;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
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
    super.dispose();
  }

  String get _timerLabel {
    final m = _remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = _remaining.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  Future<void> _pay() async {
    if (_paying || !_confirmed18) return;
    unawaited(
      ApiService.instance.trackEvent('private_mode_pay_clicked'),
    );
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

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewPaddingOf(context).bottom;

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      padding: EdgeInsets.fromLTRB(24, 28, 24, 20 + bottom),
      decoration: BoxDecoration(
        color: MiaColors.surface,
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFB83280).withValues(alpha: 0.15),
            blurRadius: 32,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: MiaColors.accentLight,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Zara se unlimited private batein karein',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: MiaColors.textPrimary,
            ),
          ),
          const SizedBox(height: 14),
          _FeatureRow(icon: Icons.verified_user_outlined, text: '100% Safe and Private'),
          const SizedBox(height: 8),
          _FeatureRow(
            icon: Icons.timer_off_outlined,
            text: 'Auto Disappearing Messages',
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF0F6),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFF5C6DC)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.local_fire_department_rounded,
                    size: 18, color: Colors.pink.shade700),
                const SizedBox(width: 8),
                Text(
                  'Offer ends in $_timerLabel',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.pink.shade800,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          CheckboxListTile(
            value: _confirmed18,
            onChanged: _paying
                ? null
                : (v) => setState(() => _confirmed18 = v ?? false),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(
              'I confirm that I am 18+ years old',
              style: GoogleFonts.inter(
                fontSize: 13,
                color: MiaColors.textMuted,
                height: 1.35,
              ),
            ),
          ),
          if (_error != null) ...[
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 13, color: MiaColors.accentDeep),
            ),
            const SizedBox(height: 10),
          ],
          FilledButton(
            onPressed: (_paying || !_confirmed18) ? null : _pay,
            style: FilledButton.styleFrom(
              backgroundColor: _ctaColor,
              disabledBackgroundColor: _ctaColor.withValues(alpha: 0.55),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 18),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: _paying
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        '₹1599',
                        style: GoogleFonts.inter(
                          fontSize: 15,
                          decoration: TextDecoration.lineThrough,
                          color: Colors.white.withValues(alpha: 0.75),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Pay ₹199',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _paying ? null : () => Navigator.of(context).pop(false),
            child: Text(
              'Not now',
              style: GoogleFonts.inter(color: MiaColors.textMuted),
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: MiaColors.accentDeep),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: MiaColors.textPrimary,
            ),
          ),
        ),
      ],
    );
  }
}
