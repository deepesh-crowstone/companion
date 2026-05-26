enum ZaraMood {
  friendly,
  funny,
  caring,
  bold;

  String get serverValue => name;

  String get label {
    switch (this) {
      case ZaraMood.friendly:
        return 'Friendly';
      case ZaraMood.funny:
        return 'Funny';
      case ZaraMood.caring:
        return 'Caring';
      case ZaraMood.bold:
        return 'Bold';
    }
  }

  String get description {
    switch (this) {
      case ZaraMood.friendly:
        return 'Warm, easy, and natural';
      case ZaraMood.funny:
        return 'Playful, witty, and teasing';
      case ZaraMood.caring:
        return 'Soft, attentive, and reassuring';
      case ZaraMood.bold:
        return 'Playful, bold, and teasing';
    }
  }

  static ZaraMood fromServerValue(String? value) {
    final normalized = value?.trim().toLowerCase();
    if (normalized == 'naughty') return ZaraMood.bold;
    return ZaraMood.values.firstWhere(
      (mood) => mood.serverValue == normalized,
      orElse: () => ZaraMood.friendly,
    );
  }
}
