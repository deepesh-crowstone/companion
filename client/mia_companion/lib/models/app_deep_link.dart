enum AppDeepLinkDestination {
  chat,
  onboarding,
  zaraProfile,
  userProfile,
  voiceCall,
}

class PendingAppDeepLink {
  const PendingAppDeepLink({
    required this.destination,
    this.campaign,
    this.mediaSource,
    this.isDeferred = false,
  });

  final AppDeepLinkDestination destination;
  final String? campaign;
  final String? mediaSource;
  final bool isDeferred;

  static PendingAppDeepLink? fromDeepLinkValue(
    String? deepLinkValue, {
    String? campaign,
    String? mediaSource,
    bool isDeferred = false,
  }) {
    final value = deepLinkValue?.trim().toLowerCase();
    if (value == null || value.isEmpty) return null;

    final destination = _destinationForValue(value);
    if (destination == null) return null;

    return PendingAppDeepLink(
      destination: destination,
      campaign: campaign,
      mediaSource: mediaSource,
      isDeferred: isDeferred,
    );
  }

  static AppDeepLinkDestination? _destinationForValue(String value) {
    switch (value) {
      case 'chat':
      case 'home':
        return AppDeepLinkDestination.chat;
      case 'onboarding':
      case 'welcome':
      case 'start':
        return AppDeepLinkDestination.onboarding;
      case 'zara_profile':
      case 'zara':
      case 'mia_profile':
        return AppDeepLinkDestination.zaraProfile;
      case 'profile':
      case 'user_profile':
      case 'settings':
        return AppDeepLinkDestination.userProfile;
      case 'voice_call':
      case 'call':
        return AppDeepLinkDestination.voiceCall;
      default:
        return null;
    }
  }
}
