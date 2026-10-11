import { visibleReply } from "./reply-client.js";

export const SOLUTION_VIDEO_BEAT_LIMIT = 40;
export const SOLUTION_VIDEO_BEAT_GAP_SECONDS = 0.45;
export const SOLUTION_VIDEO_END_GAP_SECONDS = 1.2;

export type ArtCue = {
  /** Stable name so the same picture is generated once and then reused. */
  id: string;
  /** What to draw. Labels only; equations and sentences stay out of the picture. */
  prompt: string;
};

export type SolutionBeat = {
  /** What Alakh Sir says while this scene is on screen. */
  narration: string;
  /** Words and equation joined, for logs and older callers. */
  display: string;
  /** Short explanation written to fit the space beside or under the picture. */
  text: string;
  /** One formula, without dollar signs. Empty when this scene has no equation. */
  math: string;
  /** One picture. Where it sits is decided by the layout, not by the script. */
  art?: ArtCue;
  /** True when Text and Math were written as one scene, so they are not split apart. */
  composed?: boolean;
};

export const SOLUTION_VIDEO_SCRIPT_PROMPT = `Write a clear explanation video of this solution. Output only beats. Each beat is one finished scene, not a scrolling list.

BEAT
Say: spoken explanation
Text: words on the white canvas
Math: one equation, or -
Art: one picture, or -

The video decides where the picture sits, and Text must be written for that space:
- Art names one object: the picture goes on the left, Text and Math on the right. Text is at most 14 words.
- Art starts with the word Diagram: the picture is a wide setup, graph, ray, or circuit across the top, and Text sits underneath. Text is at most 16 words.
- Art is -: there is no picture. Text and Math are alone on the canvas. Text is at most 18 words. Math is the main thing on screen.
- Math is one equation copied from the solution, written as $...$. Never put an equation in Art or in Text.
- Art may include a label of one or two English words. No sentences, no Hindi, and no equations inside the picture.
- Pure algebra has Art: -. Do not invent a new result.

Open by teaching the problem, before any solving:
- First beat: what the situation is, in plain speech. Text is a short title. Art may show the physical setup. No equation.
- Next beats: what it is asking. Name the quantity to find and what kind of answer is expected. Text states that question in one short line.
- Next beats: the given data, one given per beat. Math shows that single value. Text says what the number means.
- Only after the problem is clear, start the solution.

Then one new idea per beat:
- Say explains only this scene: why this step, what each symbol means, and how the number came. Do not preview the next line.
- Explain the idea in words before the formula, and again after it, so a student hearing it for the first time can follow.
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

function field(part: string, name: string): string {
  const match = part.match(
    new RegExp(
      `^${name}:\\s*([\\s\\S]*?)(?=\\n(?:Say|Show|Text|Math|Art|Draw|At):|(?![\\s\\S]))`,
      "im",
    ),
  );
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
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

function looseBeat(narration: string, display: string, art?: ArtCue): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim();
  const show = display.trim();
  const parts = classifyShow(show);
  if (!say || (!parts.text && !parts.math && !art)) return null;
  const beat: SolutionBeat = {
    narration: say,
    display: show.slice(0, 500),
    text: parts.text.slice(0, 280),
    math: parts.math.slice(0, 400),
  };
  if (art) beat.art = art;
  return beat;
}

function sceneBeat(
  narration: string,
  text: string,
  math: string,
  art?: ArtCue,
): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim();
  const words = blank(text) ? "" : text.trim();
  const tex = stripDollars(math);
  if (!say || (!words && !tex && !art)) return null;
  const display = [words, tex ? `$${tex}$` : ""].filter(Boolean).join(" ");
  const beat: SolutionBeat = {
    narration: say.slice(0, 1800),
    display: display.slice(0, 500),
    text: words.slice(0, 280),
    math: tex.slice(0, 400),
  };
  if (art) beat.art = art;
  beat.composed = true;
  return beat;
}

function finalizeBeat(beat: SolutionBeat, reclassify = false): SolutionBeat {
  const parts = reclassify ? classifyShow(beat.display) : { text: beat.text, math: beat.math };
  const next: SolutionBeat = {
    narration: beat.narration.slice(0, 1800),
    display: beat.display.trim().slice(0, 500),
    text: parts.text.slice(0, 280),
    math: parts.math.slice(0, 400),
  };
  if (beat.art) next.art = beat.art;
  return next;
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
  const text = field(part, "Text");
  const math = field(part, "Math");
  if (text || math || art) return sceneBeat(say, text, math, art);
  return looseBeat(say, field(part, "Show"), art);
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
      if (typeof record.text === "string" || typeof record.math === "string" || art) {
        const beat = sceneBeat(
          say,
          typeof record.text === "string" ? record.text : "",
          typeof record.math === "string" ? record.math : "",
          art,
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
