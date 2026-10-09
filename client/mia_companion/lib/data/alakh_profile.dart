import 'mia_profile.dart';

class AlakhProfile {
  static const name = 'Alakh Sir';
  static const avatarAsset = 'assets/images/alakh/portrait.png';

  static const galleryAssets = <String>[
    'assets/images/alakh/portrait.png',
    'assets/images/alakh/board.png',
    'assets/images/alakh/practice.png',
    'assets/images/alakh/test.png',
  ];

  static const about =
      "main Alakh hoon. Physics Wallah se pehle bhi, aur ab bhi, "
      "main pehle teacher hoon. concept itna simple hona chahiye ki dar khatam ho jaye, "
      "mehnat roz ki honi chahiye, aur ek bura result tumhari poori zindagi nahi hai. "
      "doubt ho, mock toot gaya ho, ya ghar ka pressure ho — seedhi baat karenge.";

  static const hobbies = [
    'board pe physics',
    'everyday analogies',
    'mock-test analysis',
    'doubt solving',
    'free lectures',
    'student stories',
    'early classes',
    'chai breaks',
  ];

  static const followLinks = [
    MiaSocialLink(
      platform: 'YouTube',
      handle: 'Physics Wallah',
      url: 'https://www.youtube.com/@PhysicsWallah',
      icon: 'youtube',
    ),
    MiaSocialLink(
      platform: 'Instagram',
      handle: '@physicswallah',
      url: 'https://www.instagram.com/physicswallah/',
      icon: 'instagram',
    ),
    MiaSocialLink(
      platform: 'PW',
      handle: 'pw.live',
      url: 'https://www.pw.live/',
      icon: 'link',
    ),
  ];
}
