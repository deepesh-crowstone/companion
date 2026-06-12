class PersonalityAccess {
  const PersonalityAccess({
    required this.passActive,
    required this.unlockedUntil,
    required this.priceInr,
    required this.strikePriceInr,
    required this.passDays,
    required this.cashfreeConfigured,
    required this.cashfreeEnvironment,
  });

  final bool passActive;
  final String? unlockedUntil;
  final int priceInr;
  final int strikePriceInr;
  final int passDays;
  final bool cashfreeConfigured;
  final String cashfreeEnvironment;

  factory PersonalityAccess.fromJson(Map<String, dynamic> json) {
    final priceInr = (json['priceInr'] as num).toInt();
    final strikeRaw = json['strikePriceInr'];
    final strikePriceInr =
        strikeRaw is num ? strikeRaw.toInt() : priceInr;
    return PersonalityAccess(
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      priceInr: priceInr,
      strikePriceInr: strikePriceInr < priceInr ? priceInr : strikePriceInr,
      passDays: (json['passDays'] as num?)?.toInt() ?? 30,
      cashfreeConfigured: json['cashfreeConfigured'] as bool? ?? false,
      cashfreeEnvironment: json['cashfreeEnvironment'] as String? ?? 'sandbox',
    );
  }
}

class PersonalityPaymentOrder {
  const PersonalityPaymentOrder({
    required this.orderId,
    required this.paymentSessionId,
    required this.amountInr,
    required this.passDays,
    required this.environment,
  });

  final String orderId;
  final String paymentSessionId;
  final int amountInr;
  final int passDays;
  final String environment;

  factory PersonalityPaymentOrder.fromJson(Map<String, dynamic> json) {
    return PersonalityPaymentOrder(
      orderId: json['orderId'] as String,
      paymentSessionId: json['paymentSessionId'] as String,
      amountInr: (json['amountInr'] as num).toInt(),
      passDays: (json['passDays'] as num?)?.toInt() ?? 30,
      environment: json['environment'] as String? ?? 'sandbox',
    );
  }
}

class PersonalityVerifyResult {
  const PersonalityVerifyResult({
    required this.paid,
    required this.passActive,
    this.unlockedUntil,
    this.orderStatus,
  });

  final bool paid;
  final bool passActive;
  final String? unlockedUntil;
  final String? orderStatus;

  factory PersonalityVerifyResult.fromJson(Map<String, dynamic> json) {
    return PersonalityVerifyResult(
      paid: json['paid'] as bool? ?? false,
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      orderStatus: json['orderStatus'] as String?,
    );
  }
}
