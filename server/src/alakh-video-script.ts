import { visibleReply } from "./reply-client.js";

export const SOLUTION_VIDEO_BEAT_LIMIT = 40;
export const SOLUTION_VIDEO_BEAT_GAP_SECONDS = 0.45;
export const SOLUTION_VIDEO_END_GAP_SECONDS = 1.2;

export type ArtCue = {
  /** Stable name so the same picture is generated once and then reused. */
  id: string;
  /** What to draw. The picture has no letters. Marks are written beside it. */
  prompt: string;
};

export type MarkCue = {
  /** The part of the picture, in a word or two of English. */
  part: string;
  /** The symbol that part stands for, such as l or B. */
  symbol: string;
};

export type SolutionBeat = {
  /** What Alakh Sir says while this scene is on screen. */
  narration: string;
  /** Words and equation joined, for logs and older callers. */
  display: string;
  /** The claim written on the right. Not a title. Not the spoken why. */
  text: string;
  /** One formula, without dollar signs. Empty when this scene has no equation. */
  math: string;
  /** One picture, only when seeing the thing helps. Reused by id. */
  art?: ArtCue;
  /** Short legend under the picture. Never drawn inside the image. */
  marks?: MarkCue[];
  /** The quantity the problem asks for. Stays pinned on the left. */
  find?: string;
  /** Data this beat adds to the pinned given-list. */
  givens?: string[];
  /** True when Text and Math were written as one scene, so they are not split apart. */
  composed?: boolean;
};

export const SOLUTION_VIDEO_SCRIPT_PROMPT = `Write a clear explanation video of this solution. Output only beats. The page is two columns: a left reference, and a right writing column. You name content. You do not pick left or right.

BEAT
Say: the why, spoken
Text: the claim, one or two short lines
Math: one equation, or -
Find: the quantity to find, or -
Given: one given, or -
Art: one reusable object, or -
Mark: part=symbol

The page writes Text and Math on the right, in order, at a notebook size. Say is the spoken why. Text is the claim a mute student can follow. Never transcribe Say into Text. Never put an equation in Art or in Text.

Art is - by default. Use Art only when the student must see an object, and only if that object can be drawn honestly. Reuse the same Art wording so the picture stays. At most two pictures in the whole lesson. No circuits, rays, graphs, or rails. No letters, Hindi, or equations inside the picture. Mark names a part in English and the symbol we write in the legend.

Find names what it is asking, once. Given is one number or symbol the problem hands over. Those stay on the left for every later beat. Repeat Find on later beats if you must; do not invent a second unknown.

Open by teaching the problem, before any solving:
- First beat: what the situation is. Text is the claim. Art only if a single object helps. No equation.
- Next beats: what it is asking. Find names the quantity. Text states that question in one short line.
- Next beats: the given data, one Given per beat. Math shows that single value. Text says what the number means.
- Only after the problem is clear, start the solution.

Then one new idea per beat:
- Say explains only this step: why, what each symbol means, and how the number came.
- Text is the claim of this step, at most two short lines.
- Math is one equation copied from the solution, written as $...$. Do not invent a new result.
- Each Say is at least three sentences, usually four to six. Go slowly.
- Use as many beats as the working needs. A short idea is about 8 beats. A full numerical is 12 to 20.

Say:
- Hindi words in Devanagari. Never Roman Hindi. English words and numbers stay Latin.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function artId(prompt: string): string {
  return prompt
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const FIELD_STOP = "Say|Show|Text|Math|Art|Draw|At|Find|Given|Mark|Kind";

function field(part: string, name: string): string {
  const match = part.match(
    new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\n(?:${FIELD_STOP}):|(?![\\s\\S]))`, "im"),
  );
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function fields(part: string, name: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`^${name}:\\s*(.+)`, "gim");
  for (const match of part.matchAll(pattern)) {
    const value = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!blank(value)) values.push(value);
  }
  return values;
}

function blank(value: string): boolean {
  return value === "" || value === "-" || /^none$/i.test(value);
}

function stripDollars(value: string): string {
  if (blank(value)) return "";
  const match = value.match(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/);
  if (match) return (match[1] ?? match[2] ?? "").trim();
  return value.trim();
}

/** Splits a legacy Show line into the words and the single equation. */
export function classifyShow(display: string): { text: string; math: string } {
  const match = display.match(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/);
  if (!match) return { text: display.trim(), math: "" };
  const math = (match[1] ?? match[2] ?? "").trim();
  const text = display
    .replace(match[0], " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, math };
}

function readArt(part: string): ArtCue | undefined {
  const prompt = field(part, "Art") || field(part, "Draw");
  if (blank(prompt)) return undefined;
  const id = artId(prompt);
  if (!id) return undefined;
  return { id, prompt: prompt.slice(0, 180) };
}

function readMarks(part: string): MarkCue[] {
  const marks: MarkCue[] = [];
  for (const raw of fields(part, "Mark")) {
    const pair = raw.match(/^(.+?)\s*=\s*(.+)$/);
    if (pair?.[1] && pair[2]) {
      marks.push({ part: pair[1].trim().slice(0, 40), symbol: pair[2].trim().slice(0, 20) });
      continue;
    }
    marks.push({ part: raw.slice(0, 40), symbol: "" });
  }
  return marks;
}

function readGivens(part: string): string[] {
  return fields(part, "Given").map((value) => stripDollars(value).slice(0, 80)).filter(Boolean);
}

function extras(
  beat: SolutionBeat,
  art?: ArtCue,
  marks?: MarkCue[],
  find?: string,
  givens?: string[],
): SolutionBeat {
  if (art) beat.art = art;
  if (marks?.length) beat.marks = marks;
  if (find) beat.find = find.slice(0, 80);
  if (givens?.length) beat.givens = givens.slice(0, 6);
  return beat;
}

function looseBeat(
  narration: string,
  display: string,
  art?: ArtCue,
  marks?: MarkCue[],
  find?: string,
  givens?: string[],
): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim();
  const show = display.trim();
  const parts = classifyShow(show);
  if (!say || (!parts.text && !parts.math && !art && !find && !givens?.length)) return null;
  return extras(
    {
      narration: say,
      display: show.slice(0, 500),
      text: parts.text.slice(0, 280),
      math: parts.math.slice(0, 400),
    },
    art,
    marks,
    find,
    givens,
  );
}

function sceneBeat(
  narration: string,
  text: string,
  math: string,
  art?: ArtCue,
  marks?: MarkCue[],
  find?: string,
  givens?: string[],
): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim();
  const words = blank(text) ? "" : text.trim();
  const tex = stripDollars(math);
  if (!say || (!words && !tex && !art && !find && !givens?.length)) return null;
  const display = [words, tex ? `$${tex}$` : ""].filter(Boolean).join(" ");
  return extras(
    {
      narration: say.slice(0, 1800),
      display: display.slice(0, 500),
      text: words.slice(0, 280),
      math: tex.slice(0, 400),
      composed: true,
    },
    art,
    marks,
    find,
    givens,
  );
}

function finalizeBeat(beat: SolutionBeat, reclassify = false): SolutionBeat {
  const parts = reclassify ? classifyShow(beat.display) : { text: beat.text, math: beat.math };
  return extras(
    {
      narration: beat.narration.slice(0, 1800),
      display: beat.display.trim().slice(0, 500),
      text: parts.text.slice(0, 280),
      math: parts.math.slice(0, 400),
    },
    beat.art,
    beat.marks,
    beat.find,
    beat.givens,
  );
}

/** A short assignment of a number, not a derived formula. */
export function looksLikeGiven(beat: { text?: string; math?: string; givens?: string[] }): boolean {
  if (beat.givens && beat.givens.length > 0) return true;
  const line = (beat.math || beat.text || "").replace(/\\,/g, " ").trim();
  if (!line || /\\frac/.test(line)) return false;
  return /^(?:[A-Za-z][A-Za-z0-9]*|\\[A-Za-z]+)\s*=\s*[0-9]/.test(line);
}

function looksLikeFind(beat: { text?: string; find?: string }): boolean {
  if (beat.find) return true;
  return /^(find|we need|what we|ज्ञात|निकाल|क्या पूछा)/i.test((beat.text ?? "").trim());
}

/** Pinned reference and the last two working lines, for the page the student can see. */
export function lessonMemory(
  beats: SolutionBeat[],
  index: number,
): {
  find: string;
  givens: string[];
  art?: ArtCue;
  marks: MarkCue[];
  priors: SolutionBeat[];
} {
  const seen = beats.slice(0, Math.max(0, index) + 1);
  let find = "";
  const givens: string[] = [];
  const givenSeen = new Set<string>();
  let art: ArtCue | undefined;
  let marks: MarkCue[] = [];
  for (const beat of seen) {
    if (beat.find) find = beat.find;
    else if (!find && looksLikeFind(beat) && (beat.math || beat.text)) {
      find = (beat.math || beat.text).slice(0, 80);
    }
    const added = beat.givens?.length
      ? beat.givens
      : looksLikeGiven(beat)
        ? [beat.math || beat.text]
        : [];
    for (const given of added) {
      const key = given.replace(/\s+/g, " ").trim();
      if (!key || givenSeen.has(key) || givenSeen.size >= 5) continue;
      givenSeen.add(key);
      givens.push(key);
    }
    if (beat.art) {
      art = beat.art;
      marks = beat.marks ?? [];
    }
  }
  const priors = seen
    .slice(0, -1)
    .filter((beat) => !looksLikeGiven(beat) && !looksLikeFind(beat) && (beat.text || beat.math))
    .slice(-2);
  return { find, givens, art, marks, priors };
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

function shareSentences(sentences: string[], buckets: number): string[] {
  if (buckets <= 1) return [sentences.join(" ")];
  if (sentences.length < buckets) {
    return Array.from({ length: buckets }, (_, index) => sentences[index] ?? "");
  }
  const groups: string[] = [];
  const size = sentences.length / buckets;
  for (let index = 0; index < buckets; index += 1) {
    const start = Math.round(index * size);
    const end = Math.round((index + 1) * size);
    groups.push(sentences.slice(start, end).join(" ").trim());
  }
  return groups;
}

function splitFacts(line: string): string[] {
  const parts = line
    .split(/,\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 8) return [line];
  if (parts.some((part) => part.length > 80)) return [line];
  const factual = parts.filter((part) => /=|≈/.test(part) || /\d/.test(part));
  if (factual.length === parts.length) return parts;
  return [line];
}

/** One phrase or one equation per beat, so a packed legacy line does not dump at once. */
export function boardChunks(display: string): string[] {
  const chunks: string[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let last = 0;
  const pushText = (text: string) => {
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      chunks.push(...splitFacts(trimmed));
    }
  };
  for (const match of display.matchAll(pattern)) {
    pushText(display.slice(last, match.index));
    const tex = (match[1] ?? match[2] ?? "").trim();
    if (tex) chunks.push(match[1] != null ? `$$${tex}$$` : `$${tex}$`);
    last = (match.index ?? 0) + match[0].length;
  }
  pushText(display.slice(last));
  return chunks.length > 0 ? chunks : [display.trim()];
}

function expandBeat(beat: SolutionBeat): SolutionBeat[] {
  if (beat.composed || beat.art) return [finalizeBeat(beat)];
  const chunks = boardChunks(beat.display);
  if (chunks.length <= 1) return [finalizeBeat(beat)];
  const groups = shareSentences(splitSentences(beat.narration), chunks.length);
  return chunks.map((display, index) =>
    finalizeBeat(
      {
        narration: groups[index] || narrationWithoutLatex(display),
        display,
        text: "",
        math: "",
      },
      true,
    ),
  );
}

function beatFromPart(part: string): SolutionBeat | null {
  const say = field(part, "Say");
  const art = readArt(part);
  const marks = readMarks(part);
  const find = blank(field(part, "Find")) ? "" : field(part, "Find");
  const givens = readGivens(part);
  const text = field(part, "Text");
  const math = field(part, "Math");
  if (text || math || art || find || givens.length) {
    return sceneBeat(say, text, math, art, marks, find, givens);
  }
  return looseBeat(say, field(part, "Show"), art, marks, find, givens);
}

function beatsFromMarkers(text: string): SolutionBeat[] {
  const parts = text.split(/^\s*BEAT\s*$/gim);
  const beats: SolutionBeat[] = [];
  for (const part of parts) {
    const beat = beatFromPart(part);
    if (beat) beats.push(beat);
  }
  return beats;
}

function beatsFromJson(text: string): SolutionBeat[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { beats?: unknown };
    if (!Array.isArray(parsed.beats)) return [];
    const beats: SolutionBeat[] = [];
    for (const item of parsed.beats) {
      if (!item || typeof item !== "object") continue;
      const record = item as {
        narration?: unknown;
        say?: unknown;
        display?: unknown;
        show?: unknown;
        text?: unknown;
        math?: unknown;
        art?: unknown;
        draw?: unknown;
        find?: unknown;
        given?: unknown;
        givens?: unknown;
        marks?: unknown;
      };
      const say =
        typeof record.narration === "string"
          ? record.narration
          : typeof record.say === "string"
            ? record.say
            : "";
      const artPrompt =
        typeof record.art === "string"
          ? record.art
          : typeof record.draw === "string"
            ? record.draw
            : "";
      const art = artPrompt && !blank(artPrompt) ? readArt(`Art: ${artPrompt}`) : undefined;
      const find = typeof record.find === "string" ? record.find : "";
      const givens = Array.isArray(record.givens)
        ? record.givens.filter((item): item is string => typeof item === "string")
        : typeof record.given === "string"
          ? [record.given]
          : [];
      const marks = Array.isArray(record.marks)
        ? record.marks.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const mark = item as { part?: unknown; symbol?: unknown };
            if (typeof mark.part !== "string") return [];
            return [{ part: mark.part, symbol: typeof mark.symbol === "string" ? mark.symbol : "" }];
          })
        : [];
      if (typeof record.text === "string" || typeof record.math === "string" || art || find || givens.length) {
        const beat = sceneBeat(
          say,
          typeof record.text === "string" ? record.text : "",
          typeof record.math === "string" ? record.math : "",
          art,
          marks,
          find,
          givens,
        );
        if (beat) beats.push(beat);
        continue;
      }
      const show =
        typeof record.display === "string"
          ? record.display
          : typeof record.show === "string"
            ? record.show
            : "";
      const beat = looseBeat(say, show, art);
      if (beat) beats.push(beat);
    }
    return beats;
  } catch {
    return [];
  }
}

function capBeats(beats: SolutionBeat[]): SolutionBeat[] {
  if (beats.length <= SOLUTION_VIDEO_BEAT_LIMIT) return beats;
  return [...beats.slice(0, SOLUTION_VIDEO_BEAT_LIMIT - 1), beats[beats.length - 1]];
}

/** Reads the model script as ordered scenes. */
export function parseSolutionBeats(raw: string): SolutionBeat[] {
  const text = stripFence(visibleReply(raw));
  const marked = beatsFromMarkers(text);
  const beats = (marked.length > 0 ? marked : beatsFromJson(text)).flatMap(expandBeat);
  return capBeats(beats);
}

/** Removes TeX from a spoken line so the voice does not read backslashes. */
export function narrationWithoutLatex(narration: string): string {
  const plain = (tex: string) =>
    tex
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/[{}_^$\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return narration
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, tex: string) => ` ${plain(tex)} `)
    .replace(/\$([^$\n]+)\$/g, (_match, tex: string) => ` ${plain(tex)} `)
    .replace(/\s+/g, " ")
    .trim();
}

export function slideDurations(
  audioSeconds: number[],
  gapSeconds = SOLUTION_VIDEO_BEAT_GAP_SECONDS,
  endGapSeconds = SOLUTION_VIDEO_END_GAP_SECONDS,
): number[] {
  return audioSeconds.map((seconds, index) => {
    const hold = index === audioSeconds.length - 1 ? endGapSeconds : gapSeconds;
    return Math.max(0.4, seconds) + hold;
  });
}
