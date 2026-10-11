import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { generateLessonArt, usefulArt, WIPE_FRAMES } from "./alakh-motion.js";
import type { LessonSlide, SlidePlate } from "./alakh-slide-script.js";

const WIDTH = 1280;
const HEIGHT = 720;
const PAPER = "#FFFFFF";
const INK = "#1C1C1C";
const PLATE_LIMIT = 2;
const PLATE_BOX = { x: 48, y: 48, w: 384, h: 384 };
const WELL_GAP = 28;
const TEXT_SIZE = 26;
const MATH_EX = 28;

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const FONT_FILES = ["NotoSans-Regular.ttf", "NotoSansDevanagari-Regular.ttf"].map((name) =>
  join(FONT_DIR, name),
);

type MathSvg = { markup: string; width: number; height: number };
type WellBlock = { kind: "text"; line: string } | { kind: "math"; math: MathSvg };

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

function fontFamily(text: string): string {
  return /[\u0900-\u097F]/.test(text)
    ? "'Noto Sans Devanagari', 'Noto Sans'"
    : "'Noto Sans', 'Noto Sans Devanagari'";
}

function paintMath(svg: string, pxPerEx: number, maxWidth: number): MathSvg | null {
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
  const markup = inner.replace(/<svg[^>]*>/, open).replaceAll("currentColor", INK);
  return { markup, width, height };
}

/** Unique honest plates, at most two. The same wording is drawn once. */
export function plateCues(slides: LessonSlide[]): SlidePlate[] {
  const seen = new Set<string>();
  const cues: SlidePlate[] = [];
  for (const slide of slides) {
    const plate = slide.plate;
    if (!plate || seen.has(plate.id) || !usefulArt(plate.prompt)) continue;
    seen.add(plate.id);
    if (cues.length >= PLATE_LIMIT) continue;
    cues.push(plate);
  }
  return cues;
}

export function slideWell(hasPlate: boolean): { x: number; y: number; w: number } {
  if (!hasPlate) return { x: 64, y: 56, w: WIDTH - 128 };
  return {
    x: PLATE_BOX.x + PLATE_BOX.w + WELL_GAP,
    y: 56,
    w: WIDTH - (PLATE_BOX.x + PLATE_BOX.w + WELL_GAP) - 48,
  };
}

export async function generateSlidePlates(slides: LessonSlide[]): Promise<Map<string, Buffer>> {
  const plates = new Map<string, Buffer>();
  const cues = plateCues(slides);
  if (cues.length === 0) return plates;
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    console.error("Slide plates skipped: OPENROUTER_API_KEY is not set");
    return plates;
  }
  await Promise.all(
    cues.map(async (cue) => {
      try {
        plates.set(cue.id, await generateLessonArt(cue.prompt, "1:1"));
      } catch (error) {
        console.error("Slide plate skipped:", cue.id, error instanceof Error ? error.message : error);
      }
    }),
  );
  return plates;
}

async function wellBlocks(slide: LessonSlide, width: number): Promise<WellBlock[]> {
  const blocks: WellBlock[] = [];
  for (const line of slide.writes) {
    if (line.trim()) blocks.push({ kind: "text", line: line.trim() });
  }
  if (slide.math) {
    try {
      const engine = await loadJax();
      const painted = paintMath(engine.outerHTML(engine.convert(slide.math, { display: true })), MATH_EX, width);
      if (painted) blocks.push({ kind: "math", math: painted });
    } catch {
      blocks.push({ kind: "text", line: slide.math });
    }
  }
  return blocks;
}

function revealedCount(total: number, progress: number): number {
  if (total <= 0) return 0;
  if (progress >= 0.99) return total;
  return Math.max(1, Math.min(total, Math.ceil(progress * total)));
}

function slideSvg(
  slide: LessonSlide,
  plate: Buffer | undefined,
  blocks: WellBlock[],
  revealed: number,
): string {
  const shown = blocks.slice(0, revealed);
  const well = slideWell(Boolean(plate));
  const picture = plate
    ? `<image href="data:image/png;base64,${plate.toString("base64")}" x="${PLATE_BOX.x}" y="${PLATE_BOX.y}" width="${PLATE_BOX.w}" height="${PLATE_BOX.h}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  let y = well.y;
  const writing: string[] = [];
  for (const block of shown) {
    if (block.kind === "math") {
      y += 12;
      writing.push(`<g transform="translate(${well.x} ${y})">${block.math.markup}</g>`);
      y += block.math.height + 16;
      continue;
    }
    y += TEXT_SIZE;
    writing.push(
      `<text x="${well.x}" y="${y}" xml:space="preserve" fill="${INK}" font-family="${fontFamily(block.line)}" font-size="${TEXT_SIZE}">${xml(block.line)}</text>`,
    );
    y += 14;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  ${picture}
  ${writing.join("\n  ")}
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

async function renderSlide(
  slide: LessonSlide,
  plates: Map<string, Buffer>,
  progress: number,
): Promise<Buffer> {
  const plate = slide.plate ? plates.get(slide.plate.id) : undefined;
  const well = slideWell(Boolean(plate));
  const blocks = await wellBlocks(slide, well.w);
  return renderPng(slideSvg(slide, plate, blocks, revealedCount(blocks.length, progress)));
}

/** The finished frame of each slide. The plate is already in place. */
export async function renderSlideFrames(
  slides: LessonSlide[],
  plates: Map<string, Buffer> = new Map(),
): Promise<Buffer[]> {
  const frames: Buffer[] = [];
  for (const slide of slides) frames.push(await renderSlide(slide, plates, 1));
  return frames;
}

/** The plate stays. The well fills in the order he explains. */
export async function renderSlideMotion(
  slides: LessonSlide[],
  plates: Map<string, Buffer> = new Map(),
): Promise<Buffer[][]> {
  const sequences: Buffer[][] = [];
  for (const slide of slides) {
    const frames: Buffer[] = [];
    for (let step = 1; step <= WIPE_FRAMES; step += 1) {
      frames.push(await renderSlide(slide, plates, step / WIPE_FRAMES));
    }
    sequences.push(frames);
  }
  return sequences;
}
