import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SolutionBeat } from "./alakh-video-script.js";

/** Frames in the stroke. The last frame is the finished scene. */
export const WIPE_FRAMES = 12;

export const LESSON_ART_MODEL = "recraft/recraft-v4.1-flash";

/** Distinct pictures in one lesson. The same wording is still drawn once. */
export const LESSON_PICTURE_LIMIT = 12;
const IMAGE_URL = "https://openrouter.ai/api/v1/images";

export type SceneLayout = "write" | "reference";

export type ArtCue = {
  id: string;
  prompt: string;
  aspect: "1:1" | "16:9";
};

/** How long the new claim and equation take to appear while he speaks. */
export function motionDrawSeconds(holdSeconds: number): number {
  return Math.min(Math.max(0.15, holdSeconds - 0.2), Math.max(0.8, holdSeconds * 0.65));
}

/** A named subject is drawn. A blank line is not a picture. */
export function usefulArt(prompt: string): boolean {
  const subject = prompt.trim();
  return subject.length > 0 && subject !== "-" && !/^none$/i.test(subject);
}

/**
 * The left pane is a reference only when a picture earned that space.
 * write: the writing column uses the width that remains after pinned givens.
 * reference: an object sits on the left, writing stays on the right.
 */
export function chooseLayout(beat: { art?: { prompt: string }; math?: string }): SceneLayout {
  if (!beat.art || !usefulArt(beat.art.prompt)) return "write";
  return "reference";
}

export function lessonArtPrompt(subject: string): string {
  return [
    "Educational diagram on a pure white background.",
    "Crisp shapes, soft natural colors, generous empty margin, the setup drawn clearly.",
    "Arrows and simple parts are welcome when the subject needs them.",
    "A label, if any, is one or two English words.",
    "No border, no watermark, no sentences, no equations, no paragraphs.",
    `Subject: ${subject}.`,
  ].join(" ");
}

/** First-seen pictures, capped, with the aspect ratio their layout needs. */
export function lessonArtCues(beats: SolutionBeat[]): ArtCue[] {
  const seen = new Set<string>();
  const cues: ArtCue[] = [];
  for (const beat of beats) {
    const art = beat.art;
    if (!art || seen.has(art.id) || !usefulArt(art.prompt)) continue;
    seen.add(art.id);
    if (cues.length >= LESSON_PICTURE_LIMIT) continue;
    cues.push({
      id: art.id,
      prompt: art.prompt,
      aspect: "1:1",
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
