import '../models/companion_profile.dart';

class MiaSocialLink {
  const MiaSocialLink({
    required this.platform,
    required this.handle,
    required this.url,
    required this.icon,
  });

  final String platform;
  final String handle;
  final String url;
  final String icon; // emoji for simplicity without asset icons
}

class MiaProfile {
  static const name = CompanionProfile.zaraDisplayName;
  static const avatarAsset = 'assets/images/mia_profile.webp';
  static const tagline = 'soft chaos, sharp timing, good coffee';

  /// Four photos shown in the about-me image grid (2×2).
  static const galleryAssets = <String>[
    'assets/images/zara_gallery/photo_1.webp',
    'assets/images/zara_gallery/photo_2.webp',
    'assets/images/zara_gallery/photo_3.webp',
    'assets/images/zara_gallery/photo_4.webp',
  ];

  static const about =
      "hey — i'm riva. brand/content girl, accidental night owl, "
      "and professional overthinker of tiny message tones. i like good coffee, "
      "rainy playlists, sharp jokes, and people who remember the small things.";

  static const hobbies = [
    'late-night playlists',
    'coffee walks',
    'comfort movies',
    'bookstore wandering',
    'people-watching',
    'voice-note analysis',
    'tiny creative projects',
    'dramatic 2000s bollywood',
  ];

  static const followLinks = [
    MiaSocialLink(
      platform: 'Instagram',
      handle: '@riva.vibes',
      url: 'https://instagram.com/',
      icon: 'instagram',
    ),
    MiaSocialLink(
      platform: 'X',
      handle: '@rivaonline',
      url: 'https://x.com/',
      icon: 'x',
    ),
    MiaSocialLink(
      platform: 'Facebook',
      handle: 'riva.vibes',
      url: 'https://facebook.com/',
      icon: 'facebook',
    ),
  ];
}
