import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { chooseLayout, usefulArt, WIPE_FRAMES } from "./alakh-motion.js";
import {
  classifyShow,
  lessonMemory,
  type MarkCue,
  type SolutionBeat,
} from "./alakh-video-script.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PAPER = "#FFFFFF";
const INK = "#1C1C1C";
const MUTED = "#4A5560";
const MARGIN = 40;
const LEFT_WITH_ART = 384;
const LEFT_THIN = 268;
const GAP = 28;
const TEXT_SIZE = 26;
const PRIOR_SIZE = 22;
const FIND_SIZE = 20;
const GIVEN_SIZE = 18;
const MATH_EX = 28;
const PRIOR_MATH_EX = 18;
const GIVEN_MATH_EX = 16;

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const FONT_FILES = ["NotoSans-Regular.ttf", "NotoSansDevanagari-Regular.ttf"].map((name) =>
  join(FONT_DIR, name),
);

type MathSvg = { markup: string; width: number; height: number };

type Block =
  | { kind: "label"; text: string; size: number; color: string }
  | { kind: "text"; lines: string[]; size: number; color: string }
  | { kind: "math"; math: MathSvg };

type Box = { x: number; y: number; w: number; h: number };

type Page = {
  left: Box | null;
  write: Box;
  picture: Box | null;
  find: string;
  givens: string[];
  marks: MarkCue[];
  priors: SolutionBeat[];
  current: SolutionBeat;
};

type Jax = {
  outerHTML: (node: unknown) => string;
  convert: (tex: string, options: { display: boolean }) => unknown;
};

let jaxPromise: Promise<Jax> | null = null;

function loadJax(): Promise<Jax> {
  if (!jaxPromise) {
    jaxPromise = Promise.resolve().then(() => {
      const adaptor = liteAdaptor();
      RegisterHTMLHandler(adaptor);
      const tex = new TeX({ packages: ["base", "ams"] });
      const svg = new SVG({ fontCache: "none" });
      const html = mathjax.document("", { InputJax: tex, OutputJax: svg });
      return {
        outerHTML: (node: unknown) =>
          adaptor.outerHTML(node as Parameters<typeof adaptor.outerHTML>[0]),
        convert: (value: string, options: { display: boolean }) => html.convert(value, options),
      };
    });
  }
  return jaxPromise;
}

function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

function fontFamily(text: string): string {
  return hasDevanagari(text)
    ? "'Noto Sans Devanagari', 'Noto Sans'"
    : "'Noto Sans', 'Noto Sans Devanagari'";
}

function glyphWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x0900 && code <= 0x097f ? size * 0.72 : size * 0.52;
  }
  return width;
}

function wrapLines(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (glyphWidth(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function paintMath(svg: string, color: string, pxPerEx: number, maxWidth: number): MathSvg | null {
  const inner = svg.match(/<svg[\s\S]*<\/svg>/)?.[0];
  if (!inner || inner.includes("data-mjx-error")) return null;
  const box = inner.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (!box || box.length < 4 || !box[2] || !box[3]) return null;
  const widthEx = Number(inner.match(/\bwidth="([\d.]+)ex"/)?.[1]);
  const heightEx = Number(inner.match(/\bheight="([\d.]+)ex"/)?.[1]);
  let width = widthEx > 0 ? Math.round(widthEx * pxPerEx) : Math.round((box[2] / 430) * pxPerEx);
  let height = heightEx > 0 ? Math.round(heightEx * pxPerEx) : Math.round((box[3] / 430) * pxPerEx);
  if (width > maxWidth && width > 0) {
    const scale = maxWidth / width;
    width = maxWidth;
    height = Math.max(1, Math.round(height * scale));
  }
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box.join(" ")}">`;
  const markup = inner.replace(/<svg[^>]*>/, open).replaceAll("currentColor", color);
  return { markup, width, height };
}

async function mathSvg(
  tex: string,
  color: string,
  pxPerEx: number,
  maxWidth: number,
): Promise<MathSvg | null> {
  try {
    const engine = await loadJax();
    const node = engine.convert(tex, { display: true });
    return paintMath(engine.outerHTML(node), color, pxPerEx, maxWidth);
  } catch {
    return null;
  }
}

function blockHeight(block: Block): number {
  if (block.kind === "math") return block.math.height + 16;
  if (block.kind === "label") return block.size + 10;
  return block.lines.length * Math.round(block.size * 1.35);
}

function normalizeBeat(beat: SolutionBeat): SolutionBeat {
  if (beat.text !== undefined && beat.math !== undefined) return beat;
  const parts = classifyShow(beat.display ?? "");
  return {
    ...beat,
    text: beat.text ?? parts.text,
    math: beat.math ?? parts.math,
  };
}

function claimsOf(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return text.trim() ? [text.trim()] : [];
  return [parts[0] ?? "", parts.slice(1).join(" ")].filter(Boolean).slice(0, 2);
}

function pictureFor(
  memory: ReturnType<typeof lessonMemory>,
  pictures: Map<string, Buffer>,
): { art: NonNullable<SolutionBeat["art"]>; png: Buffer } | null {
  const art = memory.art;
  if (!art || !usefulArt(art.prompt) || !pictures.has(art.id)) return null;
  const png = pictures.get(art.id);
  return png ? { art, png } : null;
}

export function lessonPage(
  beats: SolutionBeat[],
  index: number,
  pictures: Map<string, Buffer> = new Map(),
): { leftWidth: number; hasPicture: boolean; find: string; givens: string[] } {
  const current = normalizeBeat(beats[index] ?? emptyBeat());
  const memory = lessonMemory(beats.map(normalizeBeat), index);
  const picture = pictureFor(memory, pictures);
  const leftWidth = picture ? LEFT_WITH_ART : memory.find || memory.givens.length ? LEFT_THIN : 0;
  return {
    leftWidth,
    hasPicture: Boolean(picture),
    find: memory.find,
    givens: memory.givens,
  };
}

function emptyBeat(): SolutionBeat {
  return { narration: "", display: "", text: "", math: "" };
}

function pageOf(beats: SolutionBeat[], index: number, pictures: Map<string, Buffer>): Page {
  const normalized = beats.map(normalizeBeat);
  const current = normalized[index] ?? emptyBeat();
  const memory = lessonMemory(normalized, index);
  const picture = pictureFor(memory, pictures);
  const leftWidth = picture ? LEFT_WITH_ART : memory.find || memory.givens.length ? LEFT_THIN : 0;
  const left = leftWidth
    ? { x: MARGIN, y: MARGIN, w: leftWidth, h: HEIGHT - MARGIN * 2 }
    : null;
  const writeX = left ? left.x + left.w + GAP : MARGIN + 16;
  const write = {
    x: writeX,
    y: MARGIN,
    w: WIDTH - writeX - MARGIN,
    h: HEIGHT - MARGIN * 2,
  };
  const pictureBox =
    picture && left
      ? { x: left.x, y: left.y, w: left.w, h: Math.min(left.w, 340) }
      : null;
  return {
    left,
    write,
    picture: pictureBox,
    find: memory.find,
    givens: memory.givens,
    marks: memory.marks,
    priors: memory.priors,
    current,
  };
}

async function textBlock(
  text: string,
  width: number,
  size: number,
  color: string,
  maxLines: number,
): Promise<Block | null> {
  if (!text) return null;
  return { kind: "text", lines: wrapLines(text, size, width).slice(0, maxLines), size, color };
}

async function mathOrText(
  value: string,
  width: number,
  size: number,
  color: string,
  pxPerEx: number,
): Promise<Block | null> {
  if (!value) return null;
  const math = await mathSvg(value, color, pxPerEx, width);
  if (math) return { kind: "math", math };
  return textBlock(value, width, size, color, 2);
}

async function referenceBlocks(page: Page): Promise<Block[]> {
  if (!page.left) return [];
  const width = page.left.w;
  const blocks: Block[] = [];
  if (page.find) {
    blocks.push({ kind: "label", text: "Find", size: 14, color: MUTED });
    const find = await mathOrText(page.find, width, FIND_SIZE, INK, GIVEN_MATH_EX);
    if (find) blocks.push(find);
  }
  if (page.givens.length) {
    blocks.push({ kind: "label", text: "Given", size: 14, color: MUTED });
    for (const given of page.givens) {
      const block = await mathOrText(given, width, GIVEN_SIZE, INK, GIVEN_MATH_EX);
      if (block) blocks.push(block);
    }
  }
  if (page.marks.length) {
    const legend = page.marks
      .map((mark) => (mark.symbol ? `${mark.part} → ${mark.symbol}` : mark.part))
      .join("   ");
    const block = await textBlock(legend, width, 16, MUTED, 2);
    if (block) blocks.push(block);
  }
  return blocks;
}

async function writingBlocks(page: Page): Promise<{ prior: Block[]; current: Block[] }> {
  const width = page.write.w;
  const prior: Block[] = [];
  for (const beat of page.priors) {
    if (beat.text) {
      const text = await textBlock(claimsOf(beat.text)[0] ?? beat.text, width, PRIOR_SIZE, MUTED, 2);
      if (text) prior.push(text);
    }
    if (beat.math) {
      const math = await mathOrText(beat.math, width, PRIOR_SIZE, MUTED, PRIOR_MATH_EX);
      if (math) prior.push(math);
    }
  }
  const current: Block[] = [];
  const claims = claimsOf(page.current.text);
  for (const claim of claims) {
    const text = await textBlock(claim, width, TEXT_SIZE, INK, 3);
    if (text) current.push(text);
  }
  if (page.current.math) {
    const lines = page.current.math.split(/\n|;/).map((part) => part.trim()).filter(Boolean);
    const parts = lines.length > 1 ? lines.slice(0, 2) : [page.current.math];
    for (const part of parts) {
      const math = await mathOrText(part, width, TEXT_SIZE, INK, MATH_EX);
      if (math) current.push(math);
    }
  }
  return { prior, current };
}

function paintBlocks(blocks: Block[], x: number, y: number): { markup: string; y: number } {
  const parts: string[] = [];
  let cursor = y;
  for (const block of blocks) {
    if (block.kind === "math") {
      parts.push(`<g transform="translate(${x} ${cursor})">${block.math.markup}</g>`);
      cursor += blockHeight(block);
      continue;
    }
    if (block.kind === "label") {
      cursor += block.size;
      parts.push(
        `<text x="${x}" y="${cursor}" xml:space="preserve" fill="${block.color}" font-family="${fontFamily(block.text)}" font-size="${block.size}">${xml(block.text)}</text>`,
      );
      cursor += 8;
      continue;
    }
    const gap = Math.round(block.size * 0.32);
    for (const line of block.lines) {
      cursor += block.size;
      parts.push(
        `<text x="${x}" y="${cursor}" xml:space="preserve" fill="${block.color}" font-family="${fontFamily(line)}" font-size="${block.size}">${xml(line)}</text>`,
      );
      cursor += gap;
    }
    cursor += 6;
  }
  return { markup: parts.join("\n  "), y: cursor };
}

function sceneSvg(
  page: Page,
  art: { dataUri: string } | null,
  reference: Block[],
  prior: Block[],
  current: Block[],
  revealed: number,
  pictureOpacity: number,
): string {
  const shown = current.slice(0, revealed);
  const picture = page.picture;
  const pictureMarkup =
    picture && art && pictureOpacity > 0
      ? `<image href="${art.dataUri}" x="${picture.x}" y="${picture.y}" width="${picture.w}" height="${picture.h}" opacity="${pictureOpacity.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`
      : "";
  const refTop = picture ? picture.y + picture.h + 16 : page.left?.y ?? MARGIN;
  const ref = page.left ? paintBlocks(reference, page.left.x, refTop) : { markup: "", y: 0 };
  const writing = paintBlocks([...prior, ...shown], page.write.x, page.write.y);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  ${pictureMarkup}
  ${ref.markup}
  ${writing.markup}
</svg>`;
}

function renderPng(svg: string): Buffer {
  return new Resvg(svg, {
    background: PAPER,
    font: {
      loadSystemFonts: false,
      fontFiles: FONT_FILES,
      defaultFontFamily: "Noto Sans",
      sansSerifFamily: "Noto Sans",
    },
    languages: ["hi", "en"],
  })
    .render()
    .asPng();
}

function revealedCount(total: number, progress: number): number {
  if (total <= 0) return 0;
  if (progress >= 0.99) return total;
  return Math.max(1, Math.min(total, Math.ceil(progress * total)));
}

async function renderBeat(
  beats: SolutionBeat[],
  index: number,
  pictures: Map<string, Buffer>,
  progress: number,
): Promise<Buffer> {
  const page = pageOf(beats, index, pictures);
  const memory = lessonMemory(beats.map(normalizeBeat), index);
  const picture = pictureFor(memory, pictures);
  const art = picture ? { dataUri: `data:image/png;base64,${picture.png.toString("base64")}` } : null;
  const reference = await referenceBlocks(page);
  const writing = await writingBlocks(page);
  const introduced = Boolean(beats[index]?.art && chooseLayout(beats[index] ?? emptyBeat()) === "reference");
  const pictureOpacity = art ? (introduced ? (progress < 0.2 ? 0 : 1) : 1) : 0;
  const revealed = revealedCount(writing.current.length, progress);
  return renderPng(
    sceneSvg(page, art, reference, writing.prior, writing.current, revealed, pictureOpacity),
  );
}

/** The finished white frame for each scene. */
export async function renderSolutionFrames(
  beats: SolutionBeat[],
  pictures: Map<string, Buffer> = new Map(),
): Promise<Buffer[]> {
  const frames: Buffer[] = [];
  for (let index = 0; index < beats.length; index += 1) {
    frames.push(await renderBeat(beats, index, pictures, 1));
  }
  return frames;
}

/** The claim and the equation appear in order while the reference stays put. */
export async function renderSolutionMotion(
  beats: SolutionBeat[],
  pictures: Map<string, Buffer> = new Map(),
): Promise<Buffer[][]> {
  const sequences: Buffer[][] = [];
  for (let index = 0; index < beats.length; index += 1) {
    const frames: Buffer[] = [];
    for (let step = 1; step <= WIPE_FRAMES; step += 1) {
      frames.push(await renderBeat(beats, index, pictures, step / WIPE_FRAMES));
    }
    sequences.push(frames);
  }
  return sequences;
}
