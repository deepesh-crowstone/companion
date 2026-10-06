class CompanionProfile {
  const CompanionProfile({
    required this.slug,
    required this.name,
    required this.tagline,
    required this.avatarAsset,
  });

  /// Spoken name for the companion stored as slug `zara`.
  static const zaraDisplayName = 'Riva';

  final String slug;
  final String name;
  final String tagline;
  final String avatarAsset;

  bool get isAryan =>
      slug == 'aryan' || slug == 'meera' || slug == 'mira';

  bool get isZara => slug.trim().toLowerCase() == 'zara';

  /// Name to show or address. Slug `zara` is always Riva, even if [name] is stale.
  String get displayName {
    if (isAryan) return 'Aryan';
    if (isZara) return zaraDisplayName;
    return name;
  }

  /// Spoken name for a slug. Never returns the raw slug.
  static String displayNameForSlug(String? slug) {
    final normalized = slug?.trim().toLowerCase() ?? '';
    if (normalized == 'aryan' ||
        normalized == 'meera' ||
        normalized == 'mira') {
      return 'Aryan';
    }
    return zaraDisplayName;
  }

  factory CompanionProfile.fromJson(
    Map<String, dynamic> json, {
    required String avatarAsset,
  }) {
    final slug = json['slug'] as String;
    final rawName = json['name'] as String? ?? '';
    return CompanionProfile(
      slug: slug,
      name: slug.trim().toLowerCase() == 'zara' ? zaraDisplayName : rawName,
      tagline: json['tagline'] as String? ?? '',
      avatarAsset: avatarAsset,
    );
  }
}
