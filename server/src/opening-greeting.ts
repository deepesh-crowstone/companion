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

/** Asked only when a mentor chat starts without a greeting or a language. */
export const ALAKH_LANGUAGE_ASK =
  "hello beta, which language would you like to talk in: Hinglish or English?";

/** What Alakh Sir says back when the student opens with a greeting. */
export const ALAKH_OPENING_GREETINGS = [
  "Hello, bata kaise ho?",
  "Hello beta, kaise chal rahi hai padhai?",
];

const ALAKH_ENGLISH = ALAKH_OPENING_GREETINGS;
const ALAKH_HINGLISH = ALAKH_OPENING_GREETINGS;

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
