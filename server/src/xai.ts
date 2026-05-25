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
import { intimacyPromptForLevel, type IntimacyLevel } from "./intimacy.js";
import { moodPromptForMood, type ZaraMood } from "./mood.js";

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
    .replace(/\btu\b/gi, "tum")
    .replace(/\btujhe\b/gi, "tumhe")
    .replace(/\btera\b/gi, "tumhara")
    .replace(/\bteri\b/gi, "tumhari")
    .replace(/\btere\b/gi, "tumhare")
    .replace(/\bbata\s+na\b/gi, "batao na")
    .replace(/\bbata\b(?!\s+(?:diya|di|raha|rahi|rahe|chuka|chuki|chuke)\b)/gi, "batao")
    .replace(/\bsun\b(?!\s+(?:raha|rahi|rahe|liya|lo)\b)/gi, "suno")
    .replace(/\bdekh\b(?!\s+(?:raha|rahi|rahe|liya|lo)\b)/gi, "dekho")
    .replace(/\bja\b(?!\s+(?:raha|rahi|rahe)\b)/gi, "jao")
    .replace(/\bkha\b(?!\s+(?:raha|rahi|rahe|liya)\b)/gi, "khao")
    .replace(/\bkar\s+de\b/gi, "kar do")
    .replace(/\bbol\s+de\b/gi, "bol do")
    .replace(/\bbhej\s+de\b/gi, "bhej do")
    .replace(/\bde\s+de\b/gi, "de do")
    .replace(/\brehne\s+de\b/gi, "rehne do")
    .replace(/\bmaar\s+de\b/gi, "maar do")
    .replace(/\ble\s+raha\s+hai\b/gi, "le rahe ho")
    .replace(/\bkar\s+raha\s+hai\b/gi, "kar rahe ho")
    .replace(/\bso\s+raha\s+hai\b/gi, "so rahe ho")
    .replace(/\bja\s+raha\s+hai\b/gi, "ja rahe ho")
    .replace(/\bthak\s+gaya\b/gi, "thak gaye")
    .replace(/\bho\s+gaya\s+hai\b/gi, "ho gaye ho")
    .replace(/\bho\s+gaya\b/gi, "ho gaye")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])तू(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1तुम")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])तुझे(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1तुम्हें")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])तेरा(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1तुम्हारा")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])तेरी(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1तुम्हारी")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])तेरे(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1तुम्हारे")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])बता\s+ना(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1बताओ ना")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])बता(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1बताओ")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])सुन(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1सुनो")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])देख(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1देखो")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])जा(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1जाओ")
    .replace(/(^|[\s,.:;!?'"“”‘’()[\]{}-])खा(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/gu, "$1खाओ")
    .replace(/कर\s+दे/gu, "कर दो")
    .replace(/बोल\s+दे/gu, "बोल दो")
    .replace(/भेज\s+दे/gu, "भेज दो")
    .replace(/दे\s+दे/gu, "दे दो")
    .replace(/रहने\s+दे/gu, "रहने दो")
    .replace(/मार\s+दे/gu, "मार दो")
    .replace(/ले\s+रहा\s+है/gu, "ले रहे हो")
    .replace(/कर\s+रहा\s+है/gu, "कर रहे हो")
    .replace(/सो\s+रहा\s+है/gu, "सो रहे हो")
    .replace(/जा\s+रहा\s+है/gu, "जा रहे हो")
    .replace(/थक\s+गया/gu, "थक गए")
    .replace(/हो\s+गया\s+है/gu, "हो गए हो")
    .replace(/हो\s+गया/gu, "हो गए");
}

function normalizeNonPhysicalPresence(text: string): string {
  return text
    .replace(/\bcome\s+here\b/gi, "stay right there")
    .replace(/\bcome\s+closer\b/gi, "stay right there")
    .replace(/\bsit\s+closer\b/gi, "stay right there")
    .replace(/\bpull\s+you\s+closer\b/gi, "make you blush a little")
    .replace(/\btouch\s+you\b/gi, "get under your skin a little")
    .replace(/\bkiss\s+you\b/gi, "make you think about this later");
}

function cleanTextSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = normalizeNonPhysicalPresence(
    normalizeRespectfulUserGrammar(
      stripEmojis(value)
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    ),
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

type TextLanguageMode = "english" | "hinglish" | "mixed";

const HINGLISH_LANGUAGE_TOKEN_RE =
  /\b(?:haan|han|nahi|nahin|kya|kyun|kyu|kaise|aisa|waisa|raha|rahi|rahe|yaar|thoda|bas|aaj|ajeeb|matlab|samajh|tum|tumhe|tumhara|tumhari|bina|wajah|dil|arre|arey|acha|accha|hoon|hun|hai|ho|aa)\b/gi;

function detectTextLanguageMode(text: string): TextLanguageMode {
  const words = text.match(/[A-Za-z]+/g) ?? [];
  if (words.length === 0) return "english";
  const hinglishMatches = text.match(HINGLISH_LANGUAGE_TOKEN_RE) ?? [];
  const ratio = hinglishMatches.length / words.length;
  if (hinglishMatches.length >= 2 || ratio >= 0.18) return "hinglish";
  if (hinglishMatches.length === 1 && ratio >= 0.08) return "mixed";
  return "english";
}

function latestUserLanguageInstruction(history: DbMessage[]): string {
  const latestUserText = history[history.length - 1]?.content ?? "";
  const mode = detectTextLanguageMode(latestUserText);
  if (mode === "hinglish") {
    return `latest user language mode: Hinglish / romanized Hindi.
- The next Zara text reply must switch into natural Latin-script Hinglish.
- Do not answer with mostly-English chunks.
- Each message chunk should include a natural Hinglish cue through romanized Hindi words, grammar, or phrasing.`;
  }
  if (mode === "mixed") {
    return `latest user language mode: mixed English + Hinglish.
- Mirror the user's rough English/Hinglish mix in the next Zara text reply.
- Keep the script Latin-only.`;
  }
  return `latest user language mode: English.
- The next Zara text reply must be English.
- Do not use Hinglish/Hindi filler or romanized Hindi grammar in this reply.
- This language rule also applies to flirt, romance, intimacy, banter, and emotional support.`;
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
  mood?: ZaraMood;
};

function ttsProvider(): string {
  return (envValue("MIA_TTS_PROVIDER") ?? "elevenlabs").toLowerCase();
}

function voiceTtsInstructions(): string {
  return ttsProvider() === "xai"
    ? MIA_VOICE_TTS_INSTRUCTIONS
    : ELEVENLABS_VOICE_TTS_INSTRUCTIONS;
}

export function voiceReplyPipeline(): string {
  return envValue("MIA_VOICE_REPLY_PIPELINE")?.toLowerCase() ?? "voice";
}

async function rewriteToDevanagariHindi(
  text: string,
  preserveSpeechTags: boolean,
): Promise<string> {
  if (!containsLatinOutsideSpeechTags(text)) {
    return normalizeRespectfulUserGrammar(text);
  }

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
- Keep respectful "tum" grammar: "तुम", "तुम्हें", "बताओ", "बताओ ना", "कर दो", "हो गए हो"; never "तू", "तुझे", "बता", "बता ना", "कर दे", "हो गया".
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

  return normalizeRespectfulUserGrammar(rewritten);
}

export async function chatWithMia(
  history: DbMessage[],
  options?: ChatWithMiaOptions,
): Promise<string> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const moodLine = moodPromptForMood(options?.mood ?? "friendly");
  const systemPrompt = `${
    options?.expressiveTts
      ? `${MIA_VOICE_SYSTEM_PROMPT}\n${voiceTtsInstructions()}`
      : MIA_VOICE_SYSTEM_PROMPT
  }\n\n${moodLine}\n\n${currentIndiaTimeContext()}`;

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

async function addVoiceDeliveryToTextReply(textReply: string): Promise<string> {
  const cleanReply = stripEmojis(textReply).trim();
  if (!cleanReply) {
    throw new Error("Empty text reply for voice delivery");
  }

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: `Convert Zara's normal text-chat reply into a realistic voice-note script for TTS.

Rules:
- Keep the same meaning, emotional stance, and Zara personality. Do not add new ideas, questions, advice, facts, pet names, or extra intimacy.
- Preserve the user's respectful/plural grammar style as a hard rule: tum/tumhe/tumhara, batao, batao na, kar do, le rahe ho, ho gaye. Never use tu/tujhe/tera, bata, bata na, kar de, le raha hai, ho gaya.
- Convert the spoken words to Devanagari Hindi/Hinglish so the Hindi voice sounds natural. Transliterate English loanwords phonetically when possible.
- Add only a few delivery tags for performance. ${voiceTtsInstructions()}
- Output only the final tagged voice-note script.`,
        },
        { role: "user", content: cleanReply },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voice delivery tagging failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const tagged = data.choices?.[0]?.message?.content?.trim();
  if (!tagged) {
    throw new Error("Empty voice delivery tagging response from xAI");
  }

  return rewriteToDevanagariHindi(stripEmojis(tagged), true);
}

export async function chatWithMiaText(
  history: DbMessage[],
  options?: { intimacyLevel?: IntimacyLevel; mood?: ZaraMood },
): Promise<string[]> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const intimacyLevel = options?.intimacyLevel ?? 1;
  const mood = options?.mood ?? "friendly";
  const systemPrompt = `${MIA_TEXT_SYSTEM_PROMPT}

${intimacyPromptForLevel(intimacyLevel)}

${moodPromptForMood(mood)}

${currentIndiaTimeContext()}

${latestUserLanguageInstruction(history)}

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

export async function chatWithMiaTextAsVoice(
  history: DbMessage[],
  options?: { mood?: ZaraMood },
): Promise<string> {
  const textSegments = await chatWithMiaText(history, { mood: options?.mood });
  return addVoiceDeliveryToTextReply(textSegments.join(" "));
}
