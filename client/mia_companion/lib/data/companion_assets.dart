class CompanionAssets {
  CompanionAssets._();

  static const avatarBySlug = <String, String>{
    'zara': 'assets/images/mia_profile.webp',
    'meera': 'assets/images/zara_gallery/photo_2.webp',
  };

  static String avatarForSlug(String slug) {
    return avatarBySlug[slug] ?? 'assets/images/mia_profile.webp';
  }
}
