function dayKey(dt: Date): number {
  const local = dt;
  return local.getFullYear() * 10000 + (local.getMonth() + 1) * 100 + local.getDate();
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function isToday(date: Date): boolean {
  return isSameCalendarDay(date, new Date());
}

/** SQLite / API timestamps are stored in UTC but often omit the "Z" suffix. */
export function parseCreatedAt(raw: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) return new Date();

  let normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasOffset =
    normalized.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(normalized);
  if (!hasOffset) normalized = `${normalized}Z`;

  return new Date(normalized);
}

export function isFirstMessageOfDay(createdAtByIndex: Date[], index: number): boolean {
  if (index <= 0 || index >= createdAtByIndex.length) return index === 0;
  return !isSameCalendarDay(createdAtByIndex[index], createdAtByIndex[index - 1]);
}

export function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'today';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return 'yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function formatMessageTime(date: Date): string {
  return date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
}
