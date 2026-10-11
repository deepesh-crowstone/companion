import { deflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import type { LessonBoard } from "./alakh-board-script.js";
import { requestLessonImage, WIPE_FRAMES } from "./alakh-motion.js";
import { fontFamily, loadJax, paintMath, renderPng, xml } from "./alakh-slide.js";
import { replyChatCompletion } from "./reply-client.js";
import { visionImageUrl } from "./vision-image.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PAPER = "#FFFFFF";
const INK = "#1C1C1C";
const BOARD_TIMEOUT_MS = 150_000;
const INK_LUMA = 170;
const WRITTEN = { x: 64, y: 64, text: 34, mathEx: 34, gap: 30 };

export const BOARD_IMAGE_MODEL = "openai/gpt-image-2";

/** A written row on the board, in canvas pixels. */
export type BoardBand = { top: number; bottom: number; left: number; right: number };

export type PreparedBoard = {
  board: LessonBoard;
  /** The finished board on a 1280x720 canvas, as RGBA pixels. */
  pixels: Buffer;
  /** The board's own paper colour. Covers are painted with it so they do not show. */
  paper: [number, number, number];
  /** One band per line, in the order the lines are written. */
  bands: BoardBand[];
};

export type BoardCheck = {
  ok: boolean;
  /** Every written line is right; only the diagram may be wrong. */
  linesOk: boolean;
  problems: string[];
};

type Pixels = { pixels: Buffer; width: number; height: number };

export function boardImageModel(): string {
  return process.env.ALAKH_BOARD_IMAGE_MODEL?.trim() || BOARD_IMAGE_MODEL;
}

export function boardImagePrompt(board: LessonBoard): string {
  const lines = board.lines.map((line, index) => `Line ${index + 1}: ${line}`).join("\n");
  const layout = board.diagram
    ? [
        `Left 40% of the board: ${board.diagram}`,
        "The diagram stays inside the left 40%, with a clear empty gap between it and the writing.",
        lines
          ? "Right 60% of the board: write exactly these lines, top to bottom, left aligned:"
          : "The right 60% stays empty.",
      ]
    : ["No diagram. Write exactly these lines from the top left, top to bottom, left aligned:"];
  return [
    "A teacher's whiteboard slide for a 16:9 lesson video.",
    "Pure white background. No border, no frame, no title, no watermark.",
    "Clean handwritten dark ink. Black for writing. Blue for fields and vectors, red only for a highlight.",
    ...layout,
    ...(lines ? [lines] : []),
    "Each line sits on its own row with clear empty space above and below it. Medium size writing: one line is about one twelfth of the board height, so five lines fit. Start near the top.",
    "Equations are given in LaTeX between dollar signs. Draw them as handwritten math with real fractions, powers and symbols. Never show dollar signs, backslashes or LaTeX commands.",
    "Hindi is written exactly as given, in Devanagari.",
    "Write only the content after each 'Line n:'. Never write line numbers, bullets or the word Line.",
    "Write nothing else: no extra words, numbers, headings or notes beyond the diagram labels described.",
    "Draw the diagram physically right: rays, forces and fields obey the physics, rays meet where the image forms, and every point sits where the description puts it.",
  ].join("\n");
}

const CHECK_PROMPT = `You check a whiteboard slide drawn by an image model against its script and the worked solution it teaches. Reply only with JSON: {"ok": true} or {"ok": false, "lines_ok": true or false, "problems": ["..."]}. lines_ok is true when every written line is right and only the diagram is wrong.

Not ok when:
- a scripted line is missing, misspelled, or has a wrong symbol, number, sign, power, subscript or fraction
- a line on the board contradicts the solution, even if it matches the script; say what the solution has instead
- the lines are out of order, or two lines share one row
- line numbers, bullets, or text that is not in the script and is not a diagram label the script describes
- dollar signs, backslashes or LaTeX commands are visible
- the diagram contradicts its description, the solution's numbers, or the physics: a label marks the wrong part, an arrow points the wrong way, rays do not meet where the image forms, an object or image sits at the wrong point, a described part is missing
- the writing overlaps the diagram

Handwriting style, colour and exact position do not matter. Each problem is one short sentence that says what to fix.`;

const TRUSTED: BoardCheck = { ok: true, linesOk: true, problems: [] };

export function parseBoardCheck(raw: string): BoardCheck {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return TRUSTED;
  try {
    const value = JSON.parse(json) as { ok?: unknown; lines_ok?: unknown; problems?: unknown };
    const problems = Array.isArray(value.problems)
      ? value.problems.filter((item): item is string => typeof item === "string" && item.trim() !== "")
      : [];
    const ok = value.ok !== false;
    return { ok, linesOk: ok || value.lines_ok === true, problems: problems.slice(0, 6) };
  } catch {
    return TRUSTED;
  }
}

function boardScript(board: LessonBoard, solution: string): string {
  const lines = board.lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
  return `Solution:\n${solution.slice(0, 6000)}\n\nBoard script:\nDiagram: ${board.diagram || "none"}\nLines:\n${lines || "none"}`;
}

const BOARD_CHECK_EDGE = 1536;

/** Qwen reads the board back. A failed check call keeps the drawing. */
export async function checkBoard(board: LessonBoard, image: Buffer, solution: string): Promise<BoardCheck> {
  const messages = [
    { role: "system" as const, content: CHECK_PROMPT },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: boardScript(board, solution) },
        {
          type: "image_url" as const,
          image_url: { url: visionImageUrl(image, "image/png", BOARD_CHECK_EDGE) },
        },
      ],
    },
  ];
  try {
    const reply = await replyChatCompletion(messages, {
      timeoutMs: 120_000,
      maxTokens: 4096,
      temperature: 0,
      retries: 0,
      thinking: true,
      label: "Board check",
    });
    return parseBoardCheck(reply);
  } catch (error) {
    console.error(
      "Board check retrying without a thinking trace:",
      error instanceof Error ? error.message : error,
    );
  }
  try {
    const reply = await replyChatCompletion(messages, {
      timeoutMs: 90_000,
      maxTokens: 1024,
      temperature: 0,
      retries: 0,
      thinking: false,
      label: "Board check",
    });
    return parseBoardCheck(reply);
  } catch (error) {
    console.error("Board check skipped:", error instanceof Error ? error.message : error);
    return TRUSTED;
  }
}

function drawBoard(board: LessonBoard): Promise<Buffer> {
  return requestLessonImage(
    {
      model: boardImageModel(),
      prompt: boardImagePrompt(board),
      aspect_ratio: "16:9",
      output_format: "png",
    },
    BOARD_TIMEOUT_MS,
  );
}

function correctBoard(board: LessonBoard, image: Buffer, problems: string[]): Promise<Buffer> {
  const prompt = [
    "Correct this whiteboard slide. Fix these problems:",
    ...problems.map((problem) => `- ${problem}`),
    "Otherwise the corrected slide matches this description. Where a problem says what the solution has, write that instead:",
    boardImagePrompt(board),
    "Keep everything that is already correct where it is.",
  ].join("\n");
  return requestLessonImage(
    {
      model: boardImageModel(),
      prompt,
      aspect_ratio: "16:9",
      output_format: "png",
      input_references: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } },
      ],
    },
    BOARD_TIMEOUT_MS,
  );
}

/** The drawing, centred on the video canvas, with its pixels for finding the lines. */
export function fitBoard(image: Buffer): Pixels & { png: Buffer } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <image href="data:image/png;base64,${image.toString("base64")}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  const rendered = new Resvg(svg, { background: PAPER }).render();
  return {
    png: rendered.asPng(),
    pixels: Buffer.from(rendered.pixels),
    width: rendered.width,
    height: rendered.height,
  };
}

function inkAt(image: Pixels, x: number, y: number): boolean {
  const at = (y * image.width + x) * 4;
  const luma =
    0.299 * (image.pixels[at] ?? 255) +
    0.587 * (image.pixels[at + 1] ?? 255) +
    0.114 * (image.pixels[at + 2] ?? 255);
  return luma < INK_LUMA;
}

/** Where the writing starts: the widest empty column strip between the diagram and the text. */
export function writingColumn(image: Pixels, hasDiagram: boolean): number {
  const marginX = Math.round(image.width * 0.015);
  if (!hasDiagram) return marginX;
  const marginY = Math.round(image.height * 0.015);
  const from = Math.round(image.width * 0.25);
  const to = Math.round(image.width * 0.65);
  let best = { start: -1, length: 0 };
  let start = -1;
  for (let x = from; x <= to; x += 1) {
    let empty = true;
    for (let y = marginY; y < image.height - marginY && empty; y += 1) {
      if (inkAt(image, x, y)) empty = false;
    }
    if (empty && x < to) {
      if (start < 0) start = x;
      continue;
    }
    if (start >= 0 && x - start > best.length) best = { start, length: x - start };
    start = -1;
  }
  if (best.length < 8) return Math.round(image.width * 0.42);
  return best.start + Math.floor(best.length / 2);
}

/**
 * One band per written line, top to bottom. Rows of ink close together are one
 * line (a fraction has gaps). Returns null when fewer lines are drawn than scripted.
 */
export function findBoardLines(image: Pixels, count: number, hasDiagram: boolean): BoardBand[] | null {
  if (count <= 0) return [];
  const marginX = Math.round(image.width * 0.015);
  const marginY = Math.round(image.height * 0.015);
  const left = writingColumn(image, hasDiagram);
  const right = image.width - marginX;
  const rows: number[] = [];
  for (let y = 0; y < image.height; y += 1) {
    let ink = 0;
    if (y >= marginY && y < image.height - marginY) {
      for (let x = left; x < right; x += 1) if (inkAt(image, x, y)) ink += 1;
    }
    rows.push(ink);
  }
  let bands: { top: number; bottom: number; ink: number }[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    if ((rows[y] ?? 0) < 2) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.bottom <= 4) {
      last.bottom = y;
      last.ink += rows[y] ?? 0;
    } else {
      bands.push({ top: y, bottom: y, ink: rows[y] ?? 0 });
    }
  }
  bands = bands.filter((band) => band.bottom - band.top >= 5 && band.ink >= 25);
  while (bands.length > count) {
    let joint = 0;
    let gap = Infinity;
    for (let index = 0; index + 1 < bands.length; index += 1) {
      const space = (bands[index + 1]?.top ?? 0) - (bands[index]?.bottom ?? 0);
      if (space < gap) {
        gap = space;
        joint = index;
      }
    }
    const upper = bands[joint];
    const lower = bands[joint + 1];
    if (!upper || !lower) break;
    bands.splice(joint, 2, { top: upper.top, bottom: lower.bottom, ink: upper.ink + lower.ink });
  }
  if (bands.length < count) return null;
  return bands.map((band) => {
    let first = right;
    let last = left;
    for (let y = band.top; y <= band.bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        if (!inkAt(image, x, y)) continue;
        if (x < first) first = x;
        if (x > last) last = x;
      }
    }
    return { top: band.top, bottom: band.bottom, left: first, right: last };
  });
}

/** The most common light colour on the board. Generated "white" is often a shade off pure white. */
export function paperColour(image: Pixels): [number, number, number] {
  const counts = new Map<number, number>();
  let best: [number, number, number] = [255, 255, 255];
  let most = 0;
  for (let y = 0; y < image.height; y += 8) {
    for (let x = 0; x < image.width; x += 8) {
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

function paint(
  pixels: Buffer,
  width: number,
  paper: [number, number, number],
  x0: number,
  x1: number,
  y: number,
): void {
  for (let x = x0; x < x1; x += 1) {
    const at = (y * width + x) * 4;
    pixels[at] = paper[0];
    pixels[at + 1] = paper[1];
    pixels[at + 2] = paper[2];
    pixels[at + 3] = 255;
  }
}

/** The writing stays; everything left of it is painted over. A wrong diagram teaches the wrong thing. */
export function withoutDiagram(image: Pixels): Buffer {
  const pixels = Buffer.from(image.pixels);
  const column = writingColumn(image, true);
  const paper = paperColour(image);
  for (let y = 0; y < image.height; y += 1) paint(pixels, image.width, paper, 0, column, y);
  return pixels;
}

function wholeMath(line: string): string | null {
  const match = line.trim().match(/^\$\$?([\s\S]+?)\$\$?$/);
  return match?.[1]?.trim() || null;
}

/** The board written by our own renderer, without a diagram. Used when a drawing cannot be trusted. */
export async function writtenBoard(board: LessonBoard): Promise<PreparedBoard> {
  const width = WIDTH - WRITTEN.x * 2;
  const parts: string[] = [];
  const layout: BoardBand[] = [];
  let y = WRITTEN.y;
  for (const line of board.lines) {
    const tex = wholeMath(line);
    let math = null;
    if (tex) {
      try {
        const engine = await loadJax();
        math = paintMath(engine.outerHTML(engine.convert(tex, { display: true })), WRITTEN.mathEx, width);
      } catch {
        math = null;
      }
    }
    if (math) {
      parts.push(`<g transform="translate(${WRITTEN.x} ${y})">${math.markup}</g>`);
      layout.push({ top: y, bottom: y + math.height, left: WRITTEN.x, right: WRITTEN.x + math.width });
      y += math.height + WRITTEN.gap;
      continue;
    }
    const text = line.replace(/\$\$?([^$]+)\$\$?/g, "$1").trim();
    const baseline = y + WRITTEN.text;
    parts.push(
      `<text x="${WRITTEN.x}" y="${baseline}" xml:space="preserve" fill="${INK}" font-family="${fontFamily(text)}" font-size="${WRITTEN.text}">${xml(text)}</text>`,
    );
    layout.push({ top: y, bottom: y + Math.round(WRITTEN.text * 1.35), left: WRITTEN.x, right: WIDTH - WRITTEN.x });
    y += Math.round(WRITTEN.text * 1.35) + WRITTEN.gap;
  }
  const canvas = renderPng(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  ${parts.join("\n  ")}
</svg>`);
  const fitted = fitBoard(canvas);
  const bands = findBoardLines(fitted, board.lines.length, false) ?? layout;
  return { board, pixels: fitted.pixels, paper: [255, 255, 255], bands };
}

/**
 * Draw, then read the board back. A wrong diagram is erased. A wrong line is
 * corrected once. Anything that is still wrong is written by our renderer.
 */
export async function prepareBoard(
  board: LessonBoard,
  index: number,
  solution: string,
): Promise<PreparedBoard> {
  try {
    let image = await drawBoard(board);
    let check = await checkBoard(board, image, solution);
    if (!check.ok && !check.linesOk) {
      console.error(`Board ${index} line corrected:`, check.problems.join(" | "));
      image = await correctBoard(board, image, check.problems);
      check = await checkBoard(board, image, solution);
    }
    const keepWriting = !check.ok && check.linesOk && Boolean(board.diagram);
    if (check.ok || keepWriting) {
      const fitted = fitBoard(image);
      const bands = findBoardLines(fitted, board.lines.length, Boolean(board.diagram));
      const paper = paperColour(fitted);
      if (bands && keepWriting) {
        console.error(`Board ${index} diagram dropped:`, check.problems.join(" | "));
        return { board, pixels: withoutDiagram(fitted), paper, bands };
      }
      if (bands) return { board, pixels: fitted.pixels, paper, bands };
      console.error(`Board ${index} lines not found, writing it instead`);
    } else {
      console.error(`Board ${index} still wrong, writing it instead:`, check.problems.join(" | "));
    }
  } catch (error) {
    console.error(`Board ${index} drawing failed, writing it instead:`, error instanceof Error ? error.message : error);
  }
  return writtenBoard(board);
}

export function prepareBoards(boards: LessonBoard[], solution: string): Promise<PreparedBoard[]> {
  return Promise.all(boards.map((board, index) => prepareBoard(board, index, solution)));
}

function maskPad(bands: BoardBand[], index: number): number {
  const band = bands[index];
  if (!band) return 0;
  const above = index > 0 ? band.top - (bands[index - 1]?.bottom ?? 0) : 12;
  const below = index + 1 < bands.length ? (bands[index + 1]?.top ?? HEIGHT) - band.bottom : 12;
  return Math.max(0, Math.min(6, Math.floor(above / 2), Math.floor(below / 2)));
}

type Mask = { x: number; y: number; w: number; h: number };

/** White covers over lines not yet written. Line `written` is part-way through its wipe. */
export function boardMasks(prepared: PreparedBoard, written: number, progress: number): Mask[] {
  const masks: Mask[] = [];
  prepared.bands.forEach((band, index) => {
    if (index < written) return;
    if (index === written && progress >= 0.99) return;
    const pad = maskPad(prepared.bands, index);
    const from =
      index === written && progress > 0
        ? band.left + Math.round(progress * (band.right - band.left + 1))
        : band.left - pad;
    const to = band.right + pad + 1;
    if (to <= from) return;
    masks.push({ x: from, y: band.top - pad, w: to - from, h: band.bottom - band.top + 1 + pad * 2 });
  });
  return masks;
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

export function renderBoardFrame(prepared: PreparedBoard, written: number, progress: number): Buffer {
  const pixels = Buffer.from(prepared.pixels);
  for (const mask of boardMasks(prepared, written, progress)) {
    const top = Math.max(0, mask.y);
    const bottom = Math.min(HEIGHT, mask.y + mask.h);
    const left = Math.max(0, mask.x);
    const right = Math.min(WIDTH, mask.x + mask.w);
    if (right <= left) continue;
    for (let y = top; y < bottom; y += 1) paint(pixels, WIDTH, prepared.paper, left, right, y);
  }
  return encodePng(pixels, WIDTH, HEIGHT);
}

/** One sequence per step. The diagram stays; each line is wiped on while it is explained. */
export function renderBoardMotion(prepared: PreparedBoard[]): Buffer[][] {
  const sequences: Buffer[][] = [];
  for (const board of prepared) {
    let written = 0;
    for (const step of board.board.steps) {
      if (step.line === null || step.line >= board.bands.length) {
        sequences.push([renderBoardFrame(board, written, 0)]);
        continue;
      }
      written = Math.max(written, step.line);
      const frames: Buffer[] = [];
      for (let frame = 1; frame <= WIPE_FRAMES; frame += 1) {
        frames.push(renderBoardFrame(board, written, frame / WIPE_FRAMES));
      }
      sequences.push(frames);
      written = step.line + 1;
    }
  }
  return sequences;
}
