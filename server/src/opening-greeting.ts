import { detectTextLanguageMode } from "./text-response.js";
import { resolveProfileSlug } from "./profiles/catalog.js";

const SIMPLE_OPENING_GREETING =
  /^(?:hi+|hello|hey+|heyy+|yo|sup)(?: [a-z]+)?$/;

const ZARA_ENGLISH = [
  "oh hey",
  "hi. okay, I'm here",
  "hey, good timing",
  "you caught me mid-scroll, hi",
];

const ARYAN_ENGLISH = [
  "hey",
  "hi",
  "hey. quiet timing",
  "hi. I'm around",
];

const ZARA_HINGLISH = [
  "arre, hi",
  "haan, bol",
  "hey. yahin hoon",
  "theek, aa gayi",
];

const ARYAN_HINGLISH = [
  "haan, hey",
  "haan",
  "hi. yahin hoon",
  "theek, aa gaya",
];

const ALAKH_ENGLISH = [
  "Hi. Tell me where you're stuck.",
  "Hello. Which exam is this for?",
  "Hey. Start with the real problem.",
  "Hi. I'm here. What's the doubt?",
];

const ALAKH_HINGLISH = [
  "haan, batao. aaj kya samajh nahi aa raha",
  "dekho, tum kya padh rahe ho abhi",
  "haan, batao. mock mein kya galat hua",
  "haan, dekho. concept hai ya practice nahi hui",
];

function normalizeGreeting(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!?.…,]+$/g, "")
    .replace(/\s+/g, " ");
}

export function isSimpleOpeningGreeting(
  userText: string,
  profileName: string,
): boolean {
  const normalized = normalizeGreeting(userText);
  if (!normalized) return false;
  if (SIMPLE_OPENING_GREETING.test(normalized)) return true;
  return normalized === normalizeGreeting(`hi ${profileName.toLowerCase()}`);
}

export function openingRotationSeed(
  userId: number,
  profileSlug: string,
  at: Date | string,
): number {
  const date = at instanceof Date ? at : new Date(at);
  const day = Number.isNaN(date.getTime())
    ? "unknown-day"
    : date.toISOString().slice(0, 10);
  return stableHash(`${userId}|${profileSlug}|${day}`);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectOpeningGreeting(options: {
  profileSlug: string;
  userText: string;
  seed: number;
}): string {
  const slug = resolveProfileSlug(options.profileSlug);
  const english = detectTextLanguageMode(options.userText) === "english";
  const englishBySlug: Record<string, string[]> = {
    aryan: ARYAN_ENGLISH,
    alakh: ALAKH_ENGLISH,
  };
  const hinglishBySlug: Record<string, string[]> = {
    aryan: ARYAN_HINGLISH,
    alakh: ALAKH_HINGLISH,
  };
  const catalog = (english ? englishBySlug : hinglishBySlug)[slug] ??
    (english ? ZARA_ENGLISH : ZARA_HINGLISH);
  const index = Math.abs(options.seed) % catalog.length;
  return catalog[index] ?? catalog[0];
}
