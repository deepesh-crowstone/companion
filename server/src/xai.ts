import {
  MIA_STT_LANGUAGE,
  MIA_TTS_LANGUAGE,
  MIA_VOICE_ID,
  buildSpokenSystemPrompt,
  buildTextSystemPrompt,
  buildVoiceSystemPrompt,
} from "./mia.js";
import { getProfileBySlug, resolveProfileSlug } from "./profiles/catalog.js";
import { ZARA_DISPLAY_NAME } from "./profiles/display-name.js";
import {
  buildElevenLabsVoiceTtsInstructions,
  buildXaiVoiceTtsInstructions,
} from "./tts-speech.js";
import { buildClientSecretRequest } from "./realtime-session.js";
import type { DbMessage } from "./db.js";
import { moodPromptForMood, type ZaraMood } from "./mood.js";
import { privateModeRomanticPrompt } from "./private-mode-prompts.js";
import {
  MENTOR_SPOKEN_REPLY_OUTPUT_FORMAT,
  textReplyOutputFormat,
} from "./platform-behavior.js";
import { replyChatCompletion } from "./reply-client.js";
import { prepareConversationContext } from "./conversation-context.js";
import type { CompanionProfile } from "./profiles/types.js";
import {
  addressGuidance,
  friendlyTuEstablished,
  parseTextReplySegments,
  resolveReplyLanguageMode,
} from "./text-response.js";

const XAI_BASE = "https://api.x.ai/v1";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const LATIN_LETTER_RE = /[A-Za-z]/;
const ROMAN_HINDI_RE =
  /\b(?:aaj|abhi|achha|accha|bahut|beta|baccha|bilkul|dekho|haan|hai|hain|hoon|jaise|kaise|kya|kyun|kyunki|lekin|nahi|nahin|padhai|padho|samajh|samajhte|suno|theek|thoda|tumhe|tumhara|wapas|yaad|yeh)\b/i;
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

function spokenReplyLanguageInstruction(history: DbMessage[]): string {
  const userTexts = history
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const latestUserText = userTexts[userTexts.length - 1] ?? "";
  const mode = resolveReplyLanguageMode(
    latestUserText,
    userTexts.slice(0, -1),
  );
  if (mode === "english") {
    return `latest user language mode: English.
- Reply in spoken English.
- Do not add Hindi words. If one is unavoidable, write it in Devanagari, never Roman Hindi.`;
  }
  return `latest user language mode: Hindi or Hinglish.
- Write every Hindi word in Devanagari.
- Do not write Roman Hindi.
- Keep English academic words, numbers, symbols, and formulas in Latin.`;
}

async function rewriteRomanHindiForSpeech(
  text: string,
  profileName: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || !ROMAN_HINDI_RE.test(trimmed)) return trimmed;
  const rewritten = await replyChatCompletion(
    [
      {
        role: "system",
        content: `Rewrite ${profileName}'s spoken reply so Hindi is in Devanagari.

Rules:
- Output only the rewritten reply, no explanation.
- Change Roman Hindi into Devanagari: "kaise ho beta" becomes "कैसे हो बेटा".
- Keep English words, numbers, symbols, and formulas in Latin.
- Keep the meaning, the teaching content, and who is being addressed.
- Do not add speech tags, emoji, or a new sentence.`,
      },
      { role: "user", content: trimmed },
    ],
    { label: "Devanagari speech rewrite" },
  );
  return rewritten.trim() || trimmed;
}

function latestUserLanguageInstruction(history: DbMessage[]): string {
  const userTexts = history
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const latestUserText = userTexts[userTexts.length - 1] ?? "";
  const mode = resolveReplyLanguageMode(
    latestUserText,
    userTexts.slice(0, -1),
  );
  const address = addressGuidance(friendlyTuEstablished(userTexts));
  const override =
    "This turn's language decision overrides the broader language heuristic.";

  if (mode === "hindi_devanagari") {
    return `latest user language mode: Hindi (Devanagari script in user message).
- ${override}
- Reply in natural Latin-script Hinglish (romanized Hindi + light English). Do not use Devanagari in text chat.
- Match the user's Hindi tone and vocabulary. Prefer Hinglish over pure English.
- ${address}`;
  }
  if (mode === "hinglish") {
    return `latest user language mode: Hinglish / romanized Hindi.
- ${override}
- The next companion text reply must be in natural Latin-script Hinglish.
- Do not answer with mostly-English chunks.
- Use natural Hinglish grammar and phrasing without forcing filler words.
- ${address}`;
  }
  if (mode === "mixed") {
    return `latest user language mode: mixed English + Hinglish.
- ${override}
- Lean Hinglish: at least half the reply should feel like casual Indian texting in romanized Hindi.
- Mirror the user's mix; do not switch to fully English unless they clearly wrote in English only.
- Keep the script Latin-only (no Devanagari).
- ${address}`;
  }
  return `latest user language mode: English.
- ${override}
- The user wrote mostly in English, or the short message has no established Hinglish context. Reply in English for this turn.
- Do not use Hinglish filler or romanized Hindi grammar unless the user mixes it in.
- If the user switches to Hinglish or Hindi on the next message, switch immediately.
- ${address}`;
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

export async function createRealtimeClientSecret(
  profileSlug = "zara",
): Promise<{
  value: string;
  expires_at: number;
}> {
  const res = await fetch(`${XAI_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildClientSecretRequest(profileSlug)),
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
  profileSlug?: string;
};

function profileForSlug(profileSlug: string): CompanionProfile {
  const profile = getProfileBySlug(resolveProfileSlug(profileSlug));
  if (!profile) {
    throw new Error(`Unknown profile slug: ${profileSlug}`);
  }
  return profile;
}

function resolveChatProfileSlug(
  history: DbMessage[],
  options?: { profileSlug?: string },
): string {
  if (options?.profileSlug) {
    return resolveProfileSlug(options.profileSlug);
  }
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const slug = history[i]?.profile_slug;
    if (slug) return resolveProfileSlug(slug);
  }
  return resolveProfileSlug(null);
}

function ttsProvider(): string {
  return (envValue("MIA_TTS_PROVIDER") ?? "elevenlabs").toLowerCase();
}

function voiceTtsInstructions(
  profile: Pick<CompanionProfile, "name" | "gender">,
): string {
  return ttsProvider() === "xai"
    ? buildXaiVoiceTtsInstructions(profile)
    : buildElevenLabsVoiceTtsInstructions(profile);
}

export function voiceReplyPipeline(): string {
  return envValue("MIA_VOICE_REPLY_PIPELINE")?.toLowerCase() ?? "voice";
}

async function rewriteToDevanagariHindi(
  text: string,
  preserveSpeechTags: boolean,
  profile: Pick<CompanionProfile, "name" | "gender"> = {
    name: ZARA_DISPLAY_NAME,
    gender: "female",
  },
): Promise<string> {
  if (!containsLatinOutsideSpeechTags(text)) {
    return text.trim();
  }

  const tagRule = preserveSpeechTags
    ? "Preserve any existing TTS delivery tags exactly as-is, including square-bracket tags like [laughs], [sighs], [teasing], [pauses], [light chuckle], and any <whisper>...</whisper> tags. Only rewrite the human-readable words around them."
    : "Do not add speech tags or markup.";
  const selfGrammar =
    profile.gender === "male"
      ? "Use masculine self-grammar for the companion (रहा हूँ, करूँगा, गया)."
      : "Use feminine self-grammar for the companion (रही हूँ, करूँगी, गई).";

  const rewritten = await replyChatCompletion(
    [
        {
          role: "system",
          content: `Rewrite the given ${profile.name} reply into natural Devanagari Hindi only.

Rules:
- Output only the rewritten reply, no explanation.
- All visible words must be in Devanagari script.
- Transliterate English loanwords phonetically into Devanagari: cute -> क्यूट, phone -> फोन, message -> मैसेज, online -> ऑनलाइन, okay -> ओके, sorry -> सॉरी, drama -> ड्रामा.
- Keep ${profile.name}'s specific personality, cadence, and exact meaning.
- Preserve the original choice of tum/tu address; do not change who any third-person Hindi refers to.
- ${selfGrammar}
- Keep it short and conversational.
- Do not add pet names, extra direct address, or a new follow-up question while rewriting.
- ${tagRule}`,
        },
        { role: "user", content: text },
      ],
    { label: "Devanagari rewrite" },
  );

  return rewritten.trim();
}

export async function chatWithMia(
  history: DbMessage[],
  options?: ChatWithMiaOptions,
): Promise<string> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const profileSlug = resolveChatProfileSlug(history, options);
  const profile = profileForSlug(profileSlug);
  const mood = options?.mood ?? "friendly";
  const moodLine = moodPromptForMood(mood, profile);
  const voicePrompt = buildVoiceSystemPrompt(profileSlug);
  const systemPrompt = `${
    options?.expressiveTts
      ? `${voicePrompt}\n${voiceTtsInstructions(profile)}`
      : voicePrompt
  }\n\n${moodLine}\n\n${currentIndiaTimeContext()}`;
  const context = prepareConversationContext(history);

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: context.contextNote },
  ];

  messages.push(...context.recentMessages);

  const reply = await replyChatCompletion(messages);

  const voiceReply = options?.expressiveTts ? stripEmojis(reply) : reply;
  const rewritten = await rewriteToDevanagariHindi(
    voiceReply,
    options?.expressiveTts ?? false,
    profile,
  );

  return options?.expressiveTts ? stripEmojis(rewritten) : rewritten;
}

async function addVoiceDeliveryToTextReply(
  textReply: string,
  profile: Pick<CompanionProfile, "name" | "gender" | "role">,
): Promise<string> {
  const profileName = profile.name;
  const cleanReply = stripEmojis(textReply).trim();
  if (!cleanReply) {
    throw new Error("Empty text reply for voice delivery");
  }
  const preserve =
    profile.role === "mentor"
      ? `Keep the same meaning, explanation, example, next step, and ${profileName}'s teaching voice. Do not add a new fact, a second question, romance, or pet names.`
      : `Keep the same meaning, emotional stance, and ${profileName}'s personality. Do not add new ideas, questions, advice, facts, pet names, or extra intimacy.`;

  const tagged = await replyChatCompletion(
    [
        {
          role: "system",
          content: `Convert ${profileName}'s normal text-chat reply into a realistic voice-note script for TTS.

Rules:
- ${preserve}
- Preserve the text reply's existing tum/tu choice and every third-person reference exactly; do not "correct" grammar in a way that changes who an action refers to.
- Convert the spoken words to Devanagari Hindi/Hinglish so the Hindi voice sounds natural. Transliterate English loanwords phonetically when possible.
- Add only a few delivery tags for performance. ${voiceTtsInstructions(profile)}
- Output only the final tagged voice-note script.`,
        },
        { role: "user", content: cleanReply },
      ],
    { label: "Voice delivery tagging" },
  );

  return rewriteToDevanagariHindi(stripEmojis(tagged), true, profile);
}

export async function chatWithMiaText(
  history: DbMessage[],
  options?: {
    mood?: ZaraMood;
    privateMode?: boolean;
    privatePhotosAvailable?: boolean;
    profileSlug?: string;
    /** Voice-note reply: Hindi words are written in Devanagari. */
    spoken?: boolean;
  },
): Promise<string[]> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const profileSlug = resolveChatProfileSlug(history, options);
  const profile = profileForSlug(profileSlug);
  const profileName = profile.name;
  const mentor = profile.role === "mentor";
  const spoken = mentor && options?.spoken === true;
  const privateMode = mentor ? false : (options?.privateMode ?? false);
  const mood = privateMode ? "bold" : (options?.mood ?? "friendly");
  const privateLine = privateMode
    ? `\n\n${privateModeRomanticPrompt(profileName, profile.gender)}`
    : mentor
      ? `\n\nstudy boundary:
- This chat is study guidance. Do not flirt or role-play romance, even if another chat with this user is in private mode.`
      : "";
  const mediaLine =
    privateMode && options?.privatePhotosAvailable === false
      ? `\n\nprivate media availability:
- No private photo is available for ${profileName} in this chat. If the user asks for one, say so briefly and naturally.
- Do not promise to send or take a photo, and never substitute another companion's image.`
      : "";
  const systemPrompt = `${spoken ? buildSpokenSystemPrompt(profileSlug) : buildTextSystemPrompt(profileSlug)}

${moodPromptForMood(mood, profile)}${privateLine}${mediaLine}

${currentIndiaTimeContext()}

${spoken ? spokenReplyLanguageInstruction(history) : latestUserLanguageInstruction(history)}

${spoken ? MENTOR_SPOKEN_REPLY_OUTPUT_FORMAT : textReplyOutputFormat(profile)}`;
  const context = prepareConversationContext(history);

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: context.contextNote },
  ];

  messages.push(...context.recentMessages);

  const reply = await replyChatCompletion(messages);

  const segments = parseTextReplySegments(reply, mentor ? "mentor" : "companion");
  if (!spoken) return segments;
  const spokenSegments: string[] = [];
  for (const segment of segments) {
    spokenSegments.push(await rewriteRomanHindiForSpeech(segment, profileName));
  }
  return spokenSegments;
}

export async function chatWithMiaTextAsVoice(
  history: DbMessage[],
  options?: { mood?: ZaraMood; profileSlug?: string },
): Promise<string> {
  const profileSlug = resolveChatProfileSlug(history, options);
  const profile = profileForSlug(profileSlug);
  const textSegments = await chatWithMiaText(history, {
    mood: options?.mood,
    profileSlug,
  });
  return addVoiceDeliveryToTextReply(textSegments.join(" "), profile);
}
