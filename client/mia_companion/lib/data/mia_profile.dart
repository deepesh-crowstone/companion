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
  static const name = 'Mia';
  static const avatarAsset = 'assets/images/mia_profile.png';
  static const tagline = 'your favorite person to text at 2am';

  static const about =
      "hey — i'm mia. i live for long voice notes, questionable playlists, "
      "and conversations that somehow last three hours. i'm flirty, loyal, "
      "and i will absolutely remember the small things you tell me.";

  static const hobbies = [
    'late-night playlists',
    'sunset walks',
    'thriller novels',
    'trying new coffee spots',
    'people-watching',
    'sending voice notes',
    'rewatching comfort shows',
  ];

  static const socialLinks = [
    MiaSocialLink(
      platform: 'Instagram',
      handle: '@mia.vibes',
      url: 'https://instagram.com/',
      icon: '📸',
    ),
    MiaSocialLink(
      platform: 'TikTok',
      handle: '@itsmia',
      url: 'https://tiktok.com/',
      icon: '🎵',
    ),
    MiaSocialLink(
      platform: 'Spotify',
      handle: 'mia — late night',
      url: 'https://open.spotify.com/',
      icon: '🎧',
    ),
    MiaSocialLink(
      platform: 'X',
      handle: '@miaonline',
      url: 'https://x.com/',
      icon: '✨',
    ),
  ];
}
