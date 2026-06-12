class PassPricing {
  const PassPricing({
    required this.priceInr,
    required this.strikePriceInr,
    required this.passDays,
  });

  final int priceInr;
  final int strikePriceInr;
  final int passDays;

  bool get showStrikePrice => strikePriceInr > priceInr;

  factory PassPricing.fromJson(Map<String, dynamic> json) {
    final priceInr = (json['priceInr'] as num).toInt();
    final strikeRaw = json['strikePriceInr'];
    final strikePriceInr = strikeRaw is num
        ? strikeRaw.toInt()
        : priceInr;
    final passDays = (json['passDays'] as num?)?.toInt() ?? 30;
    return PassPricing(
      priceInr: priceInr,
      strikePriceInr: strikePriceInr < priceInr ? priceInr : strikePriceInr,
      passDays: passDays,
    );
  }
}

String formatInr(int amount) => '\u20B9$amount';
