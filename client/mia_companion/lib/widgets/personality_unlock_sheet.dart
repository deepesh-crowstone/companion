import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../models/pass_pricing.dart';
import '../models/zara_mood.dart';
import '../services/analytics.dart';
import '../services/api_service.dart';
import '../services/mood_controller.dart';
import '../services/personality_payment_service.dart';
import '../services/pricing_controller.dart';
import '../theme/mia_theme.dart';
import 'account_credentials_sheet.dart';
import 'pass_price_labels.dart';

Future<bool> showPersonalityUnlockSheet({
  required BuildContext context,
  required ZaraMood mood,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _PersonalityUnlockSheet(targetMood: mood),
  ).then((value) => value ?? false);
}

class _PersonalityUnlockSheet extends StatefulWidget {
  const _PersonalityUnlockSheet({required this.targetMood});

  final ZaraMood targetMood;

  @override
  State<_PersonalityUnlockSheet> createState() =>
      _PersonalityUnlockSheetState();
}

class _PersonalityUnlockSheetState extends State<_PersonalityUnlockSheet> {
  bool _paying = false;
  String? _error;
  int _passDays = 30;

  @override
  void initState() {
    super.initState();
    final access = MoodController.instance.access;
    if (access != null) {
      _passDays = access.passDays;
    } else {
      final pricing = PricingController.instance.personality;
      if (pricing != null) {
        _passDays = pricing.passDays;
      }
    }
  }

  Future<void> _unlock() async {
    if (_paying) return;
    unawaited(Analytics.track(AnalyticsEvents.personalityUnlockClicked));
    setState(() {
      _paying = true;
      _error = null;
    });

    try {
      final order = await ApiService.instance.createPersonalityOrder();

      await PersonalityPaymentService.instance.startCheckout(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        environment: order.environment,
        onVerify: (orderId) async {
          final result = await ApiService.instance.verifyPersonalityOrder(
            orderId,
          );
          if (!result.paid) {
            throw Exception(
              result.orderStatus != null
                  ? 'Payment pending (${result.orderStatus})'
                  : 'Payment not completed yet',
            );
          }
          final access = await ApiService.instance.fetchPersonalityAccess();
          MoodController.instance.applyAccess(access);
          await MoodController.instance.setMood(widget.targetMood);
          await ApiService.instance.requireAccountCredentials();
          if (!mounted) return;
          await promptAccountCredentialsIfNeeded(context);
          if (mounted) Navigator.of(context).pop(true);
        },
        onError: (message) {
          if (mounted) setState(() => _error = message);
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
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
            color: MiaColors.accentDeep.withValues(alpha: 0.12),
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
          const SizedBox(height: 20),
          Text(
            'Unlock ${widget.targetMood.label}',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: MiaColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'Get Funny, Caring, and Flirty & Bold personalities for $_passDays days. Friendly stays free.',
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 15,
              height: 1.45,
              color: MiaColors.textMuted,
            ),
          ),
          const SizedBox(height: 22),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
            decoration: BoxDecoration(
              color: MiaColors.chatBackground,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                Icon(Icons.lock_open_rounded, color: MiaColors.accentDeep, size: 22),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Switch Zara\'s tone anytime while your pass is active.',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      height: 1.4,
                      color: MiaColors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 13, color: MiaColors.accentDeep),
            ),
          ],
          const SizedBox(height: 22),
          FilledButton(
            onPressed: _paying ? null : _unlock,
            child: _paying
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : ListenableBuilder(
                    listenable: PricingController.instance,
                    builder: (context, _) {
                      final pricing = PricingController.instance.personality;
                      if (pricing == null) {
                        return const Text('Unlock');
                      }
                      if (!pricing.showStrikePrice) {
                        return Text('Unlock for ${formatInr(pricing.priceInr)}');
                      }
                      return PassUnlockPriceRow(
                        pricing: pricing,
                        prefix: 'Unlock for ',
                        labelColor: Colors.white,
                        baseFontSize: 16,
                        priceFontSize: 16,
                      );
                    },
                  ),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: _paying ? null : () => Navigator.of(context).pop(false),
            child: Text(
              'Not now',
              style: GoogleFonts.inter(
                color: MiaColors.textMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String formatPersonalityExpiry(String? iso) {
  if (iso == null) return '';
  final dt = DateTime.tryParse(iso);
  if (dt == null) return '';
  return DateFormat('d MMM').format(dt.toLocal());
}
