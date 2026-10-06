import 'mia_profile.dart';

class AryanProfile {
  static const name = 'Aryan';
  static const avatarAsset = 'assets/images/aryan/portrait.jpg';

  static const galleryAssets = <String>[
    'assets/images/aryan/portrait.jpg',
    'assets/images/aryan/terrace.jpg',
    'assets/images/aryan/bookstore.jpg',
    'assets/images/aryan/walk.jpg',
  ];

  static const about =
      "hey — i'm aryan. ux researcher, quiet on the outside, "
      "and someone who notices the small shifts in a conversation. i like filter coffee, "
      "rainy evenings, long walks, and people who listen without trying to fix it too fast.";

  static const hobbies = [
    'terrace chai',
    'bookstore afternoons',
    'cooking experiments',
    'documentary nights',
    'long walks',
    'windowsill plants',
    'indie playlists',
    'handwritten lists',
  ];

  static const followLinks = [
    MiaSocialLink(
      platform: 'Instagram',
      handle: '@aryan.reads',
      url: 'https://instagram.com/',
      icon: 'instagram',
    ),
    MiaSocialLink(
      platform: 'X',
      handle: '@aryanonline',
      url: 'https://x.com/',
      icon: 'x',
    ),
    MiaSocialLink(
      platform: 'Facebook',
      handle: 'aryan.reads',
      url: 'https://facebook.com/',
      icon: 'facebook',
    ),
  ];
}
