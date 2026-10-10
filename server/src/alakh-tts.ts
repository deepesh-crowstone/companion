/** Alakh Sir voice notes. The GPU LoRA server returns Ogg Opus. */

const MAX_CHARS = 420;

export type AlakhTtsConfig = {
  url: string;
  apiKey: string;
};

export function readAlakhTtsConfig(
  env: NodeJS.ProcessEnv = process.env,
): AlakhTtsConfig | null {
  const url = env.ALAKH_TTS_URL?.trim();
  if (!url) return null;
  return { url, apiKey: env.ALAKH_TTS_API_KEY?.trim() ?? "" };
}

/** One spoken take per chunk, split on a word so a long lesson still fits a voice note. */
export function alakhSpeechChunks(bubbles: string[]): string[] {
  const text = bubbles
    .map((bubble) => bubble.trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return [];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut < 80) cut = MAX_CHARS;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export async function synthesizeAlakhSpeech(
  text: string,
  config: AlakhTtsConfig,
  timeoutMs = 180_000,
): Promise<Buffer> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: text,
      stream: false,
      response_format: "ogg",
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Alakh TTS failed: ${response.status} ${err.slice(0, 200)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 64) {
    throw new Error("Alakh TTS returned empty audio");
  }
  return bytes;
}
