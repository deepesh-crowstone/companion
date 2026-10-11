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
import { prepareBoards, renderBoardMotion, withoutBlankIntros } from "./alakh-board.js";
import {
  applyScriptReview,
  BOARD_SCRIPT_PROMPT,
  DIAGRAM_FIX_PROMPT,
  diagramFixRequest,
  equationsNotInSolution,
  parseBoardScript,
  parseDiagramFix,
  parseScriptReview,
  plainDiagram,
  SCRIPT_REVIEW_PROMPT,
  scriptReviewRequest,
  vagueDiagram,
  type LessonBoard,
  type ScriptChange,
} from "./alakh-board-script.js";
import { generateLessonPictures, motionDrawSeconds, openRouterKey } from "./alakh-motion.js";
import { renderSolutionFrames, renderSolutionMotion } from "./alakh-scene.js";
import { generateSlidePlates, renderSlideMotion } from "./alakh-slide.js";
import { parseSlideScript, SLIDE_SCRIPT_PROMPT, type LessonSlide } from "./alakh-slide-script.js";
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

/**
 * How a board video is shot. Steps of one board share a slow push-in toward
 * its focus; a new board is a cut. A pause holds a step a little longer.
 */
export type VideoDirection = {
  boards: number[];
  focus: { x: number; y: number }[];
  pauses: number[];
};

/** How far the camera pushes in over one board. */
export const CAMERA_PUSH = 0.06;

/** Where each step starts within its board, and how long its board lasts. */
export function cameraTimes(holds: number[], boards: number[]): { start: number; length: number }[] {
  const totals = new Map<number, number>();
  holds.forEach((hold, index) => {
    const board = boards[index] ?? index;
    totals.set(board, (totals.get(board) ?? 0) + hold);
  });
  const elapsed = new Map<number, number>();
  return holds.map((hold, index) => {
    const board = boards[index] ?? index;
    const start = elapsed.get(board) ?? 0;
    elapsed.set(board, start + hold);
    return { start, length: totals.get(board) ?? hold };
  });
}

/**
 * Frames are blended up to 24 fps so a written line flows instead of stepping,
 * then the camera moves. It pushes in on one board and eases back out on the
 * next, so a picture kept across the cut does not jump. The canvas is doubled
 * first so the move is smooth.
 */
export function cameraFilter(
  start: number,
  length: number,
  focus: { x: number; y: number },
  outward = false,
): string {
  const at = outward ? 1 - start / length : start / length;
  const zoom = (1 + CAMERA_PUSH * at).toFixed(5);
  const step = `${outward ? "-" : "+"}${(CAMERA_PUSH / (length * 24)).toFixed(7)}`;
  return [
    "fps=24",
    "scale=2560:1440:flags=bicubic",
    `zoompan=z='${zoom}${step}*on':x='(iw-iw/zoom)*${focus.x.toFixed(3)}':y='(ih-ih/zoom)*${focus.y.toFixed(3)}':d=1:s=1280x720:fps=24`,
  ].join(",");
}

export async function assembleSolutionVideo(
  sequences: Buffer[][],
  audioFiles: string[],
  workDir: string,
  direction?: VideoDirection,
): Promise<Buffer> {
  if (sequences.length === 0 || sequences.length !== audioFiles.length) {
    throw new Error("Video frames and audio do not match");
  }
  if (sequences.some((frames) => frames.length === 0)) {
    throw new Error("Video frames and audio do not match");
  }
  const durations: number[] = [];
  for (const file of audioFiles) durations.push(await probeDuration(file));
  const holds = slideDurations(durations).map((hold, index) => hold + (direction?.pauses[index] ?? 0));
  const times = direction ? cameraTimes(holds, direction.boards) : [];
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
    const time = times[index];
    const board = direction?.boards[index] ?? 0;
    const focus = direction?.focus[board];
    const blend = frames.length > 1 ? "framerate=fps=24:interp_start=0:interp_end=255:scene=100," : "";
    const camera = time && focus ? `,${cameraFilter(time.start, time.length, focus, board % 2 === 1)}` : "";
    const video = direction
      ? `[0:v]${blend}tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}${camera},format=yuv420p[v]`
      : `[0:v]tpad=stop_mode=clone:stop=${stop},format=yuv420p[v]`;
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
        `${video};[1:a]aformat=sample_rates=48000:channel_layouts=mono[speech];[2:a]aformat=sample_rates=48000:channel_layouts=mono[gap];[speech][gap]concat=n=2:v=0:a=1[a]`,
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
      "Alakh video script retrying with lighter reasoning:",
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
      ...(beat.marks?.length ? { marks: beat.marks } : {}),
      ...(beat.find ? { find: beat.find } : {}),
      ...(beat.givens?.length ? { givens: beat.givens } : {}),
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

async function recordNarration(
  text: string,
  config: AlakhTtsConfig,
  workDir: string,
  index: number,
): Promise<string> {
  const chunks = alakhSpeechChunks([text], VIDEO_SPEECH_CHARS);
  const pieces: Buffer[] = [];
  for (const chunk of chunks) pieces.push(await speakTake(chunk, config));
  if (pieces.length === 1) {
    const path = join(workDir, `beat-${index}.ogg`);
    await writeFile(path, pieces[0]);
    return path;
  }
  const partPaths: string[] = [];
  for (let part = 0; part < pieces.length; part += 1) {
    const path = join(workDir, `beat-${index}-${part}.ogg`);
    await writeFile(path, pieces[part]);
    partPaths.push(path);
  }
  const merged = join(workDir, `beat-${index}.ogg`);
  await joinAudio(partPaths, merged);
  return merged;
}

async function joinAudio(partPaths: string[], merged: string): Promise<void> {
  const labels = partPaths.map(
    (_path, part) => `[${part}:a]aformat=sample_rates=48000:channel_layouts=mono[a${part}]`,
  );
  const joined = partPaths.map((_path, part) => `[a${part}]`).join("");
  await run(
    ffmpegBin(),
    [
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
}

/** Slides are opt-in. The two-column page stays the video Telegram sends. */
export function solutionVideoUsesSlides(): boolean {
  return process.env.ALAKH_VIDEO_SLIDES?.trim() === "1";
}

/** Boards are opt-in and win over slides. */
export function solutionVideoUsesBoards(): boolean {
  return process.env.ALAKH_VIDEO_BOARD?.trim() === "1";
}

async function requestLessonScript(
  prompt: string,
  markdown: string,
  label: string,
  thinking: boolean,
): Promise<string> {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: markdown },
  ];
  try {
    return await replyChatCompletion(messages, {
      timeoutMs: 180_000,
      maxTokens: thinking ? 12288 : 8192,
      temperature: 0.3,
      retries: 0,
      thinking,
      label,
    });
  } catch (error) {
    console.error(
      `${label} retrying with lighter reasoning:`,
      error instanceof Error ? error.message : error,
    );
    return replyChatCompletion(messages, {
      timeoutMs: 180_000,
      maxTokens: 8192,
      temperature: 0.3,
      retries: 0,
      thinking: false,
      label,
    });
  }
}

/**
 * One thinking review of the whole script against the solution. Text that does
 * not match the solution is only a hint; the review decides what is wrong.
 * A failed review keeps the script as written.
 */
async function reviewBoardScript(boards: LessonBoard[], solution: string): Promise<ScriptChange[]> {
  const flagged = boards.flatMap((board) => equationsNotInSolution(board.lines, solution));
  const messages = [
    { role: "system", content: SCRIPT_REVIEW_PROMPT },
    { role: "user", content: scriptReviewRequest(boards, solution, flagged) },
  ];
  let raw: string;
  try {
    raw = await replyChatCompletion(messages, {
      timeoutMs: 180_000,
      maxTokens: 8192,
      temperature: 0.2,
      retries: 0,
      label: "Board script review",
    });
  } catch (error) {
    console.error(
      "Board script review retrying with lighter reasoning:",
      error instanceof Error ? error.message : error,
    );
    try {
      raw = await replyChatCompletion(messages, {
        timeoutMs: 90_000,
        maxTokens: 4096,
        temperature: 0.2,
        retries: 0,
        thinking: false,
        label: "Board script review",
      });
    } catch (retryError) {
      console.error(
        "Board script review skipped:",
        retryError instanceof Error ? retryError.message : retryError,
      );
      return [];
    }
  }
  const changes = parseScriptReview(raw);
  if (changes.length > 0) {
    console.error(
      "Board script reviewed:",
      changes.map((change) => `${change.action} ${change.board + 1}.${change.line + 1}`).join(", "),
    );
  }
  return changes;
}

/** One short rewrite for diagrams that point at another board or are boxes of text. Still vague means no diagram. */
async function repairDiagrams(boards: LessonBoard[], solution: string): Promise<string[]> {
  const diagrams = boards.map((board) => board.diagram);
  const wanted = boards.flatMap((board, index) => (vagueDiagram(board.diagram) ? [index] : []));
  if (wanted.length === 0) return diagrams;
  console.error("Board diagrams rewritten:", wanted.join(", "));
  try {
    const raw = await replyChatCompletion(
      [
        { role: "system", content: DIAGRAM_FIX_PROMPT },
        { role: "user", content: diagramFixRequest(boards, wanted, solution) },
      ],
      {
        timeoutMs: 60_000,
        maxTokens: 3072,
        temperature: 0.2,
        retries: 0,
        thinking: false,
        label: "Board diagram fix",
      },
    );
    const fixed = parseDiagramFix(raw);
    for (const index of wanted) {
      const diagram = fixed.get(index);
      if (diagram !== undefined) diagrams[index] = diagram;
    }
  } catch (error) {
    console.error("Board diagram fix failed:", error instanceof Error ? error.message : error);
  }
  return diagrams.map((diagram) => (vagueDiagram(diagram) ? "" : diagram));
}

async function boardDiagrams(boards: LessonBoard[], solution: string): Promise<string[]> {
  const diagrams = await repairDiagrams(boards, solution);
  return diagrams.map((diagram) => plainDiagram(diagram));
}

async function spokenNarration(text: string): Promise<string> {
  const plain = narrationWithoutLatex(text);
  try {
    return (await prepareAlakhNarration(plain)).trim() || plain;
  } catch (error) {
    console.error(
      "Alakh narration rewrite failed:",
      error instanceof Error ? error.message : error,
    );
    return plain;
  }
}

async function scriptBoards(markdown: string): Promise<LessonBoard[]> {
  const raw = await requestLessonScript(BOARD_SCRIPT_PROMPT, markdown, "Board script", true);
  const parsed = parseBoardScript(raw);
  const [diagrams, changes] = await Promise.all([
    boardDiagrams(parsed.boards, markdown),
    reviewBoardScript(parsed.boards, markdown),
  ]);
  const checked = applyScriptReview(
    parsed.boards.map((board, index) => ({ ...board, diagram: diagrams[index] ?? board.diagram })),
    changes,
  );
  const boards = await Promise.all(
    checked.map(async (board) => {
      const steps = await Promise.all(
        board.steps.map(async (step) => ({ ...step, narration: await spokenNarration(step.narration) })),
      );
      return { ...board, steps: steps.filter((step) => step.narration.trim()) };
    }),
  );
  return boards.filter((board) => board.steps.length > 0 && (board.lines.length > 0 || Boolean(board.diagram)));
}

async function scriptSlides(markdown: string): Promise<LessonSlide[]> {
  const raw = await requestLessonScript(SLIDE_SCRIPT_PROMPT, markdown, "Slide script", true);
  const parsed = parseSlideScript(raw);
  const slides: LessonSlide[] = [];
  for (const slide of parsed.slides) {
    const spoken = await spokenNarration(slide.narration);
    if (!spoken.trim()) continue;
    slides.push({ ...slide, narration: spoken });
  }
  return slides;
}

/**
 * The two-column page. The left pane keeps the reference. The right pane
 * writes the claim and the equation while Alakh Sir speaks.
 * Returns null when the voice server or ffmpeg is absent.
 */
export async function createPageVideo(markdown: string): Promise<Buffer | null> {
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
      audioFiles.push(await recordNarration(beat.narration, config, workDir, index));
    }
    return await assembleSolutionVideo(frames, audioFiles, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * The talk is written first, then cut into slides. Each plate stays still.
 * The well fills while Alakh Sir speaks that slide.
 * Returns null when the voice, ffmpeg, or the slide script is absent.
 */
export async function createSlideVideo(markdown: string): Promise<Buffer | null> {
  const config = readAlakhTtsConfig();
  if (!config || !(await ffmpegAvailable())) return null;
  const slides = await scriptSlides(markdown);
  if (slides.length === 0) return null;
  const plates = await generateSlidePlates(slides);
  const frames = await renderSlideMotion(slides, plates);
  const workDir = await mkdtemp(join(tmpdir(), "alakh-slides-"));
  try {
    const audioFiles: string[] = [];
    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index];
      if (!slide) continue;
      audioFiles.push(await recordNarration(slide.narration, config, workDir, index));
    }
    return await assembleSolutionVideo(frames, audioFiles, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * The talk is cut into boards. The image model draws only the pictures, and a
 * vision check reads each back. The title and every line are written in our
 * own hand while Alakh Sir explains them; marks point at what he names.
 * Returns null when the voice, ffmpeg, the image key, or the board script is absent.
 */
export async function createBoardVideo(markdown: string): Promise<Buffer | null> {
  const config = readAlakhTtsConfig();
  if (!config || !openRouterKey() || !(await ffmpegAvailable())) return null;
  const boards = await scriptBoards(markdown);
  if (boards.length === 0) return null;
  const steps = boards.flatMap((board) => board.steps);
  const workDir = await mkdtemp(join(tmpdir(), "alakh-boards-"));
  try {
    const [prepared, audioFiles] = await Promise.all([
      prepareBoards(boards, markdown),
      (async () => {
        const files: string[] = [];
        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index];
          if (step) files.push(await recordNarration(step.narration, config, workDir, index));
        }
        return files;
      })(),
    ]);
    const { boards: directed, groups } = withoutBlankIntros(prepared);
    const speech: string[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      const parts = (groups[index] ?? []).map((step) => audioFiles[step]).filter((path): path is string => Boolean(path));
      if (parts.length === 1 && parts[0]) {
        speech.push(parts[0]);
        continue;
      }
      const joined = join(workDir, `step-${index}.ogg`);
      await joinAudio(parts, joined);
      speech.push(joined);
    }
    const motion = renderBoardMotion(directed);
    return await assembleSolutionVideo(motion.sequences, speech, workDir, {
      boards: motion.boards,
      focus: motion.focus,
      pauses: motion.pauses,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Builds the explanation video. Boards run only when ALAKH_VIDEO_BOARD=1,
 * slides only when ALAKH_VIDEO_SLIDES=1. A failure falls through to the
 * next one, and the two-column page is always last.
 * Returns null when the voice server or ffmpeg is absent.
 */
export async function createSolutionVideo(markdown: string): Promise<Buffer | null> {
  if (solutionVideoUsesBoards()) {
    try {
      const video = await createBoardVideo(markdown);
      if (video) return video;
      console.error("Board video had no boards, trying the next video");
    } catch (error) {
      console.error(
        "Board video failed, trying the next video:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (solutionVideoUsesSlides()) {
    try {
      const video = await createSlideVideo(markdown);
      if (video) return video;
      console.error("Slide video had no slides, using the page");
    } catch (error) {
      console.error(
        "Slide video failed, using the page:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return createPageVideo(markdown);
}
