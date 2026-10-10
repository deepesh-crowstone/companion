const DEFAULT_STT_MODEL = "Qwen/Qwen3-ASR-1.7B";
const DEFAULT_STT_LANGUAGE = "Auto";
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

export type TelegramSttConfig = {
  url: string;
  apiKey: string;
  model: string;
  language: string;
};

export type VoiceAudio = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

function readEnv(name: string): string {
  return (
    process.env[name]
      ?.trim()
      .replace(/^['"]|['"]$/g, "")
      .replace(/\s+/g, "") ?? ""
  );
}

/** OpenAI-compatible transcriptions endpoint for Telegram voice notes. */
export function readTelegramSttConfig(): TelegramSttConfig | null {
  const url = process.env.TELEGRAM_STT_URL?.trim().replace(/\/+$/, "") ?? "";
  const apiKey = readEnv("TELEGRAM_STT_API_KEY");
  if (!url || !apiKey) return null;
  return {
    url,
    apiKey,
    model: process.env.TELEGRAM_STT_MODEL?.trim() || DEFAULT_STT_MODEL,
    language: process.env.TELEGRAM_STT_LANGUAGE?.trim() || DEFAULT_STT_LANGUAGE,
  };
}

export function transcriptFromSttPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const text = (payload as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

/** Telegram voice notes are OGG/Opus. Upload them under the name the STT server accepts. */
export function sttUploadName(filename: string, mimeType: string): string {
  const lower = `${filename} ${mimeType}`.toLowerCase();
  if (lower.includes("ogg") || lower.includes("opus") || lower.includes(".oga")) {
    return "speech.opus";
  }
  const base = filename.split("/").pop()?.trim();
  return base || "speech.opus";
}

export async function transcribeVoiceNote(
  config: TelegramSttConfig,
  audio: VoiceAudio,
): Promise<string> {
  if (audio.bytes.length === 0) return "";
  if (audio.bytes.length > MAX_VOICE_BYTES) {
    throw new Error("Voice note is too large");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType || "audio/ogg" }),
    sttUploadName(audio.filename, audio.mimeType),
  );
  form.append("model", config.model);
  form.append("language", config.language);

  const response = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const err = (await response.text()).slice(0, 300);
    throw new Error(`STT failed: ${response.status} ${err}`);
  }
  return transcriptFromSttPayload(await response.json());
}
