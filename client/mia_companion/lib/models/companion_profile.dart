class CompanionProfile {
  const CompanionProfile({
    required this.slug,
    required this.name,
    required this.tagline,
    required this.avatarAsset,
  });

  final String slug;
  final String name;
  final String tagline;
  final String avatarAsset;

  bool get isAryan =>
      slug == 'aryan' || slug == 'meera' || slug == 'mira';

  String get displayName => isAryan ? 'Aryan' : name;

  factory CompanionProfile.fromJson(
    Map<String, dynamic> json, {
    required String avatarAsset,
  }) {
    return CompanionProfile(
      slug: json['slug'] as String,
      name: json['name'] as String,
      tagline: json['tagline'] as String? ?? '',
      avatarAsset: avatarAsset,
    );
  }
}
