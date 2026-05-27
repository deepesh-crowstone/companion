import 'package:flutter/material.dart';

import '../models/app_deep_link.dart';
import '../screens/mia_profile_screen.dart';
import '../screens/user_profile_screen.dart';
import '../screens/voice_call_screen.dart';

final rootNavigatorKey = GlobalKey<NavigatorState>();

void applyAppDeepLink(PendingAppDeepLink link) {
  final navigator = rootNavigatorKey.currentState;
  if (navigator == null) return;

  switch (link.destination) {
    case AppDeepLinkDestination.chat:
    case AppDeepLinkDestination.onboarding:
      return;
    case AppDeepLinkDestination.zaraProfile:
      navigator.push(
        MaterialPageRoute(builder: (_) => const MiaProfileScreen()),
      );
    case AppDeepLinkDestination.userProfile:
      navigator.push(
        MaterialPageRoute(builder: (_) => const UserProfileScreen()),
      );
    case AppDeepLinkDestination.voiceCall:
      navigator.push(
        MaterialPageRoute(builder: (_) => const VoiceCallScreen()),
      );
  }
}
