import { visibleReply } from "./reply-client.js";

export const SLIDE_LIMIT = 8;

export type SlidePlate = {
  id: string;
  prompt: string;
};

export type LessonSlide = {
  /** The spoken excerpt for this slide. */
  narration: string;
  /** Claim lines, in the order they are written into the well. */
  writes: string[];
  /** Joined claim, for logs. */
  text: string;
  /** One formula, without dollar signs. */
  math: string;
  /** The still object on the plate. Absent when this slide is writing only. */
  plate?: SlidePlate;
};

export const SLIDE_SCRIPT_PROMPT = `Write the explanation first, then cut it into slides. Output only this shape.

EXPLAIN
the full spoken explanation

SLIDE
Plate: one object, or -
Say: the excerpt of EXPLAIN for this slide
Write: the claim
Math: one equation, or -

EXPLAIN is the lesson a student hears. Each Say is a contiguous piece of that explanation, in order, not a new essay. Write is the claim a mute student can read. Never transcribe Say into Write. Never put an equation in Plate or in Write.

Plate is - unless one honest object helps the student see the situation. No letters, Hindi, numbers, or equations inside the plate. No circuits, rays, graphs, or rails. Reuse the same Plate wording when the object stays. At most two different plates in the lesson. At most eight slides.

Math is one equation copied from the solution, written as $...$, or -. Do not invent a result.

Open by teaching the problem, then the question, then the givens, then the working. Go slowly. A full numerical is several slides, not one.

Say:
- Hindi words in Devanagari. Never Roman Hindi. English words and numbers stay Latin.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function blank(value: string): boolean {
  return value === "" || value === "-" || /^none$/i.test(value);
}

function field(part: string, name: string): string {
  const match = part.match(
    new RegExp(
      `^${name}:\\s*([\\s\\S]*?)(?=\\n(?:Plate|Say|Write|Math):|(?![\\s\\S]))`,
      "im",
    ),
  );
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function fields(part: string, name: string): string[] {
  const values: string[] = [];
  for (const match of part.matchAll(new RegExp(`^${name}:\\s*(.+)`, "gim"))) {
    const value = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!blank(value)) values.push(value);
  }
  return values;
}

function stripDollars(value: string): string {
  if (blank(value)) return "";
  const match = value.match(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/);
  if (match) return (match[1] ?? match[2] ?? "").trim();
  return value.trim();
}

function plateId(prompt: string): string {
  return prompt
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function slideFromPart(part: string): LessonSlide | null {
  const narration = field(part, "Say").replace(/\s+/g, " ").trim();
  const writes = fields(part, "Write").map((line) => line.slice(0, 180)).slice(0, 3);
  const math = stripDollars(field(part, "Math")).slice(0, 400);
  const platePrompt = field(part, "Plate");
  if (!narration || (writes.length === 0 && !math)) return null;
  const slide: LessonSlide = {
    narration: narration.slice(0, 1800),
    writes,
    text: writes.join(" ").slice(0, 400),
    math,
  };
  if (!blank(platePrompt)) {
    const id = plateId(platePrompt);
    if (id) slide.plate = { id, prompt: platePrompt.slice(0, 180) };
  }
  return slide;
}

/** The talk comes first. Slides are cuts of that talk, not a second essay. */
export function parseSlideScript(raw: string): { explain: string; slides: LessonSlide[] } {
  const text = stripFence(visibleReply(raw));
  const parts = text.split(/^\s*SLIDE\s*$/gim);
  const explain = (parts[0] ?? "").replace(/^\s*EXPLAIN\s*/i, "").trim();
  const slides = parts.slice(1).flatMap((part) => {
    const slide = slideFromPart(part);
    return slide ? [slide] : [];
  });
  if (slides.length <= SLIDE_LIMIT) return { explain, slides };
  return { explain, slides: [...slides.slice(0, SLIDE_LIMIT - 1), slides[slides.length - 1]] };
}
