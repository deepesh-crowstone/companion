import { visibleReply } from "./reply-client.js";

export const SOLUTION_VIDEO_BEAT_LIMIT = 40;
export const SOLUTION_VIDEO_BEAT_GAP_SECONDS = 0.45;
export const SOLUTION_VIDEO_END_GAP_SECONDS = 1.2;

export type SolutionBeat = {
  /** What Alakh Sir says while this step is on screen. */
  narration: string;
  /** The new board content revealed on this step. */
  display: string;
};

export const SOLUTION_VIDEO_SCRIPT_PROMPT = `Write a long, detailed board video of this solution. Output only beats.

BEAT
Say: spoken explanation
Show: one board item

Open by teaching the problem, before any solving:
- First beat: acknowledge the problem. Say what the situation is, in plain speech. Show a short title of that situation, with no equation.
- Next beats: what it is asking. Name the quantity to find and what kind of answer is expected. Show that question in one short line.
- Next beats: the given data, one given per beat. Show that single value. Explain what the number means and which symbol it will be.
- Only after the problem is clear, start the solution.

Then solve in small steps:
- One new board item per beat. One short phrase, or one equation. Never both. Never two equations in one Show.
- The new line appears, and Say explains only that line: why this step, what each symbol means, and how the number came. Do not preview the next line.
- Explain the idea in words before the formula, and again after it, so a student hearing it for the first time can follow.
- Each Say is at least three sentences, usually four to six. Go slowly. A bigger problem needs more beats and a longer explanation.
- Use as many beats as the working needs. A short idea is about 8 beats. A full numerical is 12 to 20. Do not compress several steps into one beat.

Show:
- One line only. At most one $...$ or one $$...$$.
- Copy equations from the solution. Do not invent a new result.
- Latin text and LaTeX. Do not use \\boxed, \\ce, or \\tag.

Say:
- Hindi words in Devanagari. Never Roman Hindi. English words and numbers stay Latin.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function looseBeat(narration: string, display: string): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim();
  const show = display.trim();
  if (!say || !show) return null;
  return { narration: say, display: show };
}

function finalizeBeat(beat: SolutionBeat): SolutionBeat {
  return {
    narration: beat.narration.slice(0, 1800),
    display: beat.display.trim().slice(0, 500),
  };
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

/** One phrase or one equation per beat, so the board never dumps a whole step at once. */
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
  const chunks = boardChunks(beat.display);
  if (chunks.length <= 1) return [finalizeBeat(beat)];
  const groups = shareSentences(splitSentences(beat.narration), chunks.length);
  return chunks.map((display, index) =>
    finalizeBeat({
      display,
      narration: groups[index] || narrationWithoutLatex(display),
    }),
  );
}

function beatsFromMarkers(text: string): SolutionBeat[] {
  const parts = text.split(/^\s*BEAT\s*$/gim);
  const beats: SolutionBeat[] = [];
  for (const part of parts) {
    const say = part.match(/Say:\s*([\s\S]*?)(?=\nShow:|$)/i);
    const show = part.match(/Show:\s*([\s\S]*)$/i);
    const beat = looseBeat(say?.[1] ?? "", show?.[1] ?? "");
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
      const record = item as { narration?: unknown; say?: unknown; display?: unknown; show?: unknown };
      const beat = looseBeat(
        typeof record.narration === "string"
          ? record.narration
          : typeof record.say === "string"
            ? record.say
            : "",
        typeof record.display === "string"
          ? record.display
          : typeof record.show === "string"
            ? record.show
            : "",
      );
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

/** Reads the model script as ordered board steps, one new line at a time. */
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
