const MAX_TEXT_REPLY_SEGMENTS = 3;
const MAX_TEXT_SEGMENT_CHARS = 320;
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const HINGLISH_LANGUAGE_TOKEN_RE =
  /\b(?:haan|han|hain|nahi|nahin|kya|kyun|kyu|kaise|kaisa|aisa|waisa|raha|rahi|rahe|rha|rhi|yaar|yrr|thoda|bas|aaj|abhi|ajeeb|matlab|samajh|suno|dekho|batao|btao|bhejo|tum|tumhe|tumhara|tumhari|mera|meri|bina|wajah|dil|arre|arey|acha|accha|theek|thik|hoon|hun|hai|pyaar|ishq)\b/gi;

export type TextLanguageMode =
  | "english"
  | "hinglish"
  | "mixed"
  | "hindi_devanagari";

function cleanTextSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(
      /([\p{Extended_Pictographic}]\uFE0F?)(?:\s*\1){2,}/gu,
      "$1$1",
    )
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

function splitLongSegment(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_TEXT_SEGMENT_CHARS) {
    const window = remaining.slice(0, MAX_TEXT_SEGMENT_CHARS + 1);
    const punctuation = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
    );
    const whitespace = window.lastIndexOf(" ");
    const splitAt =
      punctuation >= Math.floor(MAX_TEXT_SEGMENT_CHARS * 0.55)
        ? punctuation + 1
        : whitespace >= Math.floor(MAX_TEXT_SEGMENT_CHARS * 0.55)
          ? whitespace
          : MAX_TEXT_SEGMENT_CHARS;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

const SAFETY_GUIDANCE_RE =
  /\b(?:suicid(?:e|al)|self[-\s]?harm|hurt(?:ing)? (?:myself|yourself)|kill myself|emergency|helplines?|hotlines?|crisis)\b/i;

function containsSafetyGuidance(text: string): boolean {
  return SAFETY_GUIDANCE_RE.test(text);
}

function fitTextSegments(segments: string[]): string[] {
  const fitted = segments.flatMap(splitLongSegment);
  if (fitted.length <= MAX_TEXT_REPLY_SEGMENTS) return fitted;

  const kept = fitted.slice(0, MAX_TEXT_REPLY_SEGMENTS - 1);
  const remainder = fitted.slice(MAX_TEXT_REPLY_SEGMENTS - 1).join(" ").trim();
  if (
    fitted.some((segment) => containsSafetyGuidance(segment)) ||
    remainder.length <= MAX_TEXT_SEGMENT_CHARS
  ) {
    kept.push(remainder);
    return kept;
  }

  kept.push(`${remainder.slice(0, MAX_TEXT_SEGMENT_CHARS - 1).trimEnd()}…`);
  return kept;
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
  if (arrayMatch) candidates.push(arrayMatch[0]);

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
        .map(cleanTextSegment)
        .filter((value): value is string => value != null);
      if (segments.length > 0) return fitTextSegments(segments);
    } catch {
      // Try the next candidate, then fall back to plain-text parsing.
    }
  }
  return null;
}

function splitPlainTextSegments(raw: string): string[] {
  const lineSegments = raw
    .split(/\r?\n+/)
    .map(cleanTextSegment)
    .filter((value): value is string => value != null);
  if (lineSegments.length > 1) return fitTextSegments(lineSegments);

  const oneLine = cleanTextSegment(raw);
  return oneLine ? fitTextSegments([oneLine]) : ["hmm"];
}

export function parseTextReplySegments(raw: string): string[] {
  return parseJsonSegments(raw) ?? splitPlainTextSegments(raw);
}

const LOW_SIGNAL_RE =
  /^(?:h+m+|u+h+|o+k+|okay|k+|lol|lmao|hi+|hey+|hello|yo|sup|na|hmm+|ah+|oh+|wow|cool|nice|same|true|right|yep|yeah|yup|nope|idk)[.!?…]*$/i;

const FRIENDLY_TU_RE =
  /\b(?:tu|tujhe|tera|teri|tere)\b|(?:^|[\s,.:;!?'"“”‘’()[\]{}-])(?:तू|तुझे|तेरा|तेरी|तेरे)(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/iu;

function hinglishTokenCount(text: string): number {
  return text.match(HINGLISH_LANGUAGE_TOKEN_RE)?.length ?? 0;
}

export function detectTextLanguageMode(text: string): TextLanguageMode {
  const trimmed = text.trim();
  if (!trimmed) return "english";
  if (DEVANAGARI_RE.test(trimmed)) return "hindi_devanagari";

  const words = trimmed.match(/[A-Za-z]+/g) ?? [];
  if (words.length === 0) return "english";

  const hinglishMatches = hinglishTokenCount(trimmed);
  const ratio = hinglishMatches / words.length;
  if (hinglishMatches >= 3 || ratio >= 0.4) return "hinglish";
  if (hinglishMatches >= 1) {
    return words.length <= 3 ? "hinglish" : "mixed";
  }
  return "english";
}

export function isLowSignalText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || LOW_SIGNAL_RE.test(trimmed)) return true;
  if (DEVANAGARI_RE.test(trimmed)) return false;
  const words = trimmed.match(/[A-Za-z]+/g) ?? [];
  return words.length <= 2 && hinglishTokenCount(trimmed) === 0;
}

/**
 * Clear language in the latest message wins. A short neutral message keeps
 * the established recent language, and otherwise stays English so words like
 * "love", "please", or a lone "na" do not force Hinglish.
 */
export function resolveReplyLanguageMode(
  latestUserText: string,
  priorUserTexts: string[] = [],
): TextLanguageMode {
  if (!isLowSignalText(latestUserText)) {
    return detectTextLanguageMode(latestUserText);
  }
  for (let index = priorUserTexts.length - 1; index >= 0; index -= 1) {
    const prior = priorUserTexts[index] ?? "";
    if (!isLowSignalText(prior)) return detectTextLanguageMode(prior);
  }
  return "english";
}

export function friendlyTuEstablished(userTexts: string[]): boolean {
  let count = 0;
  for (const text of userTexts) {
    if (FRIENDLY_TU_RE.test(text)) count += 1;
    if (count >= 2) return true;
  }
  return false;
}

export function addressGuidance(friendlyTu: boolean): string {
  if (friendlyTu) {
    return 'address: the user has repeatedly used friendly "tu", so mirror that tu address in this reply. Do not widen it into rough or hostile speech.';
  }
  return 'address: default to respectful "tum" (tum/tumhe/tumhara, batao, kar do). Do not switch to "tu" from one ambiguous token, third-person Hindi, or song lyrics.';
}
