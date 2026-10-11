import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  alakhSpeechChunks,
  readAlakhTtsConfig,
  synthesizeAlakhSpeech,
  type AlakhTtsConfig,
} from "./alakh-tts.js";
import { generateLessonPictures, motionDrawSeconds } from "./alakh-motion.js";
import { renderSolutionFrames, renderSolutionMotion } from "./alakh-scene.js";
import {
  narrationWithoutLatex,
  parseSolutionBeats,
  slideDurations,
  SOLUTION_VIDEO_SCRIPT_PROMPT,
  type SolutionBeat,
} from "./alakh-video-script.js";
import { replyChatCompletion } from "./reply-client.js";
import { prepareAlakhNarration } from "./xai.js";

export { renderSolutionFrames, renderSolutionMotion };

function run(
  command: string,
  args: string[],
  timeoutMs = 90_000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
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
      else if (timedOut) reject(new Error(`${command} timed out after ${timeoutMs}ms`));
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
  sequences: Buffer[][],
  audioFiles: string[],
  workDir: string,
): Promise<Buffer> {
  if (sequences.length === 0 || sequences.length !== audioFiles.length) {
    throw new Error("Video frames and audio do not match");
  }
  if (sequences.some((frames) => frames.length === 0)) {
    throw new Error("Video frames and audio do not match");
  }
  const durations: number[] = [];
  for (const file of audioFiles) durations.push(await probeDuration(file));
  const holds = slideDurations(durations);
  const clipPaths: string[] = [];
  for (let index = 0; index < sequences.length; index += 1) {
    const frames = sequences[index] ?? [];
    const beatDir = join(workDir, `beat-${index}`);
    await mkdir(beatDir, { recursive: true });
    for (let frame = 0; frame < frames.length; frame += 1) {
      const png = frames[frame];
      if (!png) continue;
      await writeFile(join(beatDir, `f${String(frame + 1).padStart(3, "0")}.png`), png);
    }
    const hold = holds[index] ?? 0.4;
    const pad = Math.max(0.05, hold - durations[index]);
    const draw = Math.min(motionDrawSeconds(hold), hold);
    const fps = frames.length / draw;
    const stop = Math.max(0, Math.ceil((hold - draw) * fps - 1e-3));
    const clip = join(workDir, `clip-${index}.mp4`);
    const encodeMs = Math.min(10 * 60_000, Math.max(60_000, Math.ceil(hold * 8_000)));
    const audio = audioFiles[index];
    if (!audio) throw new Error("Video frames and audio do not match");
    await run(
      ffmpegBin(),
      [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        fps.toFixed(3),
        "-start_number",
        "1",
        "-i",
        join(beatDir, "f%03d.png"),
        "-i",
        audio,
        "-f",
        "lavfi",
        "-t",
        pad.toFixed(3),
        "-i",
        "anullsrc=r=48000:cl=mono",
        "-filter_complex",
        `[0:v]tpad=stop_mode=clone:stop=${stop},format=yuv420p[v];[1:a]aformat=sample_rates=48000:channel_layouts=mono[speech];[2:a]aformat=sample_rates=48000:channel_layouts=mono[gap];[speech][gap]concat=n=2:v=0:a=1[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        hold.toFixed(3),
        "-r",
        "24",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "1",
        "-ar",
        "48000",
        clip,
      ],
      encodeMs,
    );
    clipPaths.push(clip);
  }

  const listPath = join(workDir, "clips.txt");
  const list = clipPaths
    .map((path) => `file '${path.replaceAll("'", "'\\''")}'`)
    .join("\n");
  await writeFile(listPath, list);
  const output = join(workDir, "solution.mp4");
  const totalSeconds = holds.reduce((sum, hold) => sum + hold, 0);
  await run(
    ffmpegBin(),
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ],
    Math.min(10 * 60_000, Math.max(60_000, Math.ceil(totalSeconds * 1_000))),
  );
  return readFile(output);
}

async function requestScript(markdown: string, thinking: boolean): Promise<string> {
  return replyChatCompletion(
    [
      { role: "system", content: SOLUTION_VIDEO_SCRIPT_PROMPT },
      { role: "user", content: markdown },
    ],
    {
      timeoutMs: 180_000,
      maxTokens: thinking ? 12288 : 8192,
      temperature: 0.3,
      retries: 0,
      thinking,
      label: "Video script",
    },
  );
}

async function scriptBeats(markdown: string): Promise<SolutionBeat[]> {
  let raw: string;
  try {
    raw = await requestScript(markdown, true);
  } catch (error) {
    console.error(
      "Alakh video script retrying without a thinking trace:",
      error instanceof Error ? error.message : error,
    );
    raw = await requestScript(markdown, false);
  }
  const parsed = parseSolutionBeats(raw);
  const beats: SolutionBeat[] = [];
  for (const beat of parsed) {
    const plain = narrationWithoutLatex(beat.narration);
    let spoken = plain;
    try {
      spoken = (await prepareAlakhNarration(plain)).trim() || plain;
    } catch (error) {
      console.error(
        "Alakh narration rewrite failed:",
        error instanceof Error ? error.message : error,
      );
    }
    if (!spoken.trim()) continue;
    beats.push({
      narration: spoken,
      display: beat.display,
      text: beat.text,
      math: beat.math,
      ...(beat.art ? { art: beat.art } : {}),
    });
  }
  return beats;
}

/** A long lesson is spoken in short takes so one slow clip cannot abort the video. */
const VIDEO_SPEECH_CHARS = 240;

async function speakTake(text: string, config: AlakhTtsConfig): Promise<Buffer> {
  let last: Error = new Error("Alakh TTS failed");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await synthesizeAlakhSpeech(text, config);
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw last;
}

/**
 * Builds the explanation video. Each scene is a white frame: the picture,
 * the short explanation, and the equation stroke on while Alakh Sir speaks.
 * Returns null when the voice server or ffmpeg is absent.
 */
export async function createSolutionVideo(markdown: string): Promise<Buffer | null> {
  const config = readAlakhTtsConfig();
  if (!config || !(await ffmpegAvailable())) return null;
  const beats = await scriptBeats(markdown);
  if (beats.length === 0) throw new Error("Video script had no beats");
  const pictures = await generateLessonPictures(beats);
  const frames = await renderSolutionMotion(beats, pictures);
  const workDir = await mkdtemp(join(tmpdir(), "alakh-solution-"));
  try {
    const audioFiles: string[] = [];
    for (let index = 0; index < beats.length; index += 1) {
      const beat = beats[index];
      if (!beat) continue;
      const chunks = alakhSpeechChunks([beat.narration], VIDEO_SPEECH_CHARS);
      const pieces: Buffer[] = [];
      for (const chunk of chunks) pieces.push(await speakTake(chunk, config));
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
        "-loglevel",
        "error",
        ...partPaths.flatMap((path) => ["-i", path]),
        "-filter_complex",
        `${labels.join(";")};${joined}concat=n=${partPaths.length}:v=0:a=1[out]`,
        "-map",
        "[out]",
        "-c:a",
        "libopus",
        merged,
      ],
      120_000,
      );
      audioFiles.push(merged);
    }
    return await assembleSolutionVideo(frames, audioFiles, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
