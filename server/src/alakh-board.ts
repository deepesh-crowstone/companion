import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import type { BoardMark, LessonBoard } from "./alakh-board-script.js";
import { requestLessonImage } from "./alakh-motion.js";
import { loadJax, paintMath, xml } from "./alakh-slide.js";
import { replyChatCompletion } from "./reply-client.js";
import { readRaster, visionImageUrl } from "./vision-image.js";

const WIDTH = 1280;
const HEIGHT = 720;
const INK = "#1C1C1C";
const TITLE_INK = "#1F4FA3";
const MARK_INK = "#D9412F";
const UNDERLINE_INK = "#E0702A";
const PICTURE_TIMEOUT_MS = 150_000;
const CHECK_EDGE = 1024;

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const BOARD_FONTS = [
  "Kalam-Regular.ttf",
  "Kalam-Bold.ttf",
  "NotoSans-Regular.ttf",
  "NotoSansDevanagari-Regular.ttf",
].map((name) => join(FONT_DIR, name));

const TITLE = { x: 56, baseline: 78, size: 46 };
export const PICTURE_BOX: Box = { x: 36, y: 124, w: 536, h: 536 };
const COLUMN = { picture: { left: 612, right: 1240 }, plain: { left: 96, right: 1184 }, top: 140, bottom: 692 };
const TEXT_SIZE = { picture: 48, plain: 58 };
/** Typeset mathematics at this many pixels per ex of the handwriting size, so capitals match. */
const MATH_EX = 0.39;
/** Kalam's own space nearly vanishes after a Devanagari vowel sign. */
const WORD_SPACE = 0.16;
const LINE_GAP = 32;
const ROW_GAP = 10;
const FEATHER = 14;

/** Frames drawn per step. The last frame is held for the rest of the step. */
export const BOARD_FRAMES = 18;

export const BOARD_IMAGE_MODEL = "openai/gpt-image-2";

export type Box = { x: number; y: number; w: number; h: number };

export type PreparedBoard = {
  board: LessonBoard;
  /** The finished board without marks, as RGBA pixels on the 1280x720 canvas. */
  final: Buffer;
  title: Box | null;
  /** The rows of each line, in the order the lines are written. */
  lines: Box[][];
  picture: Box | null;
  /** The picture draws in during this board's first step. False when the board before showed it. */
  pictureIsNew: boolean;
  /** Canvas boxes of picture labels, by lower-case label. */
  labels: Map<string, Box>;
};

export function boardImageModel(): string {
  return process.env.ALAKH_BOARD_IMAGE_MODEL?.trim() || BOARD_IMAGE_MODEL;
}

/** For drawings with no text. Loading system fonts costs seconds per render. */
const NO_TEXT = { font: { loadSystemFonts: false } };

function resvgOptions(background?: string) {
  return {
    ...(background ? { background } : {}),
    font: {
      loadSystemFonts: false,
      fontFiles: BOARD_FONTS,
      defaultFontFamily: "Kalam",
      sansSerifFamily: "Kalam",
    },
    languages: ["hi", "en"],
  };
}

// ---------------------------------------------------------------- writing

const HAND_TEX: [RegExp, string][] = [
  [/\\(?:text|mathrm|textrm|mbox)\{([^{}]*)\}/g, "$1"],
  [/\\left|\\right/g, ""],
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\(?:leqslant|leq|le)(?![A-Za-z])/g, "≤"],
  [/\\(?:geqslant|geq|ge)(?![A-Za-z])/g, "≥"],
  [/\\approx/g, "≈"],
  [/\\pi(?![A-Za-z])/g, "π"],
  [/\^\{?\\circ\}?/g, "°"],
  [/\^\{?2\}?/g, "²"],
  [/\^\{?3\}?/g, "³"],
  [/\\%/g, "%"],
  [/\\(?:quad|qquad)/g, " "],
  [/\\[,;:! ]/g, " "],
];

/**
 * Plain mathematics the handwriting font can write itself, so a line keeps one
 * hand. Anything with a fraction, root, Greek letter or set symbol is typeset.
 */
export function handwrittenMath(tex: string): string | null {
  let text = tex;
  for (const [pattern, value] of HAND_TEX) text = text.replace(pattern, value);
  if (/[\\^_{}]/.test(text)) return null;
  if (!/^[A-Za-z0-9\s+\-=<>().,/:;%×·≤≥≈π°²³'!|[\]]*$/.test(text)) return null;
  return text
    .replace(/\s*([=<>≤≥≈])\s*/g, " $1 ")
    .replace(/([A-Za-z0-9)²³%])\s*([+×-])\s*(?=[A-Za-z0-9(π])/g, "$1 $2 ")
    .replace(/\s+/g, " ")
    .trim();
}

type Token = { kind: "text"; text: string } | { kind: "math"; tex: string };

/** `\text{Total Time}` is words, wherever the script put it. A backslash is never drawn. */
function unwrapTexWords(value: string): string {
  let text = value;
  for (let guard = 0; guard < 6; guard += 1) {
    const next = text.replace(
      /\\(?:text|mathrm|textrm|textit|textbf|mbox|operatorname|hbox)\{([^{}]*)\}/g,
      "$1",
    );
    if (next === text) return text;
    text = next;
  }
  return text;
}

/** How far a bare LaTeX command runs, including its groups and powers. */
function bareLatexEnd(text: string, start: number): number {
  let at = start;
  while (at < text.length && text[at] === "\\") {
    at += 1;
    while (at < text.length && /[A-Za-z]/.test(text[at] ?? "")) at += 1;
    while (text[at] === "{") {
      let depth = 1;
      at += 1;
      while (at < text.length && depth > 0) {
        if (text[at] === "{") depth += 1;
        else if (text[at] === "}") depth -= 1;
        at += 1;
      }
    }
    const after = at;
    while (text[at] === " ") at += 1;
    if (text[at] === "^" || text[at] === "_") {
      at += 1;
      if (text[at] === "{") {
        let depth = 1;
        at += 1;
        while (at < text.length && depth > 0) {
          if (text[at] === "{") depth += 1;
          else if (text[at] === "}") depth -= 1;
          at += 1;
        }
      } else if (at < text.length) at += 1;
      continue;
    }
    if (text[at] === "\\") continue;
    return after;
  }
  return at;
}

/** Text and $...$ pieces of a line. Plain mathematics joins the text around it. */
export function lineTokens(line: string): Token[] {
  const tokens: Token[] = [];
  const pushText = (text: string) => {
    const last = tokens[tokens.length - 1];
    if (last?.kind === "text") last.text += text;
    else if (text) tokens.push({ kind: "text", text });
  };
  const pushPlain = (raw: string) => {
    const text = unwrapTexWords(raw).replace(/ {2,}/g, " ");
    let at = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== "\\") continue;
      pushText(text.slice(at, index));
      const end = Math.max(bareLatexEnd(text, index), index + 1);
      const tex = text.slice(index, end).trim();
      const hand = handwrittenMath(tex);
      if (hand !== null) pushText(hand);
      else if (tex) tokens.push({ kind: "math", tex });
      at = end;
      index = end - 1;
    }
    pushText(text.slice(at).replace(/\\/g, ""));
  };
  let at = 0;
  for (const match of line.matchAll(/\$\$?([^$]+?)\$\$?/g)) {
    pushPlain(line.slice(at, match.index));
    const tex = (match[1] ?? "").trim();
    const hand = handwrittenMath(tex);
    if (hand !== null) pushText(hand);
    else if (tex) tokens.push({ kind: "math", tex });
    at = (match.index ?? 0) + match[0].length;
  }
  pushPlain(line.slice(at).replace(/\$/g, ""));
  return tokens;
}

/** Kalam's ी reaches over the space after it, so a word ending in it gets one more space. */
export function handSpacing(text: string): string {
  return text.replace(/(\u0940[\u0901-\u0903]?) (?=\S)/g, "$1  ");
}

export function textWidth(text: string, size: number, bold = false): number {
  if (!text.trim()) return 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(size * text.length + size * 2)}" height="${Math.ceil(size * 2)}"><text x="0" y="${Math.round(size * 1.4)}" font-family="Kalam" font-weight="${bold ? 700 : 400}" font-size="${size}" word-spacing="${(size * WORD_SPACE).toFixed(1)}" xml:space="preserve">${xml(text)}</text></svg>`;
  const box = new Resvg(svg, resvgOptions()).getBBox();
  return box ? box.x + box.width : size * 0.5 * text.length;
}

type Laid = { markup: string; width: number; ascent: number; descent: number };

type Typeset = { markup: string; width: number; height: number; depth: number };

const typesetCache = new Map<string, Promise<Typeset | null>>();

/** Typeset mathematics, with a light stroke so it weighs the same as the handwriting. */
function typeset(tex: string, pxPerEx: number): Promise<Typeset | null> {
  const key = `${pxPerEx}|${tex}`;
  let cached = typesetCache.get(key);
  if (!cached) {
    cached = (async () => {
      try {
        const engine = await loadJax();
        const svg = engine.outerHTML(engine.convert(tex, { display: true }));
        const math = paintMath(svg, pxPerEx, 4000);
        if (!math) return null;
        const align = Number(svg.match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1] ?? 0);
        const markup = math.markup.replaceAll('stroke-width="0"', 'stroke-width="22"');
        return { ...math, markup, depth: Math.max(0, -align * pxPerEx) };
      } catch {
        return null;
      }
    })();
    if (typesetCache.size > 400) typesetCache.clear();
    typesetCache.set(key, cached);
  }
  return cached;
}

/** An equation splits before each top-level relation, so a long chain can continue on the next row. */
export function splitEquation(tex: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < tex.length; index += 1) {
    const rest = tex.slice(index);
    if (/^\\left(?![A-Za-z])/.test(rest)) depth += 1;
    else if (/^\\right(?![A-Za-z])/.test(rest)) depth = Math.max(0, depth - 1);
    const char = tex[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    if (depth > 0 || tex[index - 1] === "\\") continue;
    const breaks = char === "=" || /^\\(?:Rightarrow|implies)(?![A-Za-z])/.test(rest);
    if (breaks && tex.slice(start, index).trim()) {
      pieces.push(tex.slice(start, index).trim());
      start = index;
    }
  }
  pieces.push(tex.slice(start).trim());
  return pieces.filter(Boolean);
}

/** Pieces a line may break between: words of text, and the parts of an equation. */
export function lineChunks(line: string): Token[] {
  const chunks: Token[] = [];
  for (const token of lineTokens(line)) {
    if (token.kind === "text") {
      for (const word of token.text.split(/\s+/)) if (word) chunks.push({ kind: "text", text: word });
      continue;
    }
    for (const tex of splitEquation(token.tex)) chunks.push({ kind: "math", tex });
  }
  return chunks;
}

function rowTokens(chunks: Token[]): Token[] {
  const tokens: Token[] = [];
  for (const chunk of chunks) {
    const last = tokens[tokens.length - 1];
    if (chunk.kind === "text" && last?.kind === "text") last.text += ` ${chunk.text}`;
    else tokens.push({ ...chunk });
  }
  return tokens;
}

/** A good place to start a new row: after a comma, or before a relation. */
function breakBefore(chunks: Token[], index: number): number {
  const before = chunks[index - 1];
  const chunk = chunks[index];
  if (before?.kind === "text" && /[,;:]$/.test(before.text)) return 2;
  if (chunk?.kind === "text" && /^[=≤≥<>≈]$/.test(chunk.text)) return 1;
  if (chunk?.kind === "math" && /^(?:=|\\Rightarrow|\\implies)/.test(chunk.tex)) return 1;
  return 0;
}

/**
 * A line in rows no wider than the column. A line that needs more than three
 * rows stays whole and is shrunk instead.
 */
export async function layRows(line: string, size: number, width: number): Promise<Laid[]> {
  const chunks = lineChunks(line);
  const whole = await layTokens(rowTokens(chunks), size);
  if (whole.width <= width || chunks.length < 2) return [whole];
  const rows: Laid[] = [];
  let current: Token[] = [];
  for (const chunk of chunks) {
    const trial = [...current, chunk];
    if (current.length === 0 || (await layTokens(rowTokens(trial), size)).width <= width) {
      current = trial;
      continue;
    }
    let cut = current.length;
    let best = 0;
    for (let index = current.length - 1; index >= 1; index -= 1) {
      const score = breakBefore(current, index);
      if (score > best) {
        best = score;
        cut = index;
      }
      if (score === 2) break;
    }
    rows.push(await layTokens(rowTokens(current.slice(0, cut)), size));
    current = [...current.slice(cut), chunk];
  }
  rows.push(await layTokens(rowTokens(current), size));
  return rows.length > 3 ? [whole] : rows;
}

/** One line laid out with its baseline at y = 0. */
export function layLine(line: string, size: number): Promise<Laid> {
  return layTokens(lineTokens(line), size);
}

async function layTokens(tokens: Token[], size: number): Promise<Laid> {
  const parts: string[] = [];
  let x = 0;
  let ascent = size * 0.95;
  let descent = size * 0.35;
  let spaceBefore = false;
  let first = true;
  for (const token of tokens) {
    if (token.kind === "text") {
      const text = token.text.replace(/\s+/g, " ");
      const trimmed = handSpacing(text.trim());
      if (!trimmed) {
        spaceBefore = true;
        continue;
      }
      if (!first) x += /^\s/.test(text) || spaceBefore ? size * 0.28 : size * 0.04;
      parts.push(
        `<text x="${x.toFixed(1)}" y="0" fill="${INK}" font-family="Kalam" font-size="${size}" word-spacing="${(size * WORD_SPACE).toFixed(1)}" xml:space="preserve">${xml(trimmed)}</text>`,
      );
      x += textWidth(trimmed, size);
      spaceBefore = /\s$/.test(text);
      first = false;
      continue;
    }
    const math = await typeset(token.tex, size * MATH_EX);
    if (!math) {
      const fallback = token.tex.replace(/\\/g, "");
      if (!first) x += size * 0.28;
      parts.push(
        `<text x="${x.toFixed(1)}" y="0" fill="${INK}" font-family="Kalam" font-size="${size}" word-spacing="${(size * WORD_SPACE).toFixed(1)}" xml:space="preserve">${xml(fallback)}</text>`,
      );
      x += textWidth(fallback, size);
      first = false;
      spaceBefore = false;
      continue;
    }
    if (!first) x += size * 0.28;
    const top = math.height - math.depth;
    parts.push(`<g transform="translate(${x.toFixed(1)} ${(-top).toFixed(1)})">${math.markup}</g>`);
    x += math.width;
    ascent = Math.max(ascent, top);
    descent = Math.max(descent, math.depth);
    first = false;
    spaceBefore = true;
  }
  return { markup: parts.join(""), width: x, ascent, descent };
}

export type BoardLayout = {
  title: { markup: string; box: Box } | null;
  /** Each line in one or more rows, written in order. */
  lines: { markup: string; rows: Box[] }[];
  picture: Box | null;
};

function wobble(from: number, to: number, y: number, seed: number): string {
  const points: string[] = [];
  for (let x = from; x <= to; x += 14) {
    points.push(`${x.toFixed(1)},${(y + Math.sin(x / 37 + seed) * 1.6).toFixed(1)}`);
  }
  points.push(`${to.toFixed(1)},${(y + Math.sin(to / 37 + seed) * 1.6).toFixed(1)}`);
  return points.join(" ");
}

/**
 * Where the title, the picture and every line sit. A long line wraps; lines
 * shrink together only when they still do not fit. The writing is centred in
 * its column, and a board without a picture writes larger in the middle.
 */
export async function layoutBoard(board: LessonBoard, hasPicture: boolean): Promise<BoardLayout> {
  let title: BoardLayout["title"] = null;
  if (board.title) {
    const titleText = handSpacing(board.title);
    const natural = textWidth(titleText, TITLE.size, true);
    const scale = Math.min(1, (WIDTH - TITLE.x * 2) / Math.max(1, natural));
    const width = natural * scale;
    const underline = wobble(TITLE.x, TITLE.x + width, TITLE.baseline + 16, 1);
    title = {
      markup: `<g transform="translate(${TITLE.x} ${TITLE.baseline}) scale(${scale.toFixed(3)})"><text x="0" y="0" fill="${TITLE_INK}" font-family="Kalam" font-weight="700" font-size="${TITLE.size}" word-spacing="${(TITLE.size * WORD_SPACE).toFixed(1)}" xml:space="preserve">${xml(titleText)}</text></g><polyline points="${underline}" fill="none" stroke="${TITLE_INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>`,
      box: { x: TITLE.x - 8, y: TITLE.baseline - TITLE.size, w: width + 20, h: TITLE.size + 26 },
    };
  }
  const column = hasPicture ? COLUMN.picture : COLUMN.plain;
  const size = hasPicture ? TEXT_SIZE.picture : TEXT_SIZE.plain;
  const columnWidth = column.right - column.left;
  const laid = await Promise.all(board.lines.map((line) => layRows(line, size, columnWidth)));
  const fit = (row: Laid) => Math.min(1, columnWidth / Math.max(1, row.width));
  const lineHeight = (rows: Laid[]) =>
    rows.reduce((sum, row) => sum + (row.ascent + row.descent) * fit(row), 0) + ROW_GAP * (rows.length - 1);
  const natural =
    laid.reduce((sum, rows) => sum + lineHeight(rows), 0) + LINE_GAP * Math.max(0, laid.length - 1);
  const room = COLUMN.bottom - COLUMN.top;
  const shrink = Math.max(0.55, Math.min(1, room / Math.max(1, natural)));
  const widest = Math.max(0, ...laid.flat().map((row) => row.width * fit(row) * shrink));
  const left = hasPicture ? column.left : Math.max(column.left, Math.round((WIDTH - widest) / 2));
  const lines: BoardLayout["lines"] = [];
  let top = COLUMN.top + Math.max(0, (room - natural * shrink) / 2);
  laid.forEach((rows) => {
    const markup: string[] = [];
    const boxes: Box[] = [];
    rows.forEach((row, index) => {
      const scale = fit(row) * shrink;
      const baseline = top + row.ascent * scale;
      markup.push(
        `<g transform="translate(${left} ${baseline.toFixed(1)}) scale(${scale.toFixed(4)})">${row.markup}</g>`,
      );
      boxes.push({
        x: left,
        y: Math.round(top),
        w: Math.ceil(row.width * scale),
        h: Math.ceil((row.ascent + row.descent) * scale),
      });
      top += (row.ascent + row.descent) * scale + (index + 1 < rows.length ? ROW_GAP * shrink : 0);
    });
    lines.push({ markup: markup.join(""), rows: boxes });
    top += LINE_GAP * shrink;
  });
  return { title, lines, picture: hasPicture ? PICTURE_BOX : null };
}

// ---------------------------------------------------------------- picture

export function picturePrompt(description: string, problems: string[] = [], unlabeled = false): string {
  return [
    "A clean teaching diagram for a whiteboard lesson video, drawn in marker.",
    "Pure white background. No border, no frame, no title, no watermark.",
    "Dark ink for outlines. Blue only for the arrows, rays or fields the description names. Red only for one highlight.",
    `Draw: ${description}`,
    "Draw only what this description names. Nothing decorative: no extra lines, axes, arrows, dots, shading or shapes it does not name.",
    unlabeled
      ? "Write no labels, letters, numbers or text of any kind. The shapes alone show the setup."
      : "Write only the labels this description names, large and clear, each next to what it marks. A label is a symbol, a value, or one or two English words.",
    "No equations, no sentences, no working, no answer, no extra numbers.",
    "Physically and mathematically correct, with every part where the description puts it.",
    "The drawing fills the square with a small even margin.",
    ...(problems.length ? ["An earlier drawing had these problems. Avoid them:", ...problems.map((p) => `- ${p}`)] : []),
  ].join("\n");
}

const PICTURE_CHECK_PROMPT = `You check a teaching picture drawn by an image model against its description and the worked solution it belongs to. Reply only with JSON: {"ok": true, "labels": {...}} or {"ok": false, "problems": ["..."]}.

Not ok when:
- a described part or label is missing, or a label marks the wrong part
- a point sits in the wrong place for the numbers: an object, image, focus, or value on the wrong side or out of order
- the physics or mathematics is wrong: a ray that does not obey the lens or mirror, an arrow the wrong way, a wrong region shaded
- it adds parts the description does not name that could mislead a student: extra lines, axes, arrows, points, or shading
- it shows text that is not a described label: an equation, a sentence, a title, or numbers the description does not give
- a label is garbled or misspelled
- it shows a result the description does not show

Style, colour and exact size do not matter. Each problem is one short sentence that says what to fix.

When ok, also give "labels": for each label you are asked to find, its box in the picture as [x1, y1, x2, y2] on a 0 to 1000 scale, from the left and from the top. Leave out a label you cannot find.`;

/** A label's box in the picture, on a 0 to 1000 scale. */
export type LabelBox = [number, number, number, number];

export type PictureCheck = {
  ok: boolean;
  problems: string[];
  labels: Map<string, LabelBox>;
  /** The checker gave no readable verdict. */
  unknown?: boolean;
};

const UNKNOWN: PictureCheck = { ok: false, problems: [], labels: new Map(), unknown: true };

function labelBox(value: unknown): LabelBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map(Number);
  if (box.some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) return null;
  const [x1, y1, x2, y2] = box as LabelBox;
  return x2 > x1 && y2 > y1 ? [x1, y1, x2, y2] : null;
}

export function parsePictureCheck(raw: string): PictureCheck {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return UNKNOWN;
  try {
    const value = JSON.parse(json) as { ok?: unknown; problems?: unknown; labels?: unknown };
    if (typeof value.ok !== "boolean") return UNKNOWN;
    const problems = Array.isArray(value.problems)
      ? value.problems.filter((item): item is string => typeof item === "string" && item.trim() !== "")
      : [];
    const labels = new Map<string, LabelBox>();
    if (value.labels && typeof value.labels === "object") {
      for (const [label, box] of Object.entries(value.labels as Record<string, unknown>)) {
        const parsed = labelBox(box);
        if (parsed) labels.set(label.trim().toLowerCase(), parsed);
      }
    }
    return { ok: value.ok, problems: problems.slice(0, 6), labels };
  } catch {
    return UNKNOWN;
  }
}

function pictureRequest(description: string, solution: string, labels: string[], unlabeled: boolean): string {
  const note = unlabeled
    ? "\n\nThis picture is drawn without any labels on purpose. Do not report missing labels; judge only the shapes and where they sit."
    : "";
  return `Solution:\n${solution.slice(0, 6000)}\n\nPicture description:\n${description}${note}\n\nLabels to find: ${labels.length && !unlabeled ? labels.join(", ") : "none"}`;
}

/**
 * Qwen reads the picture back, thinking first, then directly if that gives no verdict.
 * Two reads without a verdict mean the picture is not trusted.
 */
export async function checkPicture(
  description: string,
  image: Buffer,
  solution: string,
  labels: string[],
  unlabeled = false,
): Promise<PictureCheck> {
  const messages = [
    { role: "system" as const, content: PICTURE_CHECK_PROMPT },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: pictureRequest(description, solution, labels, unlabeled) },
        { type: "image_url" as const, image_url: { url: visionImageUrl(image, "image/png", CHECK_EDGE) } },
      ],
    },
  ];
  try {
    const reply = await replyChatCompletion(messages, {
      timeoutMs: 150_000,
      maxTokens: 8192,
      temperature: 0,
      retries: 0,
      thinking: true,
      label: "Picture check",
    });
    const check = parsePictureCheck(reply);
    if (!check.unknown) return check;
    console.error("Picture check had no verdict, reading it again without a thinking trace");
  } catch (error) {
    console.error("Picture check retrying without a thinking trace:", error instanceof Error ? error.message : error);
  }
  try {
    const reply = await replyChatCompletion(messages, {
      timeoutMs: 90_000,
      maxTokens: 1024,
      temperature: 0,
      retries: 0,
      thinking: false,
      label: "Picture check",
    });
    return parsePictureCheck(reply);
  } catch (error) {
    console.error("Picture check failed:", error instanceof Error ? error.message : error);
    return UNKNOWN;
  }
}

function drawPicture(description: string, problems: string[] = [], unlabeled = false): Promise<Buffer> {
  return requestLessonImage(
    {
      model: boardImageModel(),
      prompt: picturePrompt(description, problems, unlabeled),
      aspect_ratio: "1:1",
      output_format: "png",
    },
    PICTURE_TIMEOUT_MS,
  );
}

export type CheckedPicture = { image: Buffer; labels: Map<string, LabelBox> };

/**
 * Drawn and read back. A wrong picture is drawn once more with its problems
 * listed. Still wrong, it is drawn a last time without labels, which cannot
 * mislabel anything. Wrong or unread after that means no picture.
 */
export async function preparePicture(
  description: string,
  solution: string,
  labels: string[],
  name: string,
): Promise<CheckedPicture | null> {
  try {
    let image = await drawPicture(description);
    let check = await checkPicture(description, image, solution, labels);
    if (!check.ok && !check.unknown) {
      console.error(`${name} redrawn:`, check.problems.join(" | "));
      const problems = check.problems;
      image = await drawPicture(description, problems);
      check = await checkPicture(description, image, solution, labels);
      if (!check.ok && !check.unknown) {
        console.error(`${name} drawn without labels:`, check.problems.join(" | "));
        const all = [...new Set([...problems, ...check.problems])];
        image = await drawPicture(description, all, true);
        check = await checkPicture(description, image, solution, [], true);
        if (check.ok) return { image, labels: new Map() };
      }
    }
    if (check.ok) return { image, labels: check.labels };
    if (check.unknown) console.error(`${name} has no check verdict, leaving it out`);
    else console.error(`${name} still wrong, leaving it out:`, check.problems.join(" | "));
  } catch (error) {
    console.error(`${name} failed, leaving it out:`, error instanceof Error ? error.message : error);
  }
  return null;
}

type Pixels = { pixels: Buffer; width: number; height: number };

/** The most common light colour. Generated "white" is often a shade off pure white. */
export function paperColour(image: Pixels): [number, number, number] {
  const counts = new Map<number, number>();
  let best: [number, number, number] = [255, 255, 255];
  let most = 0;
  for (let y = 0; y < image.height; y += 4) {
    for (let x = 0; x < image.width; x += 4) {
      const at = (y * image.width + x) * 4;
      const r = image.pixels[at] ?? 255;
      const g = image.pixels[at + 1] ?? 255;
      const b = image.pixels[at + 2] ?? 255;
      if (r + g + b < 600) continue;
      const key = (r << 16) | (g << 8) | b;
      const seen = (counts.get(key) ?? 0) + 1;
      counts.set(key, seen);
      if (seen > most) {
        most = seen;
        best = [r, g, b];
      }
    }
  }
  return best;
}

/** The picture fitted into its panel, its paper lifted to the board's white. */
export function fitPicture(image: Buffer, panel: Box = PICTURE_BOX): Pixels & { place: Box } {
  const raster = readRaster(image);
  const sourceW = raster?.width ?? 1;
  const sourceH = raster?.height ?? 1;
  const scale = Math.min(panel.w / sourceW, panel.h / sourceH);
  const place = {
    x: Math.round((panel.w - sourceW * scale) / 2),
    y: Math.round((panel.h - sourceH * scale) / 2),
    w: Math.round(sourceW * scale),
    h: Math.round(sourceH * scale),
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${panel.w}" height="${panel.h}" viewBox="0 0 ${panel.w} ${panel.h}">
  <rect width="${panel.w}" height="${panel.h}" fill="#FFFFFF"/>
  <image href="data:image/png;base64,${image.toString("base64")}" x="0" y="0" width="${panel.w}" height="${panel.h}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  const rendered = new Resvg(svg, { ...NO_TEXT, background: "#FFFFFF" }).render();
  const fitted: Pixels = { pixels: Buffer.from(rendered.pixels), width: rendered.width, height: rendered.height };
  const paper = paperColour(fitted);
  for (let at = 0; at < fitted.pixels.length; at += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const level = paper[channel] ?? 255;
      const value = fitted.pixels[at + channel] ?? 255;
      fitted.pixels[at + channel] = Math.min(255, Math.round((value * 255) / Math.max(1, level)));
    }
    fitted.pixels[at + 3] = 255;
  }
  return { ...fitted, place };
}

function canvasLabels(labels: Map<string, LabelBox>, place: Box, panel: Box = PICTURE_BOX): Map<string, Box> {
  const boxes = new Map<string, Box>();
  for (const [label, [x1, y1, x2, y2]] of labels) {
    boxes.set(label, {
      x: panel.x + place.x + (x1 / 1000) * place.w,
      y: panel.y + place.y + (y1 / 1000) * place.h,
      w: ((x2 - x1) / 1000) * place.w,
      h: ((y2 - y1) / 1000) * place.h,
    });
  }
  return boxes;
}

// ---------------------------------------------------------------- boards

function boardSvg(layout: BoardLayout): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#FFFFFF"/>
  ${layout.title?.markup ?? ""}
  ${layout.lines.map((line) => line.markup).join("\n  ")}
</svg>`;
}

/** Each row's reveal box, padded no further than halfway to the rows around it. */
function revealRows(lines: Box[][]): Box[][] {
  const padded = paddedRows(lines.flat());
  let at = 0;
  return lines.map((rows) => rows.map(() => padded[at++] as Box));
}

function paddedRows(boxes: Box[]): Box[] {
  return boxes.map((box, index) => {
    const above = index > 0 ? box.y - ((boxes[index - 1]?.y ?? 0) + (boxes[index - 1]?.h ?? 0)) : 24;
    const below = index + 1 < boxes.length ? (boxes[index + 1]?.y ?? HEIGHT) - (box.y + box.h) : 24;
    const top = Math.max(0, Math.min(12, Math.floor(above / 2)));
    const bottom = Math.max(0, Math.min(12, Math.floor(below / 2)));
    return {
      x: box.x - 8,
      y: box.y - top,
      w: Math.min(WIDTH - (box.x - 8), box.w + 22),
      h: box.h + top + bottom,
    };
  });
}

/** The finished board: our own title and lines, the picture pasted into its panel. */
export async function composeBoard(
  board: LessonBoard,
  picture: CheckedPicture | null,
  pictureIsNew: boolean,
): Promise<PreparedBoard> {
  const layout = await layoutBoard(board, Boolean(picture));
  const rendered = new Resvg(boardSvg(layout), resvgOptions("#FFFFFF")).render();
  const final = Buffer.from(rendered.pixels);
  let labels = new Map<string, Box>();
  if (picture && layout.picture) {
    const fitted = fitPicture(picture.image, layout.picture);
    for (let y = 0; y < fitted.height; y += 1) {
      const from = y * fitted.width * 4;
      const to = ((layout.picture.y + y) * WIDTH + layout.picture.x) * 4;
      fitted.pixels.copy(final, to, from, from + fitted.width * 4);
    }
    labels = canvasLabels(picture.labels, fitted.place, layout.picture);
  }
  return {
    board,
    final,
    title: layout.title?.box ?? null,
    lines: revealRows(layout.lines.map((line) => line.rows)),
    picture: layout.picture,
    pictureIsNew: Boolean(picture) && pictureIsNew,
    labels,
  };
}

/**
 * A board without a picture would show only its title while its introduction
 * is spoken, so the introduction is spoken while the first line is written.
 * groups lists, for each step that remains, the original steps whose speech it joins.
 */
export function withoutBlankIntros(prepared: PreparedBoard[]): { boards: PreparedBoard[]; groups: number[][] } {
  const groups: number[][] = [];
  let at = 0;
  const boards = prepared.map((board) => {
    const steps = board.board.steps;
    const firstLine = steps.findIndex((step) => step.line !== null);
    const intro = firstLine > 0 && steps.slice(0, firstLine).every((step) => step.line === null && !step.mark);
    if (board.picture || !intro) {
      steps.forEach(() => groups.push([at++]));
      return board;
    }
    const joined = steps.slice(0, firstLine + 1);
    const merged = {
      ...(steps[firstLine] as (typeof steps)[number]),
      narration: joined.map((step) => step.narration).join(" "),
    };
    groups.push(joined.map(() => at++));
    steps.slice(firstLine + 1).forEach(() => groups.push([at++]));
    return { ...board, board: { ...board.board, steps: [merged, ...steps.slice(firstLine + 1)] } };
  });
  return { boards, groups };
}

/** Labels to find in each picture: every label a step circles on a board that shows it. */
function wantedLabels(boards: LessonBoard[], diagram: string): string[] {
  const labels = new Set<string>();
  for (const board of boards) {
    if (board.diagram !== diagram) continue;
    for (const step of board.steps) if (step.mark?.kind === "circle") labels.add(step.mark.label);
  }
  return [...labels];
}

/** One drawing per distinct picture. Boards that say "same" share it and it stays still across the cut. */
export async function prepareBoards(boards: LessonBoard[], solution: string): Promise<PreparedBoard[]> {
  const pictures = new Map<string, Promise<CheckedPicture | null>>();
  for (const board of boards) {
    if (!board.diagram || pictures.has(board.diagram)) continue;
    const name = `Picture ${pictures.size + 1}`;
    pictures.set(board.diagram, preparePicture(board.diagram, solution, wantedLabels(boards, board.diagram), name));
  }
  const drawn = new Map<string, CheckedPicture | null>();
  for (const [diagram, picture] of pictures) drawn.set(diagram, await picture);
  return Promise.all(
    boards.map((board, index) => {
      const picture = board.diagram ? drawn.get(board.diagram) ?? null : null;
      const before = boards[index - 1];
      const shownBefore = Boolean(before && before.diagram === board.diagram && picture);
      return composeBoard(board, picture, !shownBefore);
    }),
  );
}

// ---------------------------------------------------------------- frames

type Point = [number, number];

function union(boxes: Box[]): Box {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The strokes of a mark, in drawing order. An underline runs under every row of its line. */
export function markPath(mark: BoardMark, prepared: PreparedBoard): Point[][] | null {
  if (mark.kind === "circle") {
    const label = prepared.labels.get(mark.label.trim().toLowerCase());
    if (!label) return null;
    const cx = label.x + label.w / 2;
    const cy = label.y + label.h / 2;
    const rx = Math.max(28, label.w / 2 + 20);
    const ry = Math.max(24, label.h / 2 + 16);
    const points: Point[] = [];
    for (let degrees = -150; degrees <= 228; degrees += 6) {
      const angle = (degrees * Math.PI) / 180;
      const grow = 1 + (degrees - -150) / 378 * 0.08;
      points.push([cx + Math.cos(angle) * rx * grow, cy + Math.sin(angle) * ry * grow]);
    }
    return [points];
  }
  const rows = prepared.lines[mark.line];
  if (!rows?.length) return null;
  if (mark.kind === "underline") {
    return rows.map((box) => {
      const y = box.y + box.h - 2;
      const points: Point[] = [];
      for (let x = box.x + 4; x <= box.x + box.w - 4; x += 12) points.push([x, y + Math.sin(x / 29) * 1.8]);
      points.push([box.x + box.w - 4, y + 1]);
      return points;
    });
  }
  const box = union(rows);
  const left = box.x - 4;
  const top = box.y - 2;
  const right = box.x + box.w + 4;
  const bottom = box.y + box.h + 2;
  return [
    [
      [left + 6, top],
      [right, top + 1],
      [right + 1, bottom],
      [left, bottom - 1],
      [left - 1, top + 2],
      [left + 24, top - 1],
    ],
  ];
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1] as Point;
    const to = points[index] as Point;
    length += Math.hypot(to[0] - from[0], to[1] - from[1]);
  }
  return length;
}

/** The first part of a mark's strokes, by length, one stroke after another. */
export function partialStrokes(strokes: Point[][], progress: number): Point[][] {
  if (progress >= 1) return strokes;
  const lengths = strokes.map(pathLength);
  let left = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, progress);
  const out: Point[][] = [];
  strokes.forEach((stroke, index) => {
    if (left <= 0) return;
    const length = lengths[index] ?? 0;
    out.push(partialPath(stroke, length > 0 ? Math.min(1, left / length) : 1));
    left -= length;
  });
  return out;
}

/** The first part of a stroke, by length. */
export function partialPath(points: Point[], progress: number): Point[] {
  if (progress >= 1 || points.length < 2) return points;
  const lengths = points.slice(1).map((point, index) => {
    const prev = points[index] as Point;
    return Math.hypot(point[0] - prev[0], point[1] - prev[1]);
  });
  let left = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, progress);
  const out: Point[] = [points[0] as Point];
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] ?? 0;
    const from = points[index] as Point;
    const to = points[index + 1] as Point;
    if (left >= length) {
      out.push(to);
      left -= length;
      continue;
    }
    const t = length > 0 ? left / length : 0;
    out.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    break;
  }
  return out;
}

type DrawnMark = { mark: BoardMark; progress: number };

function marksOverlay(prepared: PreparedBoard, marks: DrawnMark[]): Buffer | null {
  const strokes = marks.flatMap(({ mark, progress }) => {
    const path = markPath(mark, prepared);
    if (!path || progress <= 0) return [];
    const colour = mark.kind === "underline" ? UNDERLINE_INK : MARK_INK;
    return partialStrokes(path, progress)
      .filter((points) => points.length >= 2)
      .map((points) => {
        const list = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        return `<polyline points="${list}" fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
      });
  });
  if (strokes.length === 0) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">${strokes.join("")}</svg>`;
  return Buffer.from(new Resvg(svg, NO_TEXT).render().pixels);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Copies part of the finished board onto the frame, left to right with a soft pen edge. */
function revealWipe(out: Buffer, final: Buffer, box: Box, progress: number): void {
  if (progress <= 0) return;
  const top = Math.max(0, Math.round(box.y));
  const bottom = Math.min(HEIGHT, Math.round(box.y + box.h));
  const left = Math.max(0, Math.round(box.x));
  const right = Math.min(WIDTH, Math.round(box.x + box.w));
  if (right <= left) return;
  const edge = left + progress * (right - left + FEATHER);
  for (let y = top; y < bottom; y += 1) {
    const row = y * WIDTH * 4;
    const solid = Math.min(right, Math.max(left, Math.floor(edge - FEATHER)));
    if (solid > left) final.copy(out, row + left * 4, row + left * 4, row + solid * 4);
    for (let x = solid; x < Math.min(right, Math.ceil(edge)); x += 1) {
      const alpha = clamp((edge - x) / FEATHER);
      const at = row + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const paper = out[at + channel] ?? 255;
        out[at + channel] = Math.round(paper + ((final[at + channel] ?? 255) - paper) * alpha);
      }
    }
  }
}

/** The picture draws in along a diagonal, left first, as if sketched. */
function revealPicture(out: Buffer, final: Buffer, box: Box, progress: number): void {
  if (progress <= 0) return;
  if (progress >= 1) {
    revealWipe(out, final, box, 1);
    return;
  }
  const soft = 0.14;
  const reach = progress * (1 + soft);
  for (let y = box.y; y < box.y + box.h; y += 1) {
    const row = y * WIDTH * 4;
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const t = ((x - box.x) / box.w) * 0.72 + ((y - box.y) / box.h) * 0.28;
      const alpha = clamp((reach - t) / soft);
      if (alpha <= 0) continue;
      const at = row + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const paper = out[at + channel] ?? 255;
        out[at + channel] = Math.round(paper + ((final[at + channel] ?? 255) - paper) * alpha);
      }
    }
  }
}

export type FrameState = {
  title: number;
  picture: number;
  /** Progress of each line, 0 not written, 1 written. */
  lines: number[];
  marks: DrawnMark[];
};

/** One frame as RGBA pixels: only what has been drawn so far, nothing of what comes later. */
export function composeFrame(prepared: PreparedBoard, state: FrameState): Buffer {
  const out = Buffer.alloc(WIDTH * HEIGHT * 4, 255);
  if (prepared.title) revealWipe(out, prepared.final, prepared.title, state.title);
  if (prepared.picture) revealPicture(out, prepared.final, prepared.picture, state.picture);
  prepared.lines.forEach((rows, index) => {
    const progress = state.lines[index] ?? 0;
    const total = rows.reduce((sum, row) => sum + row.w, 0);
    let before = 0;
    for (const row of rows) {
      revealWipe(out, prepared.final, row, total > 0 ? (progress * total - before) / row.w : progress);
      before += row.w;
    }
  });
  const overlay = marksOverlay(prepared, state.marks);
  if (overlay) {
    for (let at = 0; at < out.length; at += 4) {
      const alpha = (overlay[at + 3] ?? 0) / 255;
      if (alpha <= 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        out[at + channel] = Math.round((overlay[at + channel] ?? 0) + (out[at + channel] ?? 255) * (1 - alpha));
      }
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** RGBA pixels to an RGB PNG. Frames are composed in memory, so nothing is decoded per frame. */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = row + 1 + x * 3;
      raw[to] = rgba[from] ?? 255;
      raw[to + 1] = rgba[from + 1] ?? 255;
      raw[to + 2] = rgba[from + 2] ?? 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 3 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export type FocusPoint = { x: number; y: number };

export type BoardMotion = {
  /** One frame sequence per step, in speaking order. */
  sequences: Buffer[][];
  /** The board each step belongs to. The camera moves on one board and cuts between boards. */
  boards: number[];
  /** Where the camera pushes in on each board, as fractions of the canvas. */
  focus: FocusPoint[];
  /** Extra seconds held after each step: after a boxed result, and before a cut. */
  pauses: number[];
};

const BOX_PAUSE = 0.8;
const CUT_PAUSE = 0.35;

function boardFocus(prepared: PreparedBoard): FocusPoint {
  const boxes = [prepared.title, prepared.picture, ...prepared.lines.flat()].filter((box): box is Box => Boolean(box));
  if (boxes.length === 0) return { x: 0.5, y: 0.5 };
  const left = Math.min(...boxes.map((box) => box.x));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const top = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  const fraction = (value: number) => Math.max(0.3, Math.min(0.7, value));
  return { x: fraction((left + right) / 2 / WIDTH), y: fraction((top + bottom) / 2 / HEIGHT) };
}

/**
 * Every step shows something new. The first step writes the title and draws
 * the picture in. A line is written while it is explained; a mark is drawn
 * after its line, or at once when the step has no line. A box stays; an
 * underline or a circle lasts for its own step.
 */
export function renderBoardMotion(prepared: PreparedBoard[]): BoardMotion {
  const motion: BoardMotion = { sequences: [], boards: [], focus: [], pauses: [] };
  prepared.forEach((board, boardIndex) => {
    motion.focus.push(boardFocus(board));
    const lines = board.lines.map(() => 0);
    const kept: DrawnMark[] = [];
    const steps = board.board.steps;
    steps.forEach((step, stepIndex) => {
      const opening = stepIndex === 0;
      const drawsPicture = opening && board.pictureIsNew;
      const writes = step.line !== null && step.line < board.lines.length ? step.line : null;
      const mark = step.mark && markPath(step.mark, board) ? step.mark : null;
      const changes = (opening && Boolean(board.title)) || drawsPicture || writes !== null || mark !== null;
      const frames = changes ? BOARD_FRAMES : 1;
      const pictureTo = writes !== null || mark ? 0.5 : 0.95;
      const lineFrom = drawsPicture ? 0.5 : opening && board.title ? 0.3 : 0;
      const lineTo = mark ? lineFrom + (1 - lineFrom) * 0.7 : 1;
      const markFrom = writes !== null ? lineTo : drawsPicture ? 0.55 : opening && board.title ? 0.3 : 0;
      const markTo = writes !== null ? 1 : Math.min(1, markFrom + 0.45);
      const sequence: Buffer[] = [];
      for (let frame = 1; frame <= frames; frame += 1) {
        const p = changes ? frame / frames : 1;
        const state: FrameState = {
          title: opening ? clamp(p / 0.3) : 1,
          picture: board.picture ? (drawsPicture ? clamp(p / pictureTo) : 1) : 0,
          lines: lines.map((value, index) =>
            index === writes ? clamp((p - lineFrom) / (lineTo - lineFrom)) : value,
          ),
          marks: [...kept, ...(mark ? [{ mark, progress: clamp((p - markFrom) / (markTo - markFrom)) }] : [])],
        };
        sequence.push(encodePng(composeFrame(board, state), WIDTH, HEIGHT));
      }
      if (writes !== null) lines[writes] = 1;
      if (mark?.kind === "box") kept.push({ mark, progress: 1 });
      motion.sequences.push(sequence);
      motion.boards.push(boardIndex);
      const last = stepIndex === steps.length - 1;
      motion.pauses.push((mark?.kind === "box" ? BOX_PAUSE : 0) + (last ? CUT_PAUSE : 0));
    });
  });
  return motion;
}
