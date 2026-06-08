class PrivateModeAccess {
  const PrivateModeAccess({
    required this.passActive,
    required this.unlockedUntil,
    required this.priceInr,
    required this.passDays,
    required this.ageSet,
    required this.privateModeActive,
  });

  final bool passActive;
  final String? unlockedUntil;
  final int priceInr;
  final int passDays;
  final bool ageSet;
  final bool privateModeActive;

  factory PrivateModeAccess.fromJson(Map<String, dynamic> json) {
    return PrivateModeAccess(
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      priceInr: json['priceInr'] as int? ?? 9,
      passDays: json['passDays'] as int? ?? 30,
      ageSet: json['ageSet'] as bool? ?? false,
      privateModeActive: json['privateModeActive'] as bool? ?? false,
    );
  }
}

class PrivateModePaymentOrder {
  const PrivateModePaymentOrder({
    required this.orderId,
    required this.paymentSessionId,
    required this.amountInr,
    required this.environment,
  });

  final String orderId;
  final String paymentSessionId;
  final int amountInr;
  final String environment;

  factory PrivateModePaymentOrder.fromJson(Map<String, dynamic> json) {
    return PrivateModePaymentOrder(
      orderId: json['orderId'] as String,
      paymentSessionId: json['paymentSessionId'] as String,
      environment: json['environment'] as String? ?? 'sandbox',
      amountInr: (json['amountInr'] as num?)?.toInt() ?? 9,
    );
  }
}

class PrivateModeVerifyResult {
  const PrivateModeVerifyResult({
    required this.paid,
    required this.passActive,
    this.unlockedUntil,
    this.ageSet = false,
  });

  final bool paid;
  final bool passActive;
  final String? unlockedUntil;
  final bool ageSet;

  factory PrivateModeVerifyResult.fromJson(Map<String, dynamic> json) {
    return PrivateModeVerifyResult(
      paid: json['paid'] as bool? ?? false,
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      ageSet: json['ageSet'] as bool? ?? false,
    );
  }
}
