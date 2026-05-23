import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/intimacy.dart';
import '../services/api_service.dart';
import '../services/intimacy_payment_service.dart';
import '../theme/mia_theme.dart';

class _IntimacySheetClose {
  bool explicitNotNow = false;
}

Future<IntimacyStatus?> showIntimacyUnlockSheet({
  required BuildContext context,
  required IntimacyNudge nudge,
  ValueChanged<IntimacyStatus>? onUnlocked,
}) {
  final close = _IntimacySheetClose();

  return showModalBottomSheet<IntimacyStatus>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _IntimacyUnlockSheet(
      nudge: nudge,
      onUnlocked: onUnlocked,
      onNotNow: () {
        close.explicitNotNow = true;
        unawaited(
          ApiService.instance.trackEvent(
            'intimacy_not_now_clicked',
            eventTime: DateTime.now(),
          ),
        );
        Navigator.of(ctx).pop();
      },
    ),
  ).then((status) {
    if (status == null && !close.explicitNotNow) {
      unawaited(
        ApiService.instance.trackEvent(
          'intimacy_nudge_dismissed',
          eventTime: DateTime.now(),
        ),
      );
    }
    return status;
  });
}

class _IntimacyUnlockSheet extends StatefulWidget {
  const _IntimacyUnlockSheet({
    required this.nudge,
    this.onUnlocked,
    required this.onNotNow,
  });

  final IntimacyNudge nudge;
  final ValueChanged<IntimacyStatus>? onUnlocked;
  final VoidCallback onNotNow;

  @override
  State<_IntimacyUnlockSheet> createState() => _IntimacyUnlockSheetState();
}

class _IntimacyUnlockSheetState extends State<_IntimacyUnlockSheet> {
  bool _paying = false;
  String? _error;

  Future<void> _unlock() async {
    if (_paying) return;
    unawaited(
      ApiService.instance.trackEvent(
        'intimacy_unlock_clicked',
        eventTime: DateTime.now(),
      ),
    );
    setState(() {
      _paying = true;
      _error = null;
    });

    try {
      final order = await ApiService.instance.createIntimacyOrder(
        widget.nudge.requiredLevel,
      );

      await IntimacyPaymentService.instance.startCheckout(
        orderId: order.orderId,
        paymentSessionId: order.paymentSessionId,
        environment: order.environment,
        onVerify: (orderId) async {
          final result = await ApiService.instance.verifyIntimacyOrder(orderId);
          if (!result.paid) {
            throw Exception(
              result.orderStatus != null
                  ? 'Payment pending (${result.orderStatus})'
                  : 'Payment not completed yet',
            );
          }
          final status = await ApiService.instance.fetchIntimacyStatus();
          widget.onUnlocked?.call(status);
          if (mounted) Navigator.of(context).pop(status);
        },
        onError: (message) {
          if (mounted) {
            setState(() => _error = message);
          }
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
            widget.nudge.title,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: MiaColors.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            widget.nudge.description,
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
                    'Zara felt that vibe — unlock this lane to go deeper.',
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
                : Text('Unlock for ₹${widget.nudge.priceInr}'),
          ),
          const SizedBox(height: 10),
          TextButton(
            onPressed: _paying ? null : widget.onNotNow,
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
