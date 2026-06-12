import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/pass_pricing.dart';

class PassUnlockPriceRow extends StatelessWidget {
  const PassUnlockPriceRow({
    super.key,
    required this.pricing,
    required this.prefix,
    required this.labelColor,
    required this.baseFontSize,
    this.priceFontSize,
    this.showArrow = false,
    this.arrowNudge = 0,
    this.arrowSize = 16,
  });

  final PassPricing pricing;
  final String prefix;
  final Color labelColor;
  final double baseFontSize;
  final double? priceFontSize;
  final bool showArrow;
  final double arrowNudge;
  final double arrowSize;

  @override
  Widget build(BuildContext context) {
    final resolvedPriceFontSize = priceFontSize ?? baseFontSize * 1.5;
    final prefixStyle = GoogleFonts.inter(
      fontSize: baseFontSize,
      fontWeight: FontWeight.w800,
      color: labelColor,
      letterSpacing: 0.2,
    );
    final strikeStyle = GoogleFonts.inter(
      fontSize: baseFontSize,
      fontWeight: FontWeight.w600,
      color: labelColor.withValues(alpha: 0.55),
      letterSpacing: 0.2,
      decoration: TextDecoration.lineThrough,
      decorationColor: labelColor.withValues(alpha: 0.7),
    );
    final priceStyle = GoogleFonts.inter(
      fontSize: resolvedPriceFontSize,
      fontWeight: FontWeight.w800,
      color: labelColor,
      letterSpacing: 0.2,
      height: 1.0,
    );

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(prefix, style: prefixStyle),
        if (pricing.showStrikePrice) ...[
          Text(formatInr(pricing.strikePriceInr), style: strikeStyle),
          SizedBox(width: baseFontSize * 0.38),
        ],
        Text(formatInr(pricing.priceInr), style: priceStyle),
        if (showArrow) ...[
          SizedBox(width: baseFontSize * 0.23),
          Transform.translate(
            offset: Offset(3 * arrowNudge, 0),
            child: Icon(Icons.arrow_forward_rounded,
                size: arrowSize, color: labelColor),
          ),
        ],
      ],
    );
  }
}

class PassSinglePriceText extends StatelessWidget {
  const PassSinglePriceText({
    super.key,
    required this.pricing,
    required this.style,
  });

  final PassPricing pricing;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    return Text(formatInr(pricing.priceInr), style: style);
  }
}
