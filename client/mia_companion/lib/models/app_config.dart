import 'pass_pricing.dart';

class AppConfig {
  const AppConfig({
    required this.freeDailyMessageLimit,
    required this.privateModePass,
    required this.personalityPass,
  });

  final int freeDailyMessageLimit;
  final PassPricing privateModePass;
  final PassPricing personalityPass;

  factory AppConfig.fromJson(Map<String, dynamic> json) {
    return AppConfig(
      freeDailyMessageLimit: (json['freeDailyMessageLimit'] as num).toInt(),
      privateModePass:
          PassPricing.fromJson(json['privateModePass'] as Map<String, dynamic>),
      personalityPass: PassPricing.fromJson(
        json['personalityPass'] as Map<String, dynamic>,
      ),
    );
  }
}
