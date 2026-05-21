export type MiaSocialLink = {
  platform: string;
  handle: string;
  url: string;
  icon: string;
};

export const MiaProfile = {
  name: 'Zara',
  tagline: 'your favorite person to text at 2am',
  about:
    "hey — i'm zara. i live for long voice notes, questionable playlists, " +
    "and conversations that somehow last three hours. i'm flirty, loyal, " +
    'and i will absolutely remember the small things you tell me.',
  hobbies: [
    'late-night playlists',
    'sunset walks',
    'thriller novels',
    'trying new coffee spots',
    'people-watching',
    'sending voice notes',
    'rewatching comfort shows',
  ],
  socialLinks: [
    { platform: 'Instagram', handle: '@mia.vibes', url: 'https://instagram.com/', icon: '📸' },
    { platform: 'TikTok', handle: '@itsmia', url: 'https://tiktok.com/', icon: '🎵' },
    { platform: 'Spotify', handle: 'mia — late night', url: 'https://open.spotify.com/', icon: '🎧' },
    { platform: 'X', handle: '@miaonline', url: 'https://x.com/', icon: '✨' },
  ] as MiaSocialLink[],
};
