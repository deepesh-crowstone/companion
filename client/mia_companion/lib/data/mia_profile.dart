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
  static const name = 'Zara';
  static const avatarAsset = 'assets/images/mia_profile.png';
  static const tagline = 'soft chaos, sharp timing, good coffee';

  /// Photos shown in the gallery section on Zara's profile screen.
  /// Drop more images into `assets/images/zara_gallery/` and list them here.
  static const galleryAssets = <String>[
    'assets/images/mia_profile.png',
  ];

  static const about =
      "hey — i'm zara. brand/content girl, accidental night owl, "
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

  static const socialLinks = [
    MiaSocialLink(
      platform: 'Instagram',
      handle: '@zara.vibes',
      url: 'https://instagram.com/',
      icon: '📸',
    ),
    MiaSocialLink(
      platform: 'TikTok',
      handle: '@itszara',
      url: 'https://tiktok.com/',
      icon: '🎵',
    ),
    MiaSocialLink(
      platform: 'Spotify',
      handle: 'zara — late night',
      url: 'https://open.spotify.com/',
      icon: '🎧',
    ),
    MiaSocialLink(
      platform: 'X',
      handle: '@zaraonline',
      url: 'https://x.com/',
      icon: '✨',
    ),
  ];
}
