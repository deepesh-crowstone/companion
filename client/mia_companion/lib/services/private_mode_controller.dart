import 'package:flutter/material.dart';

import '../models/private_mode_access.dart';
import 'api_service.dart';
import 'pricing_controller.dart';

/// Paid private romantic mode: access from server, active session synced via API.
class PrivateModeController extends ChangeNotifier {
  PrivateModeController._();

  static final PrivateModeController instance = PrivateModeController._();

  PrivateModeAccess? _access;

  PrivateModeAccess? get access => _access;
  bool get passActive => _access?.passActive ?? false;
  bool get ageSet => _access?.ageSet ?? false;
  bool get privateModeActive => _access?.privateModeActive ?? false;
  bool get needsSetup => passActive && !ageSet;
  bool get showRomanticBanner => !passActive;
  bool get showPrivateStrip => passActive;

  Future<void> refreshAccess() async {
    if (!ApiService.instance.isLoggedIn) return;
    try {
      _access = await ApiService.instance.fetchPrivateModeAccess();
      if (_access != null) {
        PricingController.instance.applyPrivateMode(
          priceInr: _access!.priceInr,
          strikePriceInr: _access!.strikePriceInr,
          passDays: _access!.passDays,
        );
      }
    } catch (_) {
      // Keep last known access on transient errors.
    }
    notifyListeners();
  }

  void applyAccess(PrivateModeAccess access) {
    _access = access;
    PricingController.instance.applyPrivateMode(
      priceInr: access.priceInr,
      strikePriceInr: access.strikePriceInr,
      passDays: access.passDays,
    );
    notifyListeners();
  }

  Future<void> enterPrivateMode() async {
    final access = await ApiService.instance.enterPrivateMode();
    _access = access;
    notifyListeners();
  }

  Future<int> exitPrivateMode() async {
    final result = await ApiService.instance.exitPrivateMode();
    _access = result.access;
    notifyListeners();
    return result.deletedMessageCount;
  }

  void clear() {
    _access = null;
    notifyListeners();
  }
}
