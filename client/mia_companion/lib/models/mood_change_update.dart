import 'zara_mood.dart';

class MoodChangeUpdate {
  const MoodChangeUpdate({
    required this.id,
    required this.mood,
    required this.createdAt,
  });

  final int id;
  final ZaraMood mood;
  final DateTime createdAt;
}
