import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SolutionBeat } from "./alakh-video-script.js";

/** Frames in the stroke. The last frame is the finished scene. */
export const WIPE_FRAMES = 12;

export const LESSON_ART_MODEL = "recraft/recraft-v4.1-flash";

const ART_LIMIT = 8;
const IMAGE_URL = "https://openrouter.ai/api/v1/images";

export type SceneLayout = "type" | "split" | "stack";

export type ArtCue = {
  id: string;
  prompt: string;
  aspect: "1:1" | "16:9";
};

/** How long the new words, equation, and picture take to stroke on. */
export function motionDrawSeconds(holdSeconds: number): number {
  return Math.min(1.15, Math.max(0.35, holdSeconds * 0.5));
}

/**
 * The picture's place is chosen here, then the on-screen sentence is written
 * to fit the space that remains.
 * type: words and the equation alone, centered.
 * split: one object on the left, the explanation on the right.
 * stack: a wide diagram on top, the explanation underneath.
 */
export function chooseLayout(beat: { art?: { prompt: string }; math: string }): SceneLayout {
  if (!beat.art) return "type";
  if (/^diagram\b/i.test(beat.art.prompt.trim()) || beat.math.length > 70) return "stack";
  return "split";
}

export function lessonArtPrompt(subject: string): string {
  return [
    "Flat educational illustration on a pure white background.",
    "Crisp shapes, soft natural colors, generous empty margin, one clear subject.",
    "No border, no watermark, no equations, no sentences, no paragraphs.",
    "A label, if any, is one or two words, written in English, naming a part.",
    "Do not add extra lines, arrows, or marks the subject did not name.",
    `Subject: ${subject}.`,
  ].join(" ");
}

/** First-seen pictures, capped, with the aspect ratio their layout needs. */
export function lessonArtCues(beats: SolutionBeat[]): ArtCue[] {
  const seen = new Set<string>();
  const cues: ArtCue[] = [];
  for (const beat of beats) {
    const art = beat.art;
    if (!art || seen.has(art.id)) continue;
    seen.add(art.id);
    if (cues.length >= ART_LIMIT) continue;
    cues.push({
      id: art.id,
      prompt: art.prompt,
      aspect: chooseLayout(beat) === "stack" ? "16:9" : "1:1",
    });
  }
  return cues;
}

function openRouterKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  return key || null;
}

async function postImage(body: Record<string, unknown>, key: string): Promise<Buffer> {
  const response = await fetch(IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Lesson picture failed: ${response.status} ${err.slice(0, 280)}`);
  }
  const data = (await response.json()) as {
    data?: { b64_json?: string | null; url?: string | null }[];
  };
  const image = data.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const fetched = await fetch(image.url, { signal: AbortSignal.timeout(30_000) });
    if (!fetched.ok) throw new Error(`Lesson picture failed: ${fetched.status}`);
    return Buffer.from(await fetched.arrayBuffer());
  }
  throw new Error("Lesson picture failed: empty image");
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** Recraft often returns WebP even when PNG is requested. The canvas only embeds PNG. */
export async function lessonPicturePng(bytes: Buffer): Promise<Buffer> {
  if (isPng(bytes)) return bytes;
  const dir = await mkdtemp(join(tmpdir(), "lesson-art-"));
  try {
    const src = join(dir, "in.bin");
    const dest = join(dir, "out.png");
    await writeFile(src, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.env.FFMPEG_PATH?.trim() || "ffmpeg",
        ["-y", "-loglevel", "error", "-i", src, dest],
        { stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("Lesson picture could not be converted to PNG"));
      });
    });
    return await readFile(dest);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function generateLessonArt(subject: string, aspect: ArtCue["aspect"]): Promise<Buffer> {
  const key = openRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const base = {
    model: LESSON_ART_MODEL,
    prompt: lessonArtPrompt(subject),
    aspect_ratio: aspect,
    output_format: "png",
    background: "opaque",
  };
  try {
    return lessonPicturePng(
      await postImage({ ...base, image_config: { background_rgb_color: [255, 255, 255] } }, key),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("400")) throw error;
    return lessonPicturePng(await postImage(base, key));
  }
}

/** One Recraft drawing per object. A missing key or a failed picture is skipped. */
export async function generateLessonPictures(beats: SolutionBeat[]): Promise<Map<string, Buffer>> {
  const pictures = new Map<string, Buffer>();
  const cues = lessonArtCues(beats);
  if (cues.length === 0) return pictures;
  if (!openRouterKey()) {
    console.error("Lesson pictures skipped: OPENROUTER_API_KEY is not set");
    return pictures;
  }
  await Promise.all(
    cues.map(async (cue) => {
      try {
        pictures.set(cue.id, await generateLessonArt(cue.prompt, cue.aspect));
      } catch (error) {
        console.error(
          "Lesson picture skipped:",
          cue.id,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
  return pictures;
}
