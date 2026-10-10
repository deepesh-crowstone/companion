import { visibleReply } from "./reply-client.js";

export const SOLUTION_VIDEO_BEAT_LIMIT = 7;
export const SOLUTION_VIDEO_BEAT_GAP_SECONDS = 0.45;
export const SOLUTION_VIDEO_END_GAP_SECONDS = 1.2;

export type SolutionBeat = {
  /** What Alakh Sir says while this step is on screen. */
  narration: string;
  /** The new board content revealed on this step. */
  display: string;
};

export const SOLUTION_VIDEO_SCRIPT_PROMPT = `Split this written solution into a board video. Output only beats.

BEAT
Say: spoken line
Show: board line

Rules:
- Use 4 to 7 beats, in this order: given data, the idea, each calculation, the final answer.
- Say is what Alakh Sir speaks during that beat. One to three sentences, under 320 characters.
- Hindi words in Say must be Devanagari. Never write Roman Hindi. English words and numbers stay Latin.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.
- Show is only the new line for that beat, copied from the solution. Do not repeat earlier beats and do not invent a new equation.
- Show is Latin text plus LaTeX. Use $...$ for a short formula and $$...$$ for one main equation.
- Do not use \\boxed, \\ce, or \\tag.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function cleanBeat(narration: string, display: string): SolutionBeat | null {
  const say = narration.replace(/\s+/g, " ").trim().slice(0, 500);
  const show = display.trim().slice(0, 800);
  if (!say || !show) return null;
  return { narration: say, display: show };
}

function beatsFromMarkers(text: string): SolutionBeat[] {
  const parts = text.split(/^\s*BEAT\s*$/gim);
  const beats: SolutionBeat[] = [];
  for (const part of parts) {
    const say = part.match(/Say:\s*([\s\S]*?)(?=\nShow:|$)/i);
    const show = part.match(/Show:\s*([\s\S]*)$/i);
    const beat = cleanBeat(say?.[1] ?? "", show?.[1] ?? "");
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
      const beat = cleanBeat(
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

/** Reads the model script as ordered board steps. */
export function parseSolutionBeats(raw: string): SolutionBeat[] {
  const text = stripFence(visibleReply(raw));
  const marked = beatsFromMarkers(text);
  return capBeats(marked.length > 0 ? marked : beatsFromJson(text));
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
