class PrivateModeAccess {
  const PrivateModeAccess({
    required this.passActive,
    required this.unlockedUntil,
    required this.priceInr,
    required this.trialAmountInr,
    required this.mandateAmountInr,
    required this.passDays,
    required this.trialDays,
    required this.paymentType,
    required this.ageSet,
    required this.privateModeActive,
  });

  final bool passActive;
  final String? unlockedUntil;
  final int priceInr;
  final int trialAmountInr;
  final int mandateAmountInr;
  final int passDays;
  final int trialDays;
  final String paymentType;
  final bool ageSet;
  final bool privateModeActive;

  factory PrivateModeAccess.fromJson(Map<String, dynamic> json) {
    final mandate =
        (json['mandateAmountInr'] as num?)?.toInt() ??
        (json['priceInr'] as num?)?.toInt() ??
        199;
    return PrivateModeAccess(
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      priceInr: mandate,
      trialAmountInr: (json['trialAmountInr'] as num?)?.toInt() ?? 1,
      mandateAmountInr: mandate,
      passDays: json['passDays'] as int? ?? 30,
      trialDays: json['trialDays'] as int? ?? 1,
      paymentType: json['paymentType'] as String? ?? 'subscription',
      ageSet: json['ageSet'] as bool? ?? false,
      privateModeActive: json['privateModeActive'] as bool? ?? false,
    );
  }
}

class PrivateModePaymentOrder {
  const PrivateModePaymentOrder({
    required this.subscriptionId,
    required this.subscriptionSessionId,
    required this.trialAmountInr,
    required this.mandateAmountInr,
    required this.environment,
    this.firstChargeTime,
  });

  final String subscriptionId;
  final String subscriptionSessionId;
  final int trialAmountInr;
  final int mandateAmountInr;
  final String environment;
  final String? firstChargeTime;

  factory PrivateModePaymentOrder.fromJson(Map<String, dynamic> json) {
    final subscriptionId =
        json['subscriptionId'] as String? ?? json['orderId'] as String? ?? '';
    final subscriptionSessionId =
        json['subscriptionSessionId'] as String? ??
        json['paymentSessionId'] as String? ??
        '';
    return PrivateModePaymentOrder(
      subscriptionId: subscriptionId,
      subscriptionSessionId: subscriptionSessionId,
      trialAmountInr:
          (json['trialAmountInr'] as num?)?.toInt() ??
          (json['amountInr'] as num?)?.toInt() ??
          1,
      mandateAmountInr:
          (json['mandateAmountInr'] as num?)?.toInt() ??
          (json['priceInr'] as num?)?.toInt() ??
          199,
      environment: json['environment'] as String? ?? 'sandbox',
      firstChargeTime: json['firstChargeTime'] as String?,
    );
  }
}

class PrivateModeVerifyResult {
  const PrivateModeVerifyResult({
    required this.paid,
    required this.passActive,
    this.unlockedUntil,
    this.ageSet = false,
    this.trialGranted = false,
    this.nextScheduleDate,
  });

  final bool paid;
  final bool passActive;
  final String? unlockedUntil;
  final bool ageSet;
  final bool trialGranted;
  final String? nextScheduleDate;

  factory PrivateModeVerifyResult.fromJson(Map<String, dynamic> json) {
    return PrivateModeVerifyResult(
      paid: json['paid'] as bool? ?? json['authorized'] as bool? ?? false,
      passActive: json['passActive'] as bool? ?? false,
      unlockedUntil: json['unlockedUntil'] as String?,
      ageSet: json['ageSet'] as bool? ?? false,
      trialGranted: json['trialGranted'] as bool? ?? false,
      nextScheduleDate: json['nextScheduleDate'] as String?,
    );
  }
}
