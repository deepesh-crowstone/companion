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
      const rows = [`BOARD ${index + 1}`, `Diagram: ${board.diagram || "-"}`];
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
 * on a new board with the same diagram, so no step is lost.
 */
export function applyScriptReview(boards: LessonBoard[], changes: ScriptChange[]): LessonBoard[] {
  return boards.flatMap((board, index) => {
    const mine = changes.filter((change) => change.board === index);
    if (mine.length === 0) return [board];
    type Item = { line: string | null; narration: string };
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
      if (step.line === null) {
        items.push({ line: null, narration: step.narration });
        continue;
      }
      addOpening();
      const at = step.line;
      const dropped = mine.some((change) => change.action === "drop" && change.line === at);
      const fix = mine.find((change) => change.action === "fix" && change.line === at);
      if (!dropped) {
        items.push({ line: fix?.text || board.lines[at] || "", narration: fix?.say || step.narration });
      }
      items.push(...added(at));
    }
    addOpening();

    const parts: LessonBoard[] = [];
    let current: LessonBoard = { diagram: board.diagram, lines: [], steps: [] };
    for (const item of items) {
      if (item.line === null) {
        current.steps.push({ narration: item.narration, line: null });
        continue;
      }
      if (!item.line) continue;
      if (current.lines.length >= BOARD_LINE_LIMIT) {
        parts.push(current);
        current = { diagram: board.diagram, lines: [], steps: [] };
      }
      current.lines.push(item.line);
      current.steps.push({ narration: item.narration, line: current.lines.length - 1 });
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

export const DIAGRAM_FIX_PROMPT = `An image model draws each whiteboard board alone. It never sees the other boards. Rewrite the Diagram of each board you are asked for, so it can be drawn by itself.

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
  const boards = parts.slice(1).flatMap((part) => {
    const board = boardFromPart(part);
    return board ? [board] : [];
  });
  if (boards.length <= BOARD_LIMIT) return { explain, boards };
  return { explain, boards: [...boards.slice(0, BOARD_LIMIT - 1), boards[boards.length - 1]] };
}
