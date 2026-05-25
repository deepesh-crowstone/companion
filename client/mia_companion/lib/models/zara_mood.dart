enum ZaraMood {
  friendly,
  funny,
  caring,
  naughty;

  String get serverValue => name;

  String get label {
    switch (this) {
      case ZaraMood.friendly:
        return 'Friendly';
      case ZaraMood.funny:
        return 'Funny';
      case ZaraMood.caring:
        return 'Caring';
      case ZaraMood.naughty:
        return 'Naughty';
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
      case ZaraMood.naughty:
        return 'Sexy, bold, and flirty';
    }
  }

  static ZaraMood fromServerValue(String? value) {
    return ZaraMood.values.firstWhere(
      (mood) => mood.serverValue == value,
      orElse: () => ZaraMood.friendly,
    );
  }
}
