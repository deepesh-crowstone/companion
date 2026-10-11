import { visibleReply } from "./reply-client.js";

export const BOARD_LIMIT = 8;
export const BOARD_LINE_LIMIT = 5;

export type BoardStep = {
  /** What Alakh Sir says during this step. */
  narration: string;
  /** Index into the board's lines written during this step, or null while the board is only looked at. */
  line: number | null;
};

export type LessonBoard = {
  /** The picture on the left, with its labels. Empty when the board is writing only. */
  diagram: string;
  /** Lines written on the right, in order. Equations are LaTeX inside $...$. */
  lines: string[];
  steps: BoardStep[];
};

export const BOARD_SCRIPT_PROMPT = `Write the explanation first, then cut it into boards. Output only this shape.

EXPLAIN
the full spoken explanation

BOARD
Diagram: the picture on the left of this board, or -
Say: what he says while the student looks at the picture
Line: one line he writes on the board
Say: what he says while that line is written
Line: the next line
Say: what he says while it is written

EXPLAIN is the lesson a student hears. Each Say is a contiguous piece of that explanation, in order, not a new essay.

A board is one whiteboard slide. An image model draws the whole board, the diagram and every line, so describe exactly what must appear.

Diagram:
- Draw on almost every board: the setup, the object, the field, the ray, the circuit, the forces, the motion, the graph, or a comparison. Diagram: - only when nothing at all can be drawn.
- Each board is drawn alone, by a model that never sees the other boards. Describe the whole picture every time. Never write "same as before" or "same setup".
- Describe a physically correct picture in two or three sentences. Put things where the numbers put them: "object 30 cm left of the lens, between F (20 cm) and 2F (40 cm); image 60 cm right of the lens, beyond 2F, inverted and twice as tall".
- Name every label and what it marks, for example "l is an arrow along the length of the strip", "B shown as crosses, into the page".
- A label is plain text: a symbol like u, F, 2F, B, or one or two English words. No dollar signs, no equations, no sentences in the diagram.

Line:
- One to five lines per board. Each line is short: a phrase of at most six words, or one equation.
- An equation is LaTeX inside $...$, copied exactly from the solution, in the solution's order. Never re-derive, rearrange, or add a step the solution does not have. Do not invent a result.
- Hindi words in Devanagari, English words and numbers in Latin. If the solution is English, every line is English.
- A Line is what a student copies in a notebook. Never copy Say into Line.

Say:
- Each Line is followed by exactly one Say that explains it. A Say before the first Line introduces the picture.
- Hindi words in Devanagari. Never Roman Hindi. English words and numbers stay Latin.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.

Open by teaching the problem, then the question, then the givens, then the working, then the result. Go slowly. A full numerical is several boards. At most eight boards.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function blank(value: string): boolean {
  return value === "" || value === "-" || /^none$/i.test(value);
}

type Entry = { key: "diagram" | "say" | "line"; value: string };

function entriesOf(part: string): Entry[] {
  const entries: Entry[] = [];
  for (const raw of part.split("\n")) {
    const match = raw.match(/^\s*(Diagram|Say|Line):\s*(.*)$/i);
    if (match) {
      entries.push({
        key: (match[1] ?? "").toLowerCase() as Entry["key"],
        value: (match[2] ?? "").trim(),
      });
      continue;
    }
    const last = entries[entries.length - 1];
    if (last && raw.trim()) last.value = `${last.value} ${raw.trim()}`.trim();
  }
  return entries.map((entry) => ({ ...entry, value: entry.value.replace(/\s+/g, " ").trim() }));
}

function boardFromPart(part: string): LessonBoard | null {
  let diagram = "";
  const lines: string[] = [];
  const steps: BoardStep[] = [];
  let pending: string | null = null;
  for (const entry of entriesOf(part)) {
    if (entry.key === "diagram") {
      if (!blank(entry.value)) diagram = entry.value.slice(0, 400);
      continue;
    }
    if (entry.key === "line") {
      pending = blank(entry.value) ? null : entry.value.slice(0, 160);
      continue;
    }
    if (!entry.value) continue;
    const narration = entry.value.slice(0, 1200);
    if (pending && lines.length < BOARD_LINE_LIMIT) {
      lines.push(pending);
      steps.push({ narration, line: lines.length - 1 });
    } else {
      steps.push({ narration, line: null });
    }
    pending = null;
  }
  if (steps.length === 0 || (lines.length === 0 && !diagram)) return null;
  return { diagram, lines, steps };
}

/** The talk comes first. Boards are cuts of that talk; each line is written while it is explained. */
export function parseBoardScript(raw: string): { explain: string; boards: LessonBoard[] } {
  const text = stripFence(visibleReply(raw));
  const parts = text.split(/^\s*BOARD\s*$/gim);
  const explain = (parts[0] ?? "").replace(/^\s*EXPLAIN\s*/i, "").trim();
  const boards = parts.slice(1).flatMap((part) => {
    const board = boardFromPart(part);
    return board ? [board] : [];
  });
  if (boards.length <= BOARD_LIMIT) return { explain, boards };
  return { explain, boards: [...boards.slice(0, BOARD_LIMIT - 1), boards[boards.length - 1]] };
}
