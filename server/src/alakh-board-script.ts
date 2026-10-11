import { visibleReply } from "./reply-client.js";

export const BOARD_LIMIT = 10;
export const BOARD_LINE_LIMIT = 5;

/** Something pointed at while he speaks: a written line, or a label in the picture. */
export type BoardMark =
  | { kind: "underline" | "box"; line: number }
  | { kind: "circle"; label: string };

export type BoardStep = {
  /** What Alakh Sir says during this step. */
  narration: string;
  /** Index into the board's lines written during this step, or null while the board is only looked at. */
  line: number | null;
  mark?: BoardMark;
};

export type LessonBoard = {
  /** Two to four words at the top of the board. */
  title: string;
  /** The picture on the left, with its labels. Empty when the board is writing only. */
  diagram: string;
  /** Lines written on the right, in order. Equations are LaTeX inside $...$. */
  lines: string[];
  steps: BoardStep[];
};

export const BOARD_SCRIPT_PROMPT = `You are Alakh Sir, a warm, lively teacher, recording a whiteboard lesson for one student who got stuck on this question. Write everything you would say to them, then cut it into boards. Output only this shape.

EXPLAIN
the full spoken explanation

BOARD
Title: two to four words
Picture: what to draw on the left of this board, or same, or -
Say: what he says while the picture is drawn
Line: one line he writes on the board
Say: what he says while that line is written
Show: circle F
Say: what he says while F is circled in the picture
Line: the next line
Show: box 2
Say: what he says while line 2 is written and boxed

EXPLAIN is the whole lesson, spoken to one student sitting in front of you. It is much richer than the written solution: it says why, not only what. Each Say is a contiguous piece of that explanation, in order, not a new essay.

How he teaches:
- Open by making the student curious. Say what is really going on in the situation, in everyday words, before any formula.
- Before each step, say why this step and not another. For example: "Ab sawaal ye hai, v nikalein kaise? Humare paas f bhi hai aur u bhi, toh lens formula ekdum fit baithta hai."
- Give each formula a meaning: what it tells us physically, not only its symbols.
- When an idea is abstract, use one familiar picture: a bus, a cricket ball, a phone, a classroom. Then come back to the real principle.
- Ask a question out loud and answer it, the way a teacher keeps a student thinking.
- Name the mistake students usually make here, at the step where it happens: a sign, a unit, the wrong formula, a skipped condition.
- After the answer, check that it makes sense: is the size, the sign, or the direction what we would expect?
- In the recap, leave the one idea to remember for the exam, and ask warmly whether it made sense.
- Speak to one student. In Hindi: tum, and beta or baccha now and then inside a sentence. In English: warm and direct, with no Hindi words.
- Energy rises on the key idea and settles while working carefully. No hype, no slogans, no motivation speech.

The lesson is filmed like a good teacher's video. The picture is drawn by an image model; the title and every line are written by hand while he speaks. Something new appears with every Say: the picture being drawn, a line being written, or a Show. Never two Says in a row with nothing new on the board.

Order of boards:
1. Title "Question": the picture of the situation, and one or two lines saying what is asked.
2. Title "Given": each given value on its own line, for example "$u = -30$ cm". Circle each value's label in the picture as it is named.
3. Working: one idea per board, titled by the idea, for example "Lens formula", "Lower bound".
4. Title "Answer": the final result as one line, with Show: box 1.
5. Title "Recap": two or three lines, the key formula and the result, copied from the earlier boards.
If the solution is in Hindi, titles are in Hindi too, in Devanagari.
The board speaks the way students speak. Academic words stay English in Latin, even in a Hindi lesson: image, magnification, focal length, lens formula, current, velocity. Never textbook Hindi like प्रतिबिंब or आवर्धन.

Picture:
- Use pictures as much as possible: the setup, the object, the rays, the forces, the circuit, the field, the motion, a graph, a Venn diagram, a number line. Picture: - only when nothing at all can be drawn.
- Picture: same keeps the previous board's picture exactly. Use same while the setup does not change, so the lesson stays consistent.
- A new picture is described in full in two or three sentences, physically correct. Put things in the right order and proportion: "object O left of the lens, between F and 2F".
- Name every label and what it marks, for example "l is an arrow along the length of the strip", "B shown as crosses, into the page".
- A label names a thing: a symbol like O, I, F, 2F, A, B, or one or two English words. Never label a distance or a measurement in the picture; the lines carry the numbers. A percentage or count inside a region of a Venn diagram is fine. No dollar signs, no equations, no sentences.
- A picture shows only what is known by that board. The picture on the question and given boards never shows the answer.

Line:
- One to five lines per board. Each line is short: a phrase of at most six words, or one equation.
- An equation is LaTeX inside $...$, copied exactly from the solution, in the solution's order. Never re-derive, rearrange, or add a step the solution does not have. Do not invent a result.
- Hindi words in Devanagari, English words and numbers in Latin. If the solution is English, every line is English.
- A Line is what a student copies in a notebook. Never copy Say into Line.

Show (optional, right before its Say, after the Line when both are given):
- underline n: underlines line n of this board while he refers back to it, for example a value about to be used.
- box n: boxes line n of this board. Use it for the final answer and for a key result.
- circle X: circles the label X in this board's picture while he names it. X is a label exactly as the picture names it.

Say:
- Two to four natural spoken sentences. A Say never just reads its Line aloud: it explains what the line means, why it is written, or what to watch out for.
- Each Line is followed by exactly one Say that explains it. A Say before the first Line introduces the picture.
- Every number in a Say matches the solution, written in digits.
- He talks about the physics, never about making the video: no "picture same", nothing about keeping or redrawing a picture.
- Hindi words in Devanagari. Never Roman Hindi. English words and numbers stay Latin. Academic words stay English, as on the board.
- If the solution is English, Say is English and contains no Hindi.
- Do not put LaTeX in Say. Speak the mathematics in words.

Go slowly and teach fully. A full numerical is several boards. At most ten boards.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function blank(value: string): boolean {
  return value === "" || value === "-" || /^none$/i.test(value);
}

type Entry = { key: "title" | "diagram" | "say" | "line" | "show"; value: string };

function entriesOf(part: string): Entry[] {
  const entries: Entry[] = [];
  for (const raw of part.split("\n")) {
    const match = raw.match(/^\s*(Title|Picture|Diagram|Say|Line|Show):\s*(.*)$/i);
    if (match) {
      const key = (match[1] ?? "").toLowerCase();
      entries.push({
        key: (key === "picture" ? "diagram" : key) as Entry["key"],
        value: (match[2] ?? "").trim(),
      });
      continue;
    }
    const last = entries[entries.length - 1];
    if (last && raw.trim()) last.value = `${last.value} ${raw.trim()}`.trim();
  }
  return entries.map((entry) => ({ ...entry, value: entry.value.replace(/\s+/g, " ").trim() }));
}

/** A Show cue. A line number is 1-based; a bare box or underline means the line just written. */
export function parseMark(value: string, written: number | null): BoardMark | null {
  const match = value.trim().match(/^(underline|box|circle)\b\s*(.*)$/i);
  if (!match) return null;
  const kind = (match[1] ?? "").toLowerCase() as BoardMark["kind"];
  const target = (match[2] ?? "").replace(/^(?:line|label)\s+/i, "").replace(/[$"'`*]/g, "").trim();
  if (kind === "circle") {
    return target && target.length <= 24 ? { kind, label: target } : null;
  }
  const number = Number(target.match(/^\d+/)?.[0]);
  if (Number.isInteger(number) && number > 0) return { kind, line: number - 1 };
  return written === null ? null : { kind, line: written };
}

/** A mark points at a line already on the board, or at a label of a board that has a picture. */
function markFits(mark: BoardMark, writtenSoFar: number, hasPicture: boolean): boolean {
  if (mark.kind === "circle") return hasPicture;
  return mark.line >= 0 && mark.line < writtenSoFar;
}

const SAME_PICTURE =
  /^same(?:\s+(?:as\s+(?:before|above|the\s+previous(?:\s+board)?|previous(?:\s+board)?)|picture|setup|diagram))?\.?$/i;

function boardFromPart(part: string, previousDiagram: string): LessonBoard | null {
  let title = "";
  let diagram = "";
  const lines: string[] = [];
  const steps: BoardStep[] = [];
  let pending: string | null = null;
  let show: string | null = null;
  for (const entry of entriesOf(part)) {
    if (entry.key === "title") {
      if (!blank(entry.value)) title = entry.value.replace(/[$*#]/g, "").slice(0, 40);
      continue;
    }
    if (entry.key === "diagram") {
      if (SAME_PICTURE.test(entry.value)) diagram = previousDiagram;
      else if (!blank(entry.value)) diagram = entry.value.slice(0, 400);
      continue;
    }
    if (entry.key === "line") {
      pending = blank(entry.value) ? null : entry.value.slice(0, 160);
      continue;
    }
    if (entry.key === "show") {
      show = blank(entry.value) ? null : entry.value;
      continue;
    }
    if (!entry.value) continue;
    const narration = entry.value.slice(0, 1200);
    let step: BoardStep;
    if (pending && lines.length < BOARD_LINE_LIMIT) {
      lines.push(pending);
      step = { narration, line: lines.length - 1 };
    } else {
      step = { narration, line: null };
    }
    const mark = show ? parseMark(show, step.line ?? (lines.length ? lines.length - 1 : null)) : null;
    if (mark && markFits(mark, lines.length, Boolean(diagram))) step.mark = mark;
    steps.push(step);
    pending = null;
    show = null;
  }
  if (steps.length === 0 || (lines.length === 0 && !diagram)) return null;
  return { title, diagram, lines, steps };
}

const UNICODE_MATH: Record<string, string> = {
  "θ": "\\theta",
  "α": "\\alpha",
  "β": "\\beta",
  "γ": "\\gamma",
  "δ": "\\delta",
  "Δ": "\\Delta",
  "λ": "\\lambda",
  "μ": "\\mu",
  "π": "\\pi",
  "ρ": "\\rho",
  "σ": "\\sigma",
  "τ": "\\tau",
  "φ": "\\phi",
  "ω": "\\omega",
  "Ω": "\\Omega",
  "×": "\\times",
  "·": "\\cdot",
  "÷": "/",
  "°": "^\\circ",
  "²": "^2",
  "³": "^3",
  "√": "\\sqrt",
  "≈": "\\approx",
  "→": "\\rightarrow",
};

/** Spacing, wrappers, and \frac become the same plain string the solution can be searched for. */
export function normalizeMath(value: string): string {
  let text = value
    .replace(/<=|\\leqslant|\\leq|\\le(?![A-Za-z])/g, "≤")
    .replace(/>=|\\geqslant|\\geq|\\ge(?![A-Za-z])/g, "≥")
    .replace(/\\cap(?![A-Za-z])|\bintersect(?:ion)?\b/gi, "∩")
    .replace(/\\cup(?![A-Za-z])|\bunion\b/gi, "∪")
    .replace(/([A-Za-z)])\s+U\s+(?=[A-Za-z(])/g, "$1∪")
    .replace(/\\%|%/g, "");
  text = text.replace(/[θαβγδΔλμπρστφωΩ×·÷°²³√≈→]/g, (char) => UNICODE_MATH[char] ?? char);
  text = text.replace(/\\left|\\right/g, "");
  text = text.replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, "$1");
  for (let guard = 0; guard < 20 && text.includes("\\frac"); guard += 1) {
    const next = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_match, numerator: string, denominator: string) => {
      const wrap = (part: string) => (/[+\-=]/.test(part) ? `(${part})` : part);
      return `${wrap(numerator)}/${wrap(denominator)}`;
    });
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/\^\{([^{}]*)\}/g, "^$1")
    .replace(/_\{([^{}]*)\}/g, "_$1")
    .replace(/[{}]/g, "")
    .replace(/\\[,;!: ]/g, "")
    .replace(/\\/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/−/g, "-")
    .replace(/\((-?\d+(?:\.\d+)?)\)/g, "$1")
    .toLowerCase();
}

function mathChunks(solution: string): string[] {
  const chunks: string[] = [];
  for (const match of solution.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g)) {
    chunks.push(normalizeMath(match[1] ?? match[2] ?? ""));
  }
  for (const line of solution.split(/\n+/)) chunks.push(normalizeMath(line));
  return chunks.filter((chunk) => chunk.length > 0);
}

function mathSpan(text: string): string {
  const marks = [...text.matchAll(/[0-9A-Za-z\\^_.=+\-*/()θαβγδΔλμπρστφωΩ×·÷°²³√≈→]/g)];
  const first = marks[0];
  const last = marks[marks.length - 1];
  if (!first || !last || first.index === undefined || last.index === undefined) return "";
  return text.slice(first.index, last.index + last[0].length);
}

function splitClauses(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "(" || char === "{") depth += 1;
    else if (char === ")" || char === "}") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(body.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.includes("="));
}

/** An equals sign that is not part of <=, >= or != */
const EQUALS = /(?<![<>!])=/;

/** Equations on one board line. A Hindi sentence or an inequality is not an equation. */
export function lineEquations(line: string): string[] {
  const wrapped = [...line.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g)]
    .map((match) => (match[1] ?? match[2] ?? "").trim())
    .filter((value) => EQUALS.test(value) || value.includes("\\frac"));
  if (wrapped.length > 0) return wrapped;
  if (!EQUALS.test(line)) return [];
  const colon = line.indexOf(":");
  const body = colon >= 0 && !line.slice(0, colon).includes("=") ? line.slice(colon + 1) : line;
  return splitClauses(body)
    .map((clause) => mathSpan(clause))
    .filter((clause) => EQUALS.test(clause));
}

/** Every side of the equation is a whole side of one solution equation, in the same order. */
function equationAppears(equation: string, solution: string): boolean {
  const norm = normalizeMath(equation);
  if (norm.length < 3 || !norm.includes("=")) return true;
  const sides = norm.split("=");
  return mathChunks(solution).some((chunk) => {
    const chain = chunk.split("=");
    let at = 0;
    for (const side of sides) {
      while (at < chain.length && chain[at] !== side) at += 1;
      if (at === chain.length) return false;
      at += 1;
    }
    return true;
  });
}

function numbersOf(value: string): string[] {
  return [...value.matchAll(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g)].map((match) => match[0]);
}

/**
 * Equations and numbers on these lines that the solution never wrote, as text.
 * A hint for the script review only: a different notation of a right step can land here.
 */
export function equationsNotInSolution(lines: string[], solution: string): string[] {
  const invented: string[] = [];
  const present = new Set(numbersOf(solution));
  for (const line of lines) {
    for (const equation of lineEquations(line)) {
      if (!equationAppears(equation, solution)) invented.push(equation);
    }
    for (const number of numbersOf(line)) {
      if (!present.has(number)) invented.push(number);
    }
  }
  return invented;
}

export const SCRIPT_REVIEW_PROMPT = `You check a whiteboard lesson script against the worked solution it teaches. Every board is drawn and spoken exactly as written, so a wrong value here is taught to the student.

If every line is right and the boards cover the solution's working and its result, output only: OK

Otherwise output only changes, one block each:

FIX b.l
Line: the corrected line
Say: what he says while it is written

DROP b.l

ADD b.l
Line: the new line
Say: what he says while it is written

b is the board number and l the line number, as listed. ADD b.l puts the new line after line l of board b. ADD b.0 puts it first on that board.

Rules:
- Change a line only when it is wrong: a value, sign, symbol, unit or equation that disagrees with the solution, or a result the solution does not reach.
- A different notation of the same thing is right: 63 and 63%, <= and \\leq and ≤, ∩ and intersect, a fraction written inline or with \\frac.
- Add a line only when a step of the solution's working, or its final result, is on no board. Put it where it belongs in the order of the working.
- A line is a phrase of at most six words, or one equation in LaTeX inside $...$, copied from the solution.
- A Say that states a wrong number or result is fixed with FIX on its line. Keep the line as it is when the line is right.
- Keep each Say's language: Hindi words in Devanagari, an English lesson stays English. No LaTeX in Say.
- Every number in a Say is written in digits, exactly as in the solution, for example 39. Never spell a number as a word.
- Do not restyle, reword, or reorder lines that are right.`;

/** The solution, every board numbered from 1, and the lines whose text the solution does not contain. */
export function scriptReviewRequest(boards: LessonBoard[], solution: string, flagged: string[]): string {
  const listed = boards
    .map((board, index) => {
      const rows = [`BOARD ${index + 1}`, `Title: ${board.title || "-"}`, `Picture: ${board.diagram || "-"}`];
      for (const step of board.steps) {
        if (step.line === null) rows.push(`Say: ${step.narration}`);
        else rows.push(`${step.line + 1}. Line: ${board.lines[step.line] ?? ""}`, `   Say: ${step.narration}`);
      }
      return rows.join("\n");
    })
    .join("\n\n");
  const unique = [...new Set(flagged)];
  const hint = unique.length
    ? `\n\nThe text of these does not appear in the solution exactly. Each may be a different notation of a right step, or wrong:\n${unique.join("\n")}`
    : "";
  return `Solution:\n${solution.slice(0, 6000)}\n\nScript:\n${listed}${hint}`;
}

export type ScriptChange = {
  action: "fix" | "drop" | "add";
  /** Zero-based board index. */
  board: number;
  /** Zero-based line index. An add at -1 goes before the first line. */
  line: number;
  text: string;
  say: string;
};

/** Changes from the review. OK, or a reply with no readable change, is an empty list. */
export function parseScriptReview(raw: string): ScriptChange[] {
  const changes: ScriptChange[] = [];
  const text = stripFence(visibleReply(raw));
  for (const part of text.split(/^(?=\s*(?:FIX|DROP|ADD)\s+\d+\s*\.\s*\d+)/gim)) {
    const head = part.match(/^\s*(FIX|DROP|ADD)\s+(\d+)\s*\.\s*(\d+)[^\n]*/i);
    if (!head) continue;
    const action = (head[1] ?? "").toLowerCase() as ScriptChange["action"];
    const board = Number(head[2]) - 1;
    const line = Number(head[3]) - 1;
    const entries = entriesOf(part.slice(head[0].length));
    const value = entries.find((entry) => entry.key === "line")?.value ?? "";
    const say = entries.find((entry) => entry.key === "say")?.value ?? "";
    if (board < 0) continue;
    const lineText = blank(value) ? "" : value.slice(0, 160);
    const spoken = blank(say) ? "" : say.slice(0, 1200);
    if (action === "drop" && line >= 0) changes.push({ action, board, line, text: "", say: "" });
    if (action === "fix" && line >= 0 && (lineText || spoken)) {
      changes.push({ action, board, line, text: lineText, say: spoken });
    }
    if (action === "add" && line >= -1 && lineText) changes.push({ action, board, line, text: lineText, say: spoken });
  }
  return changes.slice(0, 24);
}

/**
 * Applies the review in place. A board that grows past five lines continues
 * on a new board with the same title and picture, so no step is lost. A mark
 * follows its line; a mark whose line was dropped or moved to another board goes.
 */
export function applyScriptReview(boards: LessonBoard[], changes: ScriptChange[]): LessonBoard[] {
  return boards.flatMap((board, index) => {
    const mine = changes.filter((change) => change.board === index);
    if (mine.length === 0) return [board];
    /** origin is the line's index before the review; an added line has none. */
    type Item = { line: string | null; narration: string; origin?: number; mark?: BoardMark };
    const items: Item[] = [];
    const added = (after: number): Item[] =>
      mine
        .filter((change) => change.action === "add" && change.line === after)
        .map((change) => ({ line: change.text, narration: change.say || change.text }));
    let openingAdded = false;
    const addOpening = () => {
      if (openingAdded) return;
      items.push(...added(-1));
      openingAdded = true;
    };
    for (const step of board.steps) {
      const mark = step.mark ? { mark: step.mark } : {};
      if (step.line === null) {
        items.push({ line: null, narration: step.narration, ...mark });
        continue;
      }
      addOpening();
      const at = step.line;
      const dropped = mine.some((change) => change.action === "drop" && change.line === at);
      const fix = mine.find((change) => change.action === "fix" && change.line === at);
      if (!dropped) {
        items.push({
          line: fix?.text || board.lines[at] || "",
          narration: fix?.say || step.narration,
          origin: at,
          ...mark,
        });
      }
      items.push(...added(at));
    }
    addOpening();

    const parts: LessonBoard[] = [];
    const fresh = (): LessonBoard => ({ title: board.title, diagram: board.diagram, lines: [], steps: [] });
    let current = fresh();
    let placed = new Map<number, number>();
    const placedMark = (mark: BoardMark | undefined): BoardMark | undefined => {
      if (!mark || mark.kind === "circle") return mark;
      const line = placed.get(mark.line);
      return line === undefined ? undefined : { kind: mark.kind, line };
    };
    for (const item of items) {
      if (item.line === null) {
        const mark = placedMark(item.mark);
        current.steps.push({ narration: item.narration, line: null, ...(mark ? { mark } : {}) });
        continue;
      }
      if (!item.line) continue;
      if (current.lines.length >= BOARD_LINE_LIMIT) {
        parts.push(current);
        current = fresh();
        placed = new Map();
      }
      current.lines.push(item.line);
      const line = current.lines.length - 1;
      if (item.origin !== undefined) placed.set(item.origin, line);
      const mark = placedMark(item.mark);
      current.steps.push({ narration: item.narration, line, ...(mark ? { mark } : {}) });
    }
    parts.push(current);
    return parts.filter((part) => part.steps.length > 0 && (part.lines.length > 0 || Boolean(part.diagram)));
  });
}

const VAGUE_DIAGRAM = [
  /\b(?:same|identical)\b[^.]{0,40}\b(?:setup|diagram|picture|figure|incline|lens|circuit|as before)\b/i,
  /\b(?:as before|previous (?:board|diagram|figure)|from before)\b/i,
  /\b(?:summary|text|calculation|equation|formula|result)\s+(?:box|block|card|panel)\b/i,
  /\b(?:box|block|card|panel)\s+(?:showing|with|containing)\s+(?:the\s+)?(?:substitution|calculation|equation|formula|result|text)\b/i,
  /\bText:/,
  /^\s*(?:the\s+|an?\s+)?(?:equation|formula|expression|calculation|result)\b/i,
  /\b(?:equation|formula|expression|calculation)\b[^.]{0,60}\b(?:is|are)\s+(?:written|shown)\b/i,
];

const LATEX_LABEL: Record<string, string> = {
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  circ: "°",
};

/** Labels in a diagram are plain text. Dollar signs and LaTeX would be drawn literally. */
export function plainDiagram(diagram: string): string {
  return diagram
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/\^\\circ|\^\{\\circ\}/g, "°")
    .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, "$1")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\([A-Za-z]+)/g, (match, name: string) =>
      LATEX_LABEL[name] ?? (/^(?:sin|cos|tan|log|ln)$/.test(name) ? ` ${name} ` : match),
    )
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A diagram the image model cannot draw on its own: a reference to another board, or a box of text. */
export function vagueDiagram(diagram: string): boolean {
  return Boolean(diagram) && VAGUE_DIAGRAM.some((pattern) => pattern.test(diagram));
}

export const DIAGRAM_FIX_PROMPT = `An image model draws the picture of each whiteboard board alone. It never sees the other boards. Rewrite the Diagram of each board you are asked for, so it can be drawn by itself.

Output only, for each board you were asked for:
BOARD n
Diagram: the whole picture

Rules:
- Describe the whole picture in two or three sentences. Never "same as before" or "same setup".
- A physical picture: the setup, the object, the field, the ray, the circuit, the forces, the motion, or a graph. Never a box of text, a summary, or an equation block.
- Put things where the solution's numbers put them, for example "object 30 cm left of the lens, between F (20 cm) and 2F (40 cm); image 60 cm right, beyond 2F, inverted and twice as tall".
- Name every label and what it marks. A label is plain text: a symbol, or one or two English words. No dollar signs and no equations.
- If nothing physical can be drawn for that board, write Diagram: -`;

/** The rewrite request: the solution, every board for context, and which boards to rewrite. */
export function diagramFixRequest(boards: LessonBoard[], wanted: number[], solution: string): string {
  const listed = boards
    .map((board, index) => `BOARD ${index}\nDiagram: ${board.diagram || "-"}\nLines: ${board.lines.join(" | ") || "-"}`)
    .join("\n\n");
  return `Solution:\n${solution.slice(0, 6000)}\n\nBoards:\n${listed}\n\nRewrite the Diagram of boards: ${wanted.join(", ")}`;
}

/** Rewritten diagrams by board index. A board marked "-" gets no diagram. */
export function parseDiagramFix(raw: string): Map<number, string> {
  const fixed = new Map<number, string>();
  const text = stripFence(visibleReply(raw));
  for (const part of text.split(/^\s*BOARD\s+(?=\d)/gim).slice(1)) {
    const index = Number(part.match(/^\d+/)?.[0]);
    if (!Number.isInteger(index)) continue;
    const diagram = entriesOf(part).find((entry) => entry.key === "diagram")?.value ?? "";
    fixed.set(index, blank(diagram) ? "" : diagram.slice(0, 400));
  }
  return fixed;
}

/** The talk comes first. Boards are cuts of that talk; each line is written while it is explained. */
export function parseBoardScript(raw: string): { explain: string; boards: LessonBoard[] } {
  const text = stripFence(visibleReply(raw));
  const parts = text.split(/^\s*BOARD\s*$/gim);
  const explain = (parts[0] ?? "").replace(/^\s*EXPLAIN\s*/i, "").trim();
  const boards: LessonBoard[] = [];
  let previousDiagram = "";
  for (const part of parts.slice(1)) {
    const board = boardFromPart(part, previousDiagram);
    if (!board) continue;
    boards.push(board);
    if (board.diagram) previousDiagram = board.diagram;
  }
  if (boards.length <= BOARD_LIMIT) return { explain, boards };
  return { explain, boards: [...boards.slice(0, BOARD_LIMIT - 1), boards[boards.length - 1]] };
}
