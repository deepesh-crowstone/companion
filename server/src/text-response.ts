import { visibleReply } from "./reply-client.js";

/** Preferred visible length of one chat bubble. */
export const TARGET_TEXT_SEGMENT_CHARS = 80;
/** Hard cap for one visible bubble. A leftover one-word fragment may ride a little over this. */
export const MAX_TEXT_SEGMENT_CHARS = 120;
export const MAX_TEXT_REPLY_SEGMENTS = 3;

const MIN_SPLIT_CHARS = 24;
const CLAUSE_TARGET_SLACK = 40;
const ORPHAN_JOIN_CHARS = MAX_TEXT_SEGMENT_CHARS + 16;
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "st",
  "sr",
  "jr",
  "etc",
  "vs",
  "eg",
  "ie",
  "rs",
  "vol",
  "fig",
  "approx",
  "inc",
  "ltd",
]);
const CONJUNCTIONS = [
  "and",
  "but",
  "so",
  "because",
  "though",
  "although",
  "lekin",
  "par",
  "magar",
  "kyunki",
  "toh",
];

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

const SAFETY_GUIDANCE_RE =
  /\b(?:suicid(?:e|al)|self[-\s]?harm|hurt(?:ing)? (?:myself|yourself)|kill myself|emergency|helplines?|hotlines?|crisis)\b/i;

function containsSafetyGuidance(text: string): boolean {
  return SAFETY_GUIDANCE_RE.test(text);
}

type Bubble = { text: string; protect: boolean };
type SplitCandidate = { index: number; kind: "punct" | "conj" };

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function joinPieces(left: string, right: string): string {
  return `${left.trim()} ${right.trim()}`.replace(/\s+/g, " ").trim();
}

function skipSpace(text: string, index: number): number {
  let next = index;
  while (next < text.length && /\s/u.test(text[next] ?? "")) next += 1;
  return next;
}

function isSentencePunctuation(
  text: string,
  punctStart: number,
  punctEnd: number,
): boolean {
  const ch = text[punctStart] ?? "";
  if (ch === "!" || ch === "?" || ch === "…") return true;
  if (punctEnd > punctStart) return true;
  const prev = text[punctStart - 1] ?? "";
  const next = text[punctEnd + 1] ?? "";
  if (/\d/.test(prev) && /\d/.test(next)) return false;
  const word = /[A-Za-z]+$/.exec(text.slice(0, punctStart))?.[0] ?? "";
  if (word.length <= 1) return false;
  return !ABBREVIATIONS.has(word.toLowerCase());
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
    let end = i;
    while (end + 1 < text.length && ".!?…".includes(text[end + 1] ?? "")) {
      end += 1;
    }
    if (!isSentencePunctuation(text, i, end)) {
      i = end;
      continue;
    }
    const after = text.slice(end + 1);
    if (after.length > 0 && !/^\s/u.test(after)) {
      i = end;
      continue;
    }
    const sentence = text.slice(start, end + 1).trim();
    if (sentence) sentences.push(sentence);
    start = end + 1;
    i = end;
  }
  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences.length > 0 ? sentences : [text.trim()].filter(Boolean);
}

function clauseBoundaries(
  text: string,
  min: number,
  max: number,
): SplitCandidate[] {
  const found: SplitCandidate[] = [];
  const push = (index: number, kind: SplitCandidate["kind"]) => {
    if (index < min || index > max || index <= 0 || index >= text.length) return;
    if (found.some((item) => item.index === index)) return;
    found.push({ index, kind });
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ((ch === "," || ch === ";" || ch === ":") && /\s/u.test(text[i + 1] ?? "")) {
      push(skipSpace(text, i + 1), "punct");
    }
  }

  for (const match of text.matchAll(/\s+[—–-]\s+/g)) {
    const start = match.index ?? 0;
    push(start + match[0].length, "punct");
  }

  const conjunctions = new RegExp(`\\s+(?:${CONJUNCTIONS.join("|")})\\b`, "gi");
  for (const match of text.matchAll(conjunctions)) {
    push(skipSpace(text, match.index ?? 0), "conj");
  }
  return found;
}

function pickCandidate(
  candidates: SplitCandidate[],
  target: number,
): SplitCandidate {
  return candidates.reduce((best, candidate) => {
    const score = (item: SplitCandidate) =>
      Math.abs(item.index - target) - (item.kind === "punct" ? 6 : 0);
    return score(candidate) < score(best) ? candidate : best;
  });
}

function balancedCandidates(text: string, min: number, max: number): SplitCandidate[] {
  return clauseBoundaries(text, min, max).filter((candidate) => {
    const left = text.slice(0, candidate.index).trim();
    const right = text.slice(candidate.index).trim();
    return wordCount(left) >= 2 && wordCount(right) >= 2;
  });
}

function safetySpans(text: string): Array<{ start: number; end: number }> {
  const re = new RegExp(SAFETY_GUIDANCE_RE.source, "gi");
  return [...text.matchAll(re)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function avoidSafetyCut(text: string, index: number): number {
  for (const span of safetySpans(text)) {
    if (index > span.start && index < span.end) return span.end;
  }
  return index;
}

function closestSpace(
  text: string,
  min: number,
  max: number,
  target: number,
): number | null {
  let best: number | null = null;
  const upper = Math.min(max, text.length - 1);
  for (let i = 1; i <= upper; i += 1) {
    if (text[i] !== " " || i < min) continue;
    if (best == null || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  if (best != null) return best;
  for (let i = upper; i > 0; i -= 1) {
    if (text[i] === " ") return i;
  }
  return null;
}

function chooseHardSplit(text: string): number | null {
  const limit = Math.min(MAX_TEXT_SEGMENT_CHARS, text.length - 1);
  const clauses = balancedCandidates(text, MIN_SPLIT_CHARS, limit);
  if (clauses.length > 0) {
    const best = pickCandidate(clauses, TARGET_TEXT_SEGMENT_CHARS);
    if (Math.abs(best.index - TARGET_TEXT_SEGMENT_CHARS) <= CLAUSE_TARGET_SLACK) {
      return avoidSafetyCut(text, best.index);
    }
  }
  const spaced = closestSpace(
    text,
    MIN_SPLIT_CHARS,
    limit,
    TARGET_TEXT_SEGMENT_CHARS,
  );
  return spaced == null ? null : avoidSafetyCut(text, spaced);
}

function splitSentenceParts(text: string): string[] {
  if (text.length <= MAX_TEXT_SEGMENT_CHARS) return [text];
  const at = chooseHardSplit(text);
  if (at == null || at <= 0 || at >= text.length) return [text];
  const left = text.slice(0, at).trim();
  const right = text.slice(at).trim();
  if (!left || !right || left.length >= text.length) return [text];
  return [...splitSentenceParts(left), ...splitSentenceParts(right)];
}

function absorbClauseOrphans(parts: string[]): string[] {
  const items = parts.map((part) => part.trim()).filter(Boolean);
  let index = 0;
  while (index < items.length) {
    const current = items[index] ?? "";
    if (items.length === 1 || wordCount(current) >= 2) {
      index += 1;
      continue;
    }
    const previous = index > 0 ? items[index - 1] : null;
    if (previous != null && joinPieces(previous, current).length <= ORPHAN_JOIN_CHARS) {
      items.splice(index - 1, 2, joinPieces(previous, current));
      index = Math.max(0, index - 1);
      continue;
    }
    const next = index + 1 < items.length ? items[index + 1] : null;
    if (next != null && joinPieces(current, next).length <= ORPHAN_JOIN_CHARS) {
      items.splice(index, 2, joinPieces(current, next));
      continue;
    }
    index += 1;
  }
  return items;
}

function explodeLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_TEXT_SEGMENT_CHARS) return [sentence];
  return absorbClauseOrphans(splitSentenceParts(sentence));
}

function clauseSplitAt(text: string): number | null {
  if (text.length <= TARGET_TEXT_SEGMENT_CHARS) return null;
  if (text.length > MAX_TEXT_SEGMENT_CHARS) return null;
  const candidates = balancedCandidates(
    text,
    MIN_SPLIT_CHARS,
    text.length - MIN_SPLIT_CHARS,
  );
  if (candidates.length === 0) return null;
  return pickCandidate(candidates, TARGET_TEXT_SEGMENT_CHARS).index;
}

function sentencesToBubbles(segment: string): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const sentence of splitSentences(segment)) {
    const protect = containsSafetyGuidance(sentence);
    for (const text of explodeLongSentence(sentence)) {
      if (!text) continue;
      bubbles.push({
        text,
        protect: protect || containsSafetyGuidance(text),
      });
    }
  }
  return bubbles;
}

function bestMergeIndex(items: Bubble[]): number | null {
  let best: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < items.length - 1; i += 1) {
    const joined = joinPieces(items[i]?.text ?? "", items[i + 1]?.text ?? "");
    if (joined.length > MAX_TEXT_SEGMENT_CHARS) continue;
    const score = joined.length * 1000 - i;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function selectWithProtection(items: Bubble[], maxBubbles: number): Bubble[] {
  const core = items.flatMap((item, index) =>
    containsSafetyGuidance(item.text) ? [index] : [],
  );
  if (core.length === 0) return items.slice(0, maxBubbles);

  const keptCore =
    core.length > maxBubbles
      ? [...core.slice(0, maxBubbles - 1), core[core.length - 1]!]
      : core;
  const chosen = new Set<number>(keptCore);

  let grew = true;
  while (chosen.size < maxBubbles && grew) {
    grew = false;
    for (const index of [...chosen].sort((a, b) => a - b)) {
      const next = index + 1;
      if (
        chosen.size < maxBubbles &&
        next < items.length &&
        items[next]?.protect &&
        !chosen.has(next)
      ) {
        chosen.add(next);
        grew = true;
      }
      const prev = index - 1;
      if (
        chosen.size < maxBubbles &&
        prev >= 0 &&
        items[prev]?.protect &&
        !chosen.has(prev)
      ) {
        chosen.add(prev);
        grew = true;
      }
    }
  }

  for (let index = 0; index < items.length && chosen.size < maxBubbles; index += 1) {
    chosen.add(index);
  }

  return [...chosen].sort((a, b) => a - b).map((index) => items[index]!);
}

function packToLimit(bubbles: Bubble[]): Bubble[] {
  const items = bubbles.filter((bubble) => bubble.text.length > 0);
  while (items.length > MAX_TEXT_REPLY_SEGMENTS) {
    const index = bestMergeIndex(items);
    if (index == null) break;
    const left = items[index]!;
    const right = items[index + 1]!;
    items.splice(index, 2, {
      text: joinPieces(left.text, right.text),
      protect: left.protect || right.protect,
    });
  }
  if (items.length <= MAX_TEXT_REPLY_SEGMENTS) return items;
  return selectWithProtection(items, MAX_TEXT_REPLY_SEGMENTS);
}

function splitOverTargetIfRoom(bubbles: Bubble[]): Bubble[] {
  const items = [...bubbles];
  while (items.length < MAX_TEXT_REPLY_SEGMENTS) {
    let best = -1;
    let bestLength = TARGET_TEXT_SEGMENT_CHARS;
    for (let i = 0; i < items.length; i += 1) {
      const text = items[i]?.text ?? "";
      if (text.length <= bestLength || clauseSplitAt(text) == null) continue;
      best = i;
      bestLength = text.length;
    }
    if (best < 0) break;
    const bubble = items[best]!;
    const at = clauseSplitAt(bubble.text);
    if (at == null) break;
    const left = bubble.text.slice(0, at).trim();
    const right = bubble.text.slice(at).trim();
    items.splice(
      best,
      1,
      { text: left, protect: bubble.protect || containsSafetyGuidance(left) },
      { text: right, protect: bubble.protect || containsSafetyGuidance(right) },
    );
  }
  return items;
}

function fitTextSegments(segments: string[]): string[] {
  const packed = packToLimit(segments.flatMap(sentencesToBubbles));
  return splitOverTargetIfRoom(packed).map((bubble) => bubble.text);
}

function linePieces(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map((line) => cleanTextSegment(line))
    .filter((line): line is string => line != null);
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
      const segments = values.flatMap((value) =>
        typeof value === "string" ? linePieces(value) : [],
      );
      if (segments.length > 0) return fitTextSegments(segments);
    } catch {
      // Try the next candidate, then fall back to plain-text parsing.
    }
  }
  return null;
}

function splitPlainTextSegments(raw: string): string[] {
  const pieces = linePieces(raw);
  if (pieces.length === 0) return ["hmm"];
  return fitTextSegments(pieces);
}

export function parseTextReplySegments(raw: string): string[] {
  const visible = visibleReply(raw);
  return parseJsonSegments(visible) ?? splitPlainTextSegments(visible);
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
