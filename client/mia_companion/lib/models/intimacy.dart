class IntimacyTierInfo {
  const IntimacyTierInfo({
    required this.level,
    required this.label,
    required this.unlocked,
    required this.priceInr,
    required this.description,
  });

  final int level;
  final String label;
  final bool unlocked;
  final int priceInr;
  final String description;

  factory IntimacyTierInfo.fromJson(Map<String, dynamic> json) {
    return IntimacyTierInfo(
      level: json['level'] as int,
      label: json['label'] as String,
      unlocked: json['unlocked'] as bool,
      priceInr: (json['priceInr'] as num).toInt(),
      description: json['description'] as String,
    );
  }
}

class IntimacyStatus {
  const IntimacyStatus({
    required this.unlockedLevel,
    required this.tiers,
    required this.cashfreeConfigured,
    required this.cashfreeEnvironment,
  });

  final int unlockedLevel;
  final List<IntimacyTierInfo> tiers;
  final bool cashfreeConfigured;
  final String cashfreeEnvironment;

  factory IntimacyStatus.fromJson(Map<String, dynamic> json) {
    final tierList = json['tiers'] as List<dynamic>;
    return IntimacyStatus(
      unlockedLevel: json['unlockedLevel'] as int,
      tiers: tierList
          .map((e) => IntimacyTierInfo.fromJson(e as Map<String, dynamic>))
          .toList(),
      cashfreeConfigured: json['cashfreeConfigured'] as bool? ?? false,
      cashfreeEnvironment: json['cashfreeEnvironment'] as String? ?? 'sandbox',
    );
  }
}

class IntimacyNudge {
  const IntimacyNudge({
    required this.requiredLevel,
    required this.unlockedLevel,
    required this.priceInr,
    required this.title,
    required this.description,
  });

  final int requiredLevel;
  final int unlockedLevel;
  final int priceInr;
  final String title;
  final String description;

  factory IntimacyNudge.fromJson(Map<String, dynamic> json) {
    return IntimacyNudge(
      requiredLevel: json['requiredLevel'] as int,
      unlockedLevel: json['unlockedLevel'] as int,
      priceInr: (json['priceInr'] as num).toInt(),
      title: json['title'] as String,
      description: json['description'] as String,
    );
  }
}

class IntimacyPaymentOrder {
  const IntimacyPaymentOrder({
    required this.orderId,
    required this.paymentSessionId,
    required this.amountInr,
    required this.targetLevel,
    required this.environment,
  });

  final String orderId;
  final String paymentSessionId;
  final int amountInr;
  final int targetLevel;
  final String environment;

  factory IntimacyPaymentOrder.fromJson(Map<String, dynamic> json) {
    return IntimacyPaymentOrder(
      orderId: json['orderId'] as String,
      paymentSessionId: json['paymentSessionId'] as String,
      amountInr: (json['amountInr'] as num).toInt(),
      targetLevel: json['targetLevel'] as int,
      environment: json['environment'] as String? ?? 'sandbox',
    );
  }
}

class IntimacyVerifyResult {
  const IntimacyVerifyResult({
    required this.paid,
    required this.unlockedLevel,
    this.targetLevel,
    this.orderStatus,
  });

  final bool paid;
  final int unlockedLevel;
  final int? targetLevel;
  final String? orderStatus;

  factory IntimacyVerifyResult.fromJson(Map<String, dynamic> json) {
    return IntimacyVerifyResult(
      paid: json['paid'] as bool? ?? false,
      unlockedLevel: json['unlockedLevel'] as int? ?? 1,
      targetLevel: json['targetLevel'] as int?,
      orderStatus: json['orderStatus'] as String?,
    );
  }
}

IntimacyNudge? intimacyNudgeFromJson(Map<String, dynamic>? json) {
  if (json == null) return null;
  return IntimacyNudge.fromJson(json);
}
