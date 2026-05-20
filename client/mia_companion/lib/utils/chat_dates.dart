/// Calendar-day helpers for chat date separators (always uses local timezone).
abstract final class ChatDates {
  static int _dayKey(DateTime dt) {
    final local = dt.toLocal();
    return local.year * 10000 + local.month * 100 + local.day;
  }

  static bool isSameCalendarDay(DateTime a, DateTime b) {
    return _dayKey(a) == _dayKey(b);
  }

  static bool isToday(DateTime date) => isSameCalendarDay(date, DateTime.now());

  /// SQLite / API timestamps are stored in UTC but often omit the "Z" suffix.
  static DateTime parseCreatedAt(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return DateTime.now();

    var normalized = trimmed.contains('T')
        ? trimmed
        : trimmed.replaceFirst(' ', 'T');

    final hasOffset = normalized.endsWith('Z') ||
        RegExp(r'[+-]\d{2}:\d{2}$').hasMatch(normalized);
    if (!hasOffset) {
      normalized = '${normalized}Z';
    }

    return DateTime.parse(normalized).toLocal();
  }

  /// True when [index] is the first message of a new calendar day in the thread.
  static bool isFirstMessageOfDay(List<DateTime> createdAtByIndex, int index) {
    if (index <= 0 || index >= createdAtByIndex.length) {
      return index == 0;
    }
    return !isSameCalendarDay(
      createdAtByIndex[index],
      createdAtByIndex[index - 1],
    );
  }
}
