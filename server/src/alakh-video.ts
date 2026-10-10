import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { alakhSpeechChunks, readAlakhTtsConfig, synthesizeAlakhSpeech } from "./alakh-tts.js";
import {
  narrationWithoutLatex,
  parseSolutionBeats,
  slideDurations,
  SOLUTION_VIDEO_BEAT_GAP_SECONDS,
  SOLUTION_VIDEO_END_GAP_SECONDS,
  SOLUTION_VIDEO_SCRIPT_PROMPT,
  type SolutionBeat,
} from "./alakh-video-script.js";
import { replyChatCompletion } from "./reply-client.js";
import { prepareAlakhNarration } from "./xai.js";

const WIDTH = 1280;
const HEIGHT = 720;
const LEFT = 80;
const BOARD_BOTTOM = 660;
const BOARD_TOP = 56;
const TEXT_WIDTH = 1120;
const BOARD = "#0B1020";
const INK = "#F4F7FB";
const MUTED = "#8E98AA";
const ACCENT = "#E8B86D";

type MathSvg = { markup: string; width: number; height: number };

type Row =
  | { type: "label"; text: string; size: number; color: string }
  | { type: "text"; text: string; size: number; color: string }
  | { type: "math"; math: MathSvg };

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

type Piece =
  | { kind: "text"; text: string }
  | { kind: "math"; tex: string; display: boolean };

function piecesOf(display: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
  let last = 0;
  for (const match of display.matchAll(pattern)) {
    const before = display.slice(last, match.index).trim();
    if (before) pieces.push({ kind: "text", text: before });
    const tex = (match[1] ?? match[2] ?? "").trim();
    if (tex) pieces.push({ kind: "math", tex, display: match[1] != null });
    last = (match.index ?? 0) + match[0].length;
  }
  const rest = display.slice(last).trim();
  if (rest) pieces.push({ kind: "text", text: rest });
  if (pieces.length === 0 && display.trim()) pieces.push({ kind: "text", text: display.trim() });
  return pieces;
}

function wrapLines(text: string, size: number): string[] {
  const maxChars = Math.max(16, Math.floor(TEXT_WIDTH / (size * 0.52)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 5);
}

function paintMath(svg: string, color: string, heightPx: number): MathSvg | null {
  const inner = svg.match(/<svg[\s\S]*<\/svg>/)?.[0];
  if (!inner || inner.includes("data-mjx-error")) return null;
  const box = inner.match(/viewBox="([^"]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
  if (!box || box.length < 4 || !box[2] || !box[3]) return null;
  let height = heightPx;
  let width = Math.max(8, Math.round((height * box[2]) / box[3]));
  if (width > TEXT_WIDTH) {
    height = Math.max(32, Math.round((height * TEXT_WIDTH) / width));
    width = Math.max(8, Math.round((height * box[2]) / box[3]));
  }
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box.join(" ")}">`;
  const markup = inner.replace(/<svg[^>]*>/, open).replaceAll("currentColor", color);
  return { markup, width, height };
}

async function mathRow(tex: string, display: boolean, color: string, height: number): Promise<Row> {
  try {
    const engine = await loadJax();
    const node = engine.convert(tex, { display });
    const painted = paintMath(engine.outerHTML(node), color, height);
    if (painted) return { type: "math", math: painted };
  } catch {
    // A broken formula stays on the board as text.
  }
  return { type: "text", text: tex, size: display ? 32 : 26, color };
}

async function rowsForBeat(beat: SolutionBeat, index: number, current: boolean): Promise<Row[]> {
  const color = current ? INK : MUTED;
  const textSize = current ? 32 : 24;
  const mathHeight = current ? 108 : 58;
  const rows: Row[] = [];
  if (current) {
    rows.push({ type: "label", text: `Step ${index + 1}`, size: 22, color: ACCENT });
  }
  for (const piece of piecesOf(beat.display)) {
    if (piece.kind === "text") {
      for (const line of wrapLines(piece.text, textSize)) {
        rows.push({ type: "text", text: line, size: textSize, color });
      }
    } else {
      rows.push(await mathRow(piece.tex, piece.display, color, piece.display ? mathHeight : mathHeight - 16));
    }
  }
  return rows;
}

function rowHeight(row: Row): number {
  if (row.type === "math") return row.math.height + 16;
  return row.size + 14;
}

function slideSvg(rows: Row[], index: number, total: number): string {
  let y = BOARD_TOP;
  const body: string[] = [];
  for (const row of rows) {
    if (row.type === "math") {
      y += 8;
      body.push(`<g transform="translate(${LEFT} ${y})">${row.math.markup}</g>`);
      y += row.math.height + 8;
      continue;
    }
    y += row.size;
    body.push(
      `<text x="${LEFT}" y="${y}" fill="${row.color}" font-family="sans-serif" font-size="${row.size}">${xml(row.text)}</text>`,
    );
    y += 14;
  }
  const progress = Math.max(24, Math.round((TEXT_WIDTH * (index + 1)) / total));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BOARD}"/>
  <rect x="0" y="0" width="8" height="${HEIGHT}" fill="${ACCENT}"/>
  ${body.join("\n  ")}
  <rect x="${LEFT}" y="692" width="${TEXT_WIDTH}" height="4" rx="2" fill="#1C2436"/>
  <rect x="${LEFT}" y="692" width="${progress}" height="4" rx="2" fill="${ACCENT}"/>
</svg>`;
}

function fits(rows: Row[]): boolean {
  const height = rows.reduce((sum, row) => sum + rowHeight(row), 0);
  return BOARD_TOP + height <= BOARD_BOTTOM;
}

/** One PNG per beat. Each frame adds the new step and keeps what still fits above it. */
export async function renderSolutionFrames(beats: SolutionBeat[]): Promise<Buffer[]> {
  const font = process.platform === "linux" ? "Liberation Sans" : "Helvetica";
  const frames: Buffer[] = [];
  for (let index = 0; index < beats.length; index += 1) {
    const groups = await Promise.all(
      beats.slice(0, index + 1).map((beat, beatIndex) => rowsForBeat(beat, beatIndex, beatIndex === index)),
    );
    let start = 0;
    while (start < groups.length - 1 && !fits(groups.slice(start).flat())) start += 1;
    const svg = slideSvg(groups.slice(start).flat(), index, beats.length);
    const png = new Resvg(svg, {
      background: BOARD,
      font: {
        loadSystemFonts: true,
        sansSerifFamily: font,
        defaultFontFamily: font,
      },
    })
      .render()
      .asPng();
    frames.push(png);
  }
  return frames;
}

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 90_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed: ${stderr.slice(-500)}`));
    });
  });
}

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function ffprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || "ffprobe";
}

let ffmpegReady: Promise<boolean> | null = null;

export function ffmpegAvailable(): Promise<boolean> {
  if (!ffmpegReady) {
    ffmpegReady = run(ffmpegBin(), ["-version"]).then(
      () => true,
      () => false,
    );
  }
  return ffmpegReady;
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await run(ffprobeBin(), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Could not read audio duration");
  }
  return seconds;
}

export async function assembleSolutionVideo(
  frames: Buffer[],
  audioFiles: string[],
  workDir: string,
): Promise<Buffer> {
  if (frames.length === 0 || frames.length !== audioFiles.length) {
    throw new Error("Video frames and audio do not match");
  }
  const durations: number[] = [];
  for (const file of audioFiles) durations.push(await probeDuration(file));
  const holds = slideDurations(durations);
  const framePaths: string[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const path = join(workDir, `frame-${index}.png`);
    await writeFile(path, frames[index]);
    framePaths.push(path);
  }

  const videoArgs = ["-y"];
  for (let index = 0; index < framePaths.length; index += 1) {
    videoArgs.push(
      "-loop",
      "1",
      "-framerate",
      "30",
      "-t",
      holds[index].toFixed(3),
      "-i",
      framePaths[index],
    );
  }
  const videoChain = framePaths.map((_path, index) => `[${index}:v]`).join("");
  const silentVideo = join(workDir, "silent.mp4");
  videoArgs.push(
    "-filter_complex",
    `${videoChain}concat=n=${framePaths.length}:v=1:a=0,format=yuv420p[v]`,
    "-map",
    "[v]",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    silentVideo,
  );
  await run(ffmpegBin(), videoArgs);

  const audioArgs = ["-y"];
  const audioLabels: string[] = [];
  let inputIndex = 0;
  for (let index = 0; index < audioFiles.length; index += 1) {
    audioArgs.push("-i", audioFiles[index]);
    audioLabels.push(`[${inputIndex}:a]`);
    inputIndex += 1;
    const gap =
      index === audioFiles.length - 1
        ? SOLUTION_VIDEO_END_GAP_SECONDS
        : SOLUTION_VIDEO_BEAT_GAP_SECONDS;
    audioArgs.push("-f", "lavfi", "-t", gap.toFixed(3), "-i", "anullsrc=r=48000:cl=mono");
    audioLabels.push(`[${inputIndex}:a]`);
    inputIndex += 1;
  }
  const narration = join(workDir, "narration.ogg");
  const formatted = audioLabels.map((label, index) => `${label}aformat=sample_rates=48000:channel_layouts=mono[a${index}]`);
  const concat = audioLabels.map((_label, index) => `[a${index}]`).join("");
  audioArgs.push(
    "-filter_complex",
    `${formatted.join(";")};${concat}concat=n=${audioLabels.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    "-c:a",
    "libopus",
    "-b:a",
    "64k",
    "-ar",
    "48000",
    "-ac",
    "1",
    narration,
  );
  await run(ffmpegBin(), audioArgs);

  const output = join(workDir, "solution.mp4");
  await run(ffmpegBin(), [
    "-y",
    "-i",
    silentVideo,
    "-i",
    narration,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  ]);
  return readFile(output);
}

async function scriptBeats(markdown: string): Promise<SolutionBeat[]> {
  const raw = await replyChatCompletion(
    [
      { role: "system", content: SOLUTION_VIDEO_SCRIPT_PROMPT },
      { role: "user", content: markdown },
    ],
    { timeoutMs: 120_000, maxTokens: 8192, temperature: 0.3, label: "Video script" },
  );
  const parsed = parseSolutionBeats(raw);
  const beats: SolutionBeat[] = [];
  for (const beat of parsed) {
    const spoken = await prepareAlakhNarration(narrationWithoutLatex(beat.narration));
    if (!spoken.trim()) continue;
    beats.push({ narration: spoken, display: beat.display });
  }
  return beats;
}

/**
 * Builds the board video for a written solution: each step appears while
 * Alakh Sir speaks it. Returns null when the voice server or ffmpeg is absent.
 */
export async function createSolutionVideo(markdown: string): Promise<Buffer | null> {
  const config = readAlakhTtsConfig();
  if (!config || !(await ffmpegAvailable())) return null;
  const beats = await scriptBeats(markdown);
  if (beats.length === 0) throw new Error("Video script had no beats");
  const frames = await renderSolutionFrames(beats);
  const workDir = await mkdtemp(join(tmpdir(), "alakh-solution-"));
  try {
    const audioFiles: string[] = [];
    for (let index = 0; index < beats.length; index += 1) {
      const chunks = alakhSpeechChunks([beats[index].narration]);
      const pieces: Buffer[] = [];
      for (const chunk of chunks) pieces.push(await synthesizeAlakhSpeech(chunk, config));
      if (pieces.length === 1) {
        const path = join(workDir, `beat-${index}.ogg`);
        await writeFile(path, pieces[0]);
        audioFiles.push(path);
        continue;
      }
      const partPaths: string[] = [];
      for (let part = 0; part < pieces.length; part += 1) {
        const path = join(workDir, `beat-${index}-${part}.ogg`);
        await writeFile(path, pieces[part]);
        partPaths.push(path);
      }
      const merged = join(workDir, `beat-${index}.ogg`);
      const labels = partPaths.map(
        (_path, part) => `[${part}:a]aformat=sample_rates=48000:channel_layouts=mono[a${part}]`,
      );
      const joined = partPaths.map((_path, part) => `[a${part}]`).join("");
      await run(ffmpegBin(), [
        "-y",
        ...partPaths.flatMap((path) => ["-i", path]),
        "-filter_complex",
        `${labels.join(";")};${joined}concat=n=${partPaths.length}:v=0:a=1[out]`,
        "-map",
        "[out]",
        "-c:a",
        "libopus",
        merged,
      ]);
      audioFiles.push(merged);
    }
    return await assembleSolutionVideo(frames, audioFiles, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
