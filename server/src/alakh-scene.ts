import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { chooseLayout, WIPE_FRAMES, type SceneLayout } from "./alakh-motion.js";
import type { SolutionBeat } from "./alakh-video-script.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PAPER = "#FFFFFF";
const INK = "#1C1C1C";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const FONT_FILES = ["NotoSans-Regular.ttf", "NotoSansDevanagari-Regular.ttf"].map((name) =>
  join(FONT_DIR, name),
);

type MathSvg = { markup: string; width: number; height: number };

type Block =
  | { kind: "text"; lines: string[]; size: number; color: string }
  | { kind: "math"; math: MathSvg };

type Box = { x: number; y: number; w: number; h: number };

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

function glyphWidth(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x0900 && code <= 0x097f ? size * 0.92 : size * 0.52;
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

function fitText(
  text: string,
  width: number,
  maxSize: number,
  maxLines: number,
): { lines: string[]; size: number } {
  for (let size = maxSize; size >= 26; size -= 2) {
    const lines = wrapLines(text, size, width);
    if (lines.length <= maxLines) return { lines, size };
  }
  return { lines: wrapLines(text, 26, width).slice(0, maxLines), size: 26 };
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

async function mathBlock(
  tex: string,
  color: string,
  pxPerEx: number,
  maxWidth: number,
): Promise<Block | null> {
  try {
    const engine = await loadJax();
    const node = engine.convert(tex, { display: true });
    const painted = paintMath(engine.outerHTML(node), color, pxPerEx, maxWidth);
    if (painted) return { kind: "math", math: painted };
  } catch {
    // A broken formula stays on the canvas as text.
  }
  return null;
}

function blockHeight(block: Block): number {
  if (block.kind === "math") return block.math.height + 36;
  return block.lines.length * Math.round(block.size * 1.45);
}

function textColumn(layout: SceneLayout): {
  x: number;
  width: number;
  top: number;
  bottom: number;
  align: "start" | "middle";
} {
  if (layout === "split") return { x: 656, width: 560, top: 80, bottom: 600, align: "start" };
  if (layout === "stack") return { x: 80, width: 1120, top: 448, bottom: 680, align: "middle" };
  return { x: 120, width: 1040, top: 80, bottom: 660, align: "middle" };
}

function artBox(layout: SceneLayout): Box | null {
  if (layout === "split") return { x: 48, y: 48, w: 560, h: 560 };
  if (layout === "stack") return { x: 64, y: 28, w: 1152, h: 400 };
  return null;
}

async function sceneBlocks(beat: SolutionBeat, layout: SceneLayout): Promise<Block[]> {
  const column = textColumn(layout);
  const textSize = layout === "type" ? 52 : layout === "split" ? 40 : 36;
  const mathEx = layout === "type" ? 58 : layout === "split" ? 36 : 40;
  const maxLines = layout === "stack" ? 2 : layout === "split" ? 4 : 3;
  const blocks: Block[] = [];
  if (beat.text) {
    const fitted = fitText(beat.text, column.width, textSize, maxLines);
    blocks.push({ kind: "text", lines: fitted.lines, size: fitted.size, color: INK });
  }
  if (beat.math) {
    const hero = await mathBlock(beat.math, INK, mathEx, column.width);
    blocks.push(
      hero ?? {
        kind: "text",
        lines: wrapLines(beat.math, textSize, column.width).slice(0, 2),
        size: textSize,
        color: INK,
      },
    );
  }
  return blocks;
}

function placeBlocks(blocks: Block[], layout: SceneLayout): { y: number } {
  const column = textColumn(layout);
  const height = blocks.reduce((sum, block) => sum + blockHeight(block), 0);
  if (layout === "stack") return { y: column.top };
  const room = column.bottom - column.top;
  return { y: column.top + Math.max(0, Math.round((room - height) / 2)) };
}

function wordsMarkup(blocks: Block[], layout: SceneLayout): string {
  const column = textColumn(layout);
  let y = placeBlocks(blocks, layout).y;
  const anchor = column.align === "middle" ? column.x + column.width / 2 : column.x;
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "math") {
      y += 18;
      const x = column.align === "middle" ? column.x + (column.width - block.math.width) / 2 : column.x;
      parts.push(`<g transform="translate(${x} ${y})">${block.math.markup}</g>`);
      y += block.math.height + 18;
      continue;
    }
    const gap = Math.round(block.size * 0.45);
    for (const line of block.lines) {
      y += block.size;
      parts.push(
        `<text x="${anchor}" y="${y}" text-anchor="${column.align}" fill="${block.color}" font-family="Noto Sans, Noto Sans Devanagari" font-size="${block.size}">${xml(line)}</text>`,
      );
      y += gap;
    }
  }
  return parts.join("\n  ");
}

function sceneSvg(
  blocks: Block[],
  layout: SceneLayout,
  art: { dataUri: string } | null,
  progress: number,
): string {
  const column = textColumn(layout);
  const picture = artBox(layout);
  const wordsWidth = Math.max(2, Math.round(column.width * progress));
  const artWidth = picture ? Math.max(2, Math.round(picture.w * progress)) : 0;
  const pictureMarkup =
    picture && art
      ? `<clipPath id="art"><rect x="${picture.x}" y="${picture.y}" width="${artWidth}" height="${picture.h}"/></clipPath>
  <g clip-path="url(#art)">
    <image href="${art.dataUri}" x="${picture.x}" y="${picture.y}" width="${picture.w}" height="${picture.h}" preserveAspectRatio="xMidYMid meet"/>
  </g>`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  ${pictureMarkup}
  <clipPath id="words"><rect x="${column.x}" y="0" width="${wordsWidth}" height="${HEIGHT}"/></clipPath>
  <g clip-path="url(#words)">
    ${wordsMarkup(blocks, layout)}
  </g>
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

function layoutOf(beat: SolutionBeat, pictures: Map<string, Buffer>): SceneLayout {
  if (!beat.art || !pictures.has(beat.art.id)) return "type";
  return chooseLayout(beat);
}

async function renderBeat(
  beats: SolutionBeat[],
  index: number,
  pictures: Map<string, Buffer>,
  progress: number,
): Promise<Buffer> {
  const beat = beats[index];
  if (!beat) return renderPng(sceneSvg([], "type", null, 1));
  const layout = layoutOf(beat, pictures);
  const blocks = await sceneBlocks(beat, layout);
  const png = beat.art ? pictures.get(beat.art.id) : undefined;
  const art = png ? { dataUri: `data:image/png;base64,${png.toString("base64")}` } : null;
  return renderPng(sceneSvg(blocks, layout, art, progress));
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

/** The picture, the sentence, and the equation stroke on together. */
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
