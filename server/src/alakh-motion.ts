import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DrawCue, DrawPlace } from "./alakh-video-script.js";
import {
  editImage,
  generateImage,
  IMAGINE_MODEL_FAST,
  type GeneratedImage,
} from "./imagine-client.js";

/** Frames in the stroke. The last frame is the finished board. */
export const WIPE_FRAMES = 12;

const DRAWING_LIMIT = 8;

const DRAWING_STYLE =
  "Simple handmade doodle, thick black marker on a plain white background, one object only, centered, no letters, no numbers, no labels, no border, no scenery, no shadow.";

export type SpriteBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stroke this object on during the beat. Objects already on the board stay put. */
  reveal: boolean;
};

export type FramePlan = {
  kind: "plain" | "row" | "stage";
  sprites: SpriteBox[];
};

const ROW_BOX: Record<"left" | "center" | "right", { x: number; y: number; w: number; h: number }> = {
  left: { x: 70, y: 36, w: 300, h: 300 },
  center: { x: 490, y: 36, w: 300, h: 300 },
  right: { x: 910, y: 36, w: 300, h: 300 },
};

const STAGE_BOX = { x: 400, y: 20, w: 480, h: 480 };

/** How long the new line and the new drawing take to stroke on. */
export function motionDrawSeconds(holdSeconds: number): number {
  return Math.min(1.15, Math.max(0.35, holdSeconds * 0.5));
}

export function boardTop(kind: FramePlan["kind"]): number {
  if (kind === "stage") return 516;
  if (kind === "row") return 356;
  return 56;
}

/**
 * Where each drawing sits on this beat.
 * A repeated name stays. stage clears the row and shows one object large.
 */
export function planFrames(beats: Array<{ draw?: { id: string; place: DrawPlace } }>): FramePlan[] {
  let mode: FramePlan["kind"] = "plain";
  let stageId: string | null = null;
  const row = new Map<"left" | "center" | "right", string>();
  const plans: FramePlan[] = [];

  for (const beat of beats) {
    let revealId: string | null = null;
    const draw = beat.draw;
    if (draw?.place === "stage") {
      const already = mode === "stage" && stageId === draw.id && row.size === 0;
      row.clear();
      mode = "stage";
      if (!already) revealId = draw.id;
      stageId = draw.id;
    } else if (draw) {
      const slot = draw.place;
      const leavingStage = mode === "stage";
      if (leavingStage) {
        stageId = null;
        row.clear();
      }
      for (const [key, id] of row) {
        if (id === draw.id && key !== slot) row.delete(key);
      }
      if (row.get(slot) !== draw.id || leavingStage) revealId = draw.id;
      row.set(slot, draw.id);
      mode = "row";
    }

    if (mode === "stage" && stageId) {
      plans.push({
        kind: "stage",
        sprites: [{ id: stageId, ...STAGE_BOX, reveal: revealId === stageId }],
      });
      continue;
    }
    if (mode === "row") {
      const sprites = (["left", "center", "right"] as const)
        .filter((slot) => row.has(slot))
        .map((slot) => {
          const id = row.get(slot) ?? "";
          return { id, ...ROW_BOX[slot], reveal: revealId === id };
        });
      plans.push({ kind: "row", sprites });
      continue;
    }
    plans.push({ kind: "plain", sprites: [] });
  }
  return plans;
}

/** First-seen objects, capped, in the order they should be generated. */
export function drawingCues(beats: Array<{ draw?: DrawCue }>): DrawCue[] {
  const seen = new Set<string>();
  const cues: DrawCue[] = [];
  for (const beat of beats) {
    const draw = beat.draw;
    if (!draw || seen.has(draw.id)) continue;
    seen.add(draw.id);
    if (cues.length >= DRAWING_LIMIT) continue;
    cues.push(draw);
  }
  return cues;
}

export function drawingPrompt(subject: string, anchored: boolean): string {
  const object = `Object: ${subject}.`;
  if (!anchored) return `${DRAWING_STYLE} ${object}`;
  return `Same thick black marker style as <image_0>, plain white background, one object only, centered, no letters, no numbers, no labels, no scenery. ${object}`;
}

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function run(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else if (timedOut) reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      else reject(new Error(`${command} failed: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Black marker on white becomes light chalk on a transparent background,
 * so the doodle sits on the dark board.
 */
export async function chalkFromLineArt(input: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "alakh-chalk-"));
  const source = join(workDir, "line.png");
  const output = join(workDir, "chalk.png");
  try {
    await writeFile(source, input);
    await run(
      ffmpegBin(),
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        source,
        "-vf",
        "format=rgba,geq=r=244:g=247:b=251:a='clip((200-max(max(r(X\\,Y)\\,g(X\\,Y))\\,b(X\\,Y)))*4\\,0\\,255)'",
        "-frames:v",
        "1",
        output,
      ],
      30_000,
    );
    return await readFile(output);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function drawSubject(subject: string, anchor: GeneratedImage | null): Promise<GeneratedImage> {
  const options = {
    model: IMAGINE_MODEL_FAST,
    aspectRatio: "1:1" as const,
    resolution: "1k" as const,
    retries: 0,
    timeoutMs: 45_000,
    label: "Lesson drawing",
  };
  if (!anchor) return generateImage(drawingPrompt(subject, false), options);
  return editImage(drawingPrompt(subject, true), [anchor], options);
}

/** One chalk sticker per object. Later objects follow the first drawing's line weight. */
export async function generateChalkSprites(cues: DrawCue[]): Promise<Map<string, Buffer>> {
  const sprites = new Map<string, Buffer>();
  if (cues.length === 0) return sprites;
  const [first, ...rest] = cues;
  if (!first) return sprites;
  let anchor: GeneratedImage | null = null;
  try {
    const image = await drawSubject(first.prompt, null);
    sprites.set(first.id, await chalkFromLineArt(image.bytes));
    anchor = image;
  } catch (error) {
    console.error(
      "Lesson drawing skipped:",
      first.id,
      error instanceof Error ? error.message : error,
    );
  }
  if (!anchor) return sprites;
  const style = anchor;
  await Promise.all(
    rest.map(async (cue) => {
      try {
        const image = await drawSubject(cue.prompt, style);
        sprites.set(cue.id, await chalkFromLineArt(image.bytes));
      } catch (error) {
        console.error(
          "Lesson drawing skipped:",
          cue.id,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
  return sprites;
}
