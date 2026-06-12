import 'package:flutter/material.dart';

import '../models/pass_pricing.dart';
import 'api_service.dart';

/// Server-driven pass pricing for paywalls and unlock CTAs.
class PricingController extends ChangeNotifier {
  PricingController._();

  static final PricingController instance = PricingController._();

  PassPricing? _privateMode;
  PassPricing? _personality;

  PassPricing? get privateMode => _privateMode;
  PassPricing? get personality => _personality;

  Future<void> load() async {
    try {
      final config = await ApiService.instance.fetchAppConfig();
      _privateMode = config.privateModePass;
      _personality = config.personalityPass;
      notifyListeners();
    } catch (_) {
      // Keep last known pricing on transient errors.
    }
  }

  void applyPrivateMode({
    required int priceInr,
    required int strikePriceInr,
    required int passDays,
  }) {
    _privateMode = PassPricing(
      priceInr: priceInr,
      strikePriceInr: strikePriceInr < priceInr ? priceInr : strikePriceInr,
      passDays: passDays,
    );
    notifyListeners();
  }

  void applyPersonality({
    required int priceInr,
    required int strikePriceInr,
    required int passDays,
  }) {
    _personality = PassPricing(
      priceInr: priceInr,
      strikePriceInr: strikePriceInr < priceInr ? priceInr : strikePriceInr,
      passDays: passDays,
    );
    notifyListeners();
  }

  void clear() {
    _privateMode = null;
    _personality = null;
    notifyListeners();
  }
}
