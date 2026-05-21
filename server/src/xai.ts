import {
  MIA_STT_LANGUAGE,
  MIA_TEXT_SYSTEM_PROMPT,
  MIA_TTS_LANGUAGE,
  MIA_VOICE_SYSTEM_PROMPT,
  MIA_VOICE_ID,
  XAI_CHAT_MODEL,
} from "./mia.js";
import {
  ELEVENLABS_VOICE_TTS_INSTRUCTIONS,
  MIA_VOICE_TTS_INSTRUCTIONS,
} from "./tts-speech.js";
import { buildClientSecretRequest } from "./realtime-session.js";
import type { DbMessage } from "./db.js";

const XAI_BASE = "https://api.x.ai/v1";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const MIA_CHAT_TEMPERATURE = 0.78;
const MAX_TEXT_REPLY_SEGMENTS = 3;

const LATIN_LETTER_RE = /[A-Za-z]/;
const EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
const INDIA_TIME_ZONE = "Asia/Kolkata";

function currentIndiaTimeContext(): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: INDIA_TIME_ZONE,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: INDIA_TIME_ZONE,
  }).format(now);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: INDIA_TIME_ZONE,
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: INDIA_TIME_ZONE,
    }).format(now),
  );
  const daypart =
    hour < 5
      ? "late night"
      : hour < 12
        ? "morning"
        : hour < 17
          ? "afternoon"
          : hour < 21
            ? "evening"
            : "night";

  return `current India time context: ${day}, ${date}, ${time} (${daypart}). Use this subtly for time-of-day vibe when relevant; do not overstate it.`;
}

function stripSpeechMarkupForScriptCheck(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/<\/?[a-z][a-z0-9-]*>/gi, "");
}

function containsLatinOutsideSpeechTags(text: string): boolean {
  return LATIN_LETTER_RE.test(stripSpeechMarkupForScriptCheck(text));
}

function stripEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

function normalizeRespectfulUserGrammar(text: string): string {
  return text
    .replace(/\bbata\s+na\b/gi, "batao na")
    .replace(/\ble\s+raha\s+hai\b/gi, "le rahe ho")
    .replace(/\bkar\s+raha\s+hai\b/gi, "kar rahe ho")
    .replace(/\bso\s+raha\s+hai\b/gi, "so rahe ho")
    .replace(/\bja\s+raha\s+hai\b/gi, "ja rahe ho")
    .replace(/\bthak\s+gaya\b/gi, "thak gaye")
    .replace(/\bho\s+gaya\s+hai\b/gi, "ho gaye ho")
    .replace(/\bho\s+gaya\b/gi, "ho gaye");
}

function cleanTextSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = normalizeRespectfulUserGrammar(
    stripEmojis(value)
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return cleaned.length > 0 ? cleaned : null;
}

function parseJsonSegments(raw: string): string[] | null {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const candidates = [withoutFence];
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== withoutFence) {
    candidates.push(objectMatch[0]);
  }
  const arrayMatch = withoutFence.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    candidates.push(arrayMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const values =
        Array.isArray(parsed)
          ? parsed
          : parsed &&
              typeof parsed === "object" &&
              "messages" in parsed &&
              Array.isArray((parsed as { messages?: unknown }).messages)
            ? (parsed as { messages: unknown[] }).messages
            : null;
      if (!values) continue;
      const segments = values
        .map((v) => cleanTextSegment(v))
        .filter((v): v is string => v != null)
        .slice(0, MAX_TEXT_REPLY_SEGMENTS);
      if (segments.length > 0) return segments;
    } catch {
      // Try the next candidate, then fall back to plain-text splitting.
    }
  }

  return null;
}

function splitPlainTextSegments(raw: string): string[] {
  const lineSegments = raw
    .split(/\r?\n+/)
    .map((v) => cleanTextSegment(v))
    .filter((v): v is string => v != null);
  if (lineSegments.length > 1) {
    return lineSegments.slice(0, MAX_TEXT_REPLY_SEGMENTS);
  }

  const oneLine = cleanTextSegment(raw);
  if (!oneLine) return ["hmm"];
  const sentenceSegments = oneLine
    .split(/(?<=[.!?])\s+/)
    .map((v) => cleanTextSegment(v))
    .filter((v): v is string => v != null);
  if (sentenceSegments.length > 1) {
    return sentenceSegments.slice(0, MAX_TEXT_REPLY_SEGMENTS);
  }
  return [oneLine];
}

function parseTextReplySegments(raw: string): string[] {
  const parsed = parseJsonSegments(raw) ?? splitPlainTextSegments(raw);
  return parsed.slice(0, MAX_TEXT_REPLY_SEGMENTS);
}

function apiKey(): string {
  const raw = process.env.XAI_API_KEY;
  if (!raw?.trim()) {
    throw new Error(
      "XAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key from https://console.x.ai/",
    );
  }
  // Strip whitespace and accidental surrounding quotes from .env
  const key = raw.trim().replace(/^['"]|['"]$/g, "");
  if (key.length < 20 || key.includes("your_xai") || key === "test") {
    throw new Error(
      "XAI_API_KEY looks invalid. Use a real key from https://console.x.ai/team/default/api-keys",
    );
  }
  return key;
}

function envValue(name: string): string | null {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  return value && value.length > 0 ? value : null;
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function elevenLabsApiKey(): string {
  const key = envValue("ELEVENLABS_API_KEY");
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  return key;
}

function elevenLabsVoiceId(): string {
  const voiceId = envValue("ELEVENLABS_VOICE_ID");
  if (!voiceId) {
    throw new Error("ELEVENLABS_VOICE_ID is not set");
  }
  return voiceId;
}

function numberEnv(name: string, fallback: number): number {
  const raw = envValue(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function verifyXaiConnection(): Promise<void> {
  const res = await fetch(`${XAI_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`xAI rejected API key (${res.status}): ${err.slice(0, 200)}`);
  }
}

export async function createRealtimeClientSecret(): Promise<{
  value: string;
  expires_at: number;
}> {
  const res = await fetch(`${XAI_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildClientSecretRequest()),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create realtime token: ${res.status} ${err}`);
  }

  return res.json() as Promise<{ value: string; expires_at: number }>;
}

export async function transcribeAudio(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const { readFileSync } = await import("fs");
  const buffer = readFileSync(filePath);
  const form = new FormData();
  const filename = filePath.split("/").pop() ?? "audio.m4a";
  form.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    filename,
  );
  form.append("language", MIA_STT_LANGUAGE);

  const res = await fetch(`${XAI_BASE}/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

async function synthesizeSpeechWithXai(text: string): Promise<Buffer> {
  const res = await fetch(`${XAI_BASE}/tts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text,
      voice_id: MIA_VOICE_ID,
      language: MIA_TTS_LANGUAGE,
      output_format: { codec: "mp3", sample_rate: 24000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS failed: ${res.status} ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function synthesizeSpeechWithElevenLabs(text: string): Promise<Buffer> {
  const voiceId = elevenLabsVoiceId();
  const modelId = envValue("ELEVENLABS_MODEL_ID") ?? "eleven_v3";
  const outputFormat =
    envValue("ELEVENLABS_OUTPUT_FORMAT") ?? "mp3_44100_128";
  const cleanText = text.trim();

  if (!cleanText) {
    throw new Error("ElevenLabs TTS text is empty");
  }

  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(
      voiceId,
    )}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: modelId,
        voice_settings: {
          stability: numberEnv("ELEVENLABS_STABILITY", 0.45),
          similarity_boost: numberEnv("ELEVENLABS_SIMILARITY_BOOST", 0.8),
          style: numberEnv("ELEVENLABS_STYLE", 0),
          use_speaker_boost: envValue("ELEVENLABS_SPEAKER_BOOST") !== "false",
        },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const provider = ttsProvider();
  if (provider === "xai") {
    return synthesizeSpeechWithXai(text);
  }
  if (provider !== "elevenlabs") {
    throw new Error(
      `Unsupported MIA_TTS_PROVIDER "${provider}". Use "elevenlabs" or "xai".`,
    );
  }
  return synthesizeSpeechWithElevenLabs(text);
}

export type ChatWithMiaOptions = {
  /** Voice notes: model may embed TTS delivery tags in the reply. */
  expressiveTts?: boolean;
};

function ttsProvider(): string {
  return (envValue("MIA_TTS_PROVIDER") ?? "elevenlabs").toLowerCase();
}

function voiceTtsInstructions(): string {
  return ttsProvider() === "xai"
    ? MIA_VOICE_TTS_INSTRUCTIONS
    : ELEVENLABS_VOICE_TTS_INSTRUCTIONS;
}

async function rewriteToDevanagariHindi(
  text: string,
  preserveSpeechTags: boolean,
): Promise<string> {
  if (!containsLatinOutsideSpeechTags(text)) return text;

  const tagRule = preserveSpeechTags
    ? "Preserve any existing TTS delivery tags exactly as-is, including square-bracket tags like [laughs], [sighs], [teasing], [pauses], [light chuckle], and any <whisper>...</whisper> tags. Only rewrite the human-readable words around them."
    : "Do not add speech tags or markup.";

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Rewrite the given Zara reply into natural Devanagari Hindi only.

Rules:
- Output only the rewritten reply, no explanation.
- All visible words must be in Devanagari script.
- Transliterate English loanwords phonetically into Devanagari: cute -> क्यूट, phone -> फोन, message -> मैसेज, online -> ऑनलाइन, okay -> ओके, sorry -> सॉरी, drama -> ड्रामा.
- Keep Zara's natural, warm, close-friend tone and the same meaning.
- Keep it short and conversational.
- Do not add pet names, extra direct address, or a new follow-up question while rewriting.
- ${tagRule}`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Devanagari rewrite failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const rewritten = data.choices?.[0]?.message?.content?.trim();
  if (!rewritten) {
    throw new Error("Empty Devanagari rewrite from xAI");
  }

  return rewritten;
}

export async function chatWithMia(
  history: DbMessage[],
  options?: ChatWithMiaOptions,
): Promise<string> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const systemPrompt = `${
    options?.expressiveTts
      ? `${MIA_VOICE_SYSTEM_PROMPT}\n${voiceTtsInstructions()}`
      : MIA_VOICE_SYSTEM_PROMPT
  }\n\n${currentIndiaTimeContext()}`;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      messages,
      temperature: MIA_CHAT_TEMPERATURE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Empty response from xAI");
  }

  const voiceReply = options?.expressiveTts ? stripEmojis(reply) : reply;
  const rewritten = await rewriteToDevanagariHindi(
    voiceReply,
    options?.expressiveTts ?? false,
  );

  return options?.expressiveTts ? stripEmojis(rewritten) : rewritten;
}

export async function chatWithMiaText(history: DbMessage[]): Promise<string[]> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const systemPrompt = `${MIA_TEXT_SYSTEM_PROMPT}

${currentIndiaTimeContext()}

output format:
- Output only valid JSON.
- Shape: {"messages":["first small text","second small text"]}
- Use 1 to 3 messages total.
- Each message must be Latin-script Hinglish/English only.
- Do not include Devanagari, markdown, explanations, labels, numbering, or separators.`;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      messages,
      temperature: MIA_CHAT_TEMPERATURE,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Empty response from xAI");
  }

  return parseTextReplySegments(reply);
}
