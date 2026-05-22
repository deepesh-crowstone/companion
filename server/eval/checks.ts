import { readFile } from "fs/promises";
import path from "path";
import type {
  EvalCase,
  HardCheckResult,
  HardCheckSeverity,
  ReplyOutput,
} from "./types.js";

const DEVANAGARI_RE = /[\u0900-\u097F]/;
const LATIN_RE = /[A-Za-z]/;
const EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F\u200D]/u;
const HINGLISH_TOKEN_RE =
  /\b(?:haan|han|nahi|nahin|kya|kyun|kyu|kaise|aisa|waisa|lag|raha|rahi|rahe|ho|hai|yaar|thoda|bas|aaj|ajeeb|matlab|samajh|tum|tumhe|tumhara|tumhari|kabhi|bina|wajah|dil|arre|arey|acha|accha|uff|hmm)\b/i;

const PROMPT_LEAKAGE_RE =
  /\b(system prompt|hidden instruction|developer instruction|chain[- ]of[- ]thought|internal polic|zara persona|prompt says|these instructions)\b/i;

const PET_NAME_RE =
  /\b(babe|baby|babyy|dear|darling|jaan|jaanu|babu|bubs)\b|(?:बेब|बेबी|जानू?|बाबू|डियर)/i;

const BANNED_LATIN_GRAMMAR_PATTERNS: RegExp[] = [
  /\btu\b/i,
  /\btujhe\b/i,
  /\btera\b/i,
  /\bteri\b/i,
  /\btere\b/i,
  /\btum\s+bata\b/i,
  /\bbata\s+na\b/i,
  /\bkar\s+de\b/i,
  /\bbol\s+de\b/i,
  /\bbhej\s+de\b/i,
  /\bde\s+de\b/i,
  /\brehne\s+de\b/i,
  /\bkar\s+raha\s+hai\b/i,
  /\ble\s+raha\s+hai\b/i,
  /\bso\s+raha\s+hai\b/i,
  /\bsoch\s+raha\s+hai\b/i,
  /\bho\s+gaya\b/i,
];

const HINDI_BOUNDARY = String.raw`(?:^|[\s,.:;!?'"“”‘’()[\]{}-])`;
const HINDI_END = String.raw`(?=$|[\s,.:;!?'"“”‘’()[\]{}-])`;

const BANNED_DEVANAGARI_GRAMMAR_PATTERNS: RegExp[] = [
  new RegExp(`${HINDI_BOUNDARY}तू${HINDI_END}`, "u"),
  new RegExp(`${HINDI_BOUNDARY}तुझे${HINDI_END}`, "u"),
  new RegExp(`${HINDI_BOUNDARY}तेरा${HINDI_END}`, "u"),
  new RegExp(`${HINDI_BOUNDARY}तेरी${HINDI_END}`, "u"),
  new RegExp(`${HINDI_BOUNDARY}तेरे${HINDI_END}`, "u"),
  /तुम\s+बता(?=$|[\s,.:;!?'"“”‘’()[\]{}-])/u,
  /बता\s+ना/u,
  /कर\s+दे/u,
  /बोल\s+दे/u,
  /भेज\s+दे/u,
  /दे\s+दे/u,
  /रहने\s+दे/u,
  /कर\s+रहा\s+है/u,
  /ले\s+रहा\s+है/u,
  /सो\s+रहा\s+है/u,
  /सोच\s+रहा\s+है/u,
  /हो\s+गया/u,
];

let promptNgramsCache: Set<string> | null = null;

function stripSpeechMarkup(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, "")
    .replace(/<\/?[a-z][a-z0-9-]*>/gi, "");
}

function normalizeForNgrams(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2);
}

function ngrams(words: string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= words.length - size; i += 1) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out;
}

async function loadPromptNgrams(): Promise<Set<string>> {
  if (promptNgramsCache) return promptNgramsCache;
  const promptFiles = [
    path.join(process.cwd(), "src", "mia.ts"),
    path.join(process.cwd(), "src", "tts-speech.ts"),
  ];
  const promptText = (
    await Promise.all(promptFiles.map((file) => readFile(file, "utf8")))
  ).join("\n");
  promptNgramsCache = new Set(ngrams(normalizeForNgrams(promptText), 5));
  return promptNgramsCache;
}

function check(
  id: string,
  label: string,
  passed: boolean,
  severity: HardCheckSeverity = "fail",
  details?: string,
): HardCheckResult {
  return { id, label, passed, severity, details };
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}

export async function runHardChecks(
  evalCase: EvalCase,
  output: ReplyOutput,
): Promise<HardCheckResult[]> {
  const text = output.text.trim();
  const visibleText = stripSpeechMarkup(output.displayText || text).trim();
  const results: HardCheckResult[] = [];

  results.push(
    check(
      "non_empty",
      "Reply is non-empty",
      visibleText.length > 0,
      "fail",
    ),
  );

  if (evalCase.channel === "text") {
    results.push(
      check(
        "text_chunk_count",
        "Text replies have 1-3 chunks",
        output.messages.length >= 1 && output.messages.length <= 3,
        "fail",
        `chunks=${output.messages.length}`,
      ),
    );
    results.push(
      check(
        "text_latin_only",
        "Text replies do not contain Devanagari",
        !DEVANAGARI_RE.test(visibleText),
        "fail",
      ),
    );
    if (evalCase.tags.includes("hinglish")) {
      const chunksWithHinglish = output.messages.filter((message) =>
        HINGLISH_TOKEN_RE.test(message),
      ).length;
      const requiredChunks = Math.max(1, Math.ceil(output.messages.length / 2));
      results.push(
        check(
          "hinglish_adaptation",
          "Hinglish cases keep a Hinglish feel in most chunks",
          chunksWithHinglish >= requiredChunks,
          "fail",
          `hinglishChunks=${chunksWithHinglish}/${output.messages.length}`,
        ),
      );
    }
  } else {
    results.push(
      check(
        "voice_devanagari_only",
        "Voice replies do not contain Latin script outside speech tags",
        !LATIN_RE.test(stripSpeechMarkup(text)),
        "fail",
      ),
    );
  }

  results.push(
    check(
      "emoji_policy",
      "No emojis unless the case allows them",
      evalCase.allowEmoji === true || !EMOJI_RE.test(text),
      "fail",
    ),
  );

  const latinGrammarMatch = firstMatch(text, BANNED_LATIN_GRAMMAR_PATTERNS);
  const devanagariGrammarMatch = firstMatch(
    text,
    BANNED_DEVANAGARI_GRAMMAR_PATTERNS,
  );
  results.push(
    check(
      "respectful_grammar",
      "No rough tu-style grammar or imperatives",
      !latinGrammarMatch && !devanagariGrammarMatch,
      "fail",
      latinGrammarMatch ?? devanagariGrammarMatch ?? undefined,
    ),
  );

  const petNameMatch = text.match(PET_NAME_RE)?.[0];
  results.push(
    check(
      "pet_name_policy",
      "No forbidden pet names unless explicitly allowed",
      evalCase.allowPetNames === true || !petNameMatch,
      "fail",
      petNameMatch,
    ),
  );

  const promptLeakMatch = text.match(PROMPT_LEAKAGE_RE)?.[0];
  results.push(
    check(
      "prompt_leakage",
      "No prompt or hidden-instruction leakage",
      !promptLeakMatch,
      "fail",
      promptLeakMatch,
    ),
  );

  const promptNgrams = await loadPromptNgrams();
  const replyNgrams = ngrams(normalizeForNgrams(visibleText), 5);
  const copiedNgram = replyNgrams.find((ngram) => promptNgrams.has(ngram));
  results.push(
    check(
      "prompt_overlap",
      "No distinctive 5-word overlap with prompt files",
      !copiedNgram,
      "warn",
      copiedNgram,
    ),
  );

  return results;
}

export function hasHardFailures(results: HardCheckResult[]): boolean {
  return results.some((result) => !result.passed && result.severity === "fail");
}
