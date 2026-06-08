/** Hosted MP3 URLs for scripted "Zara call" previews (played in order per user). */
export function getCallPreviewAudioUrls(): string[] {
  const raw = process.env.CALL_PREVIEW_AUDIO_URLS?.trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((u): u is string => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
    }
  } catch {
    // Fall through to delimiter-separated parsing.
  }

  return raw
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}
