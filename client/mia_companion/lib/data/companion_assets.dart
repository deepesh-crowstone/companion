class CompanionAssets {
  CompanionAssets._();

  static const avatarBySlug = <String, String>{
    'zara': 'assets/images/mia_profile.webp',
    'alakh': 'assets/images/alakh/portrait.png',
    'aryan': 'assets/images/aryan/portrait.jpg',
    'meera': 'assets/images/aryan/portrait.jpg',
    'mira': 'assets/images/aryan/portrait.jpg',
  };

  static String avatarForSlug(String slug) {
    return avatarBySlug[slug] ?? 'assets/images/mia_profile.webp';
  }
}
