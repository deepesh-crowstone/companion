function durationMs(
  baseMs: number,
  msPerChar: number,
  units: number,
  minMs: number,
  maxMs: number,
): number {
  const jitter = 0.9 + Math.random() * 0.2;
  const ms = Math.round((baseMs + units * msPerChar) * jitter);
  return Math.min(maxMs, Math.max(minMs, ms));
}

export function typingDuration(text: string): number {
  const chars = text.trim().length;
  if (chars === 0) return 1200;
  return durationMs(550, 36, chars, 1100, 16000);
}

export function recordingDuration(spokenText: string): number {
  const chars = spokenText.trim().length;
  if (chars === 0) return 1800;
  return durationMs(900, 58, chars, 1600, 22000);
}

export async function waitRemaining(targetMs: number, startedAt: number): Promise<void> {
  const remaining = targetMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
}
