import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { chalkFromLineArt, drawingCues, drawingPrompt, planFrames } from "../src/alakh-motion.ts";
import {
  narrationWithoutLatex,
  parseSolutionBeats,
  slideDurations,
  SOLUTION_VIDEO_SCRIPT_PROMPT,
} from "../src/alakh-video-script.ts";
import { assembleSolutionVideo, renderSolutionFrames, renderSolutionMotion } from "../src/alakh-video.ts";

const SCRIPT = `BEAT
Say: स्ट्रिप की लंबाई 10 सेंटीमीटर है और स्प्रिंग कॉन्स्टेंट 0.5 है।
Show: $l = 0.1\\,\\mathrm{m}$
BEAT
Say: डैम्पिंग बहुत हल्की है, इसलिए पीरियड लगभग वही रहता है।
Show: $$b = \\frac{B^{2} l^{2}}{R} = 10^{-5}$$
BEAT
Say: एम्प्लीट्यूड e गुना गिरने में 10000 सेकंड लगते हैं, इसलिए N 5000 के पास है।
Show: $$N \\approx 5000$$`;

test("a solution script becomes ordered board beats", () => {
  const beats = parseSolutionBeats(SCRIPT);
  assert.equal(beats.length, 3);
  assert.match(beats[0]?.narration ?? "", /10 सेंटीमीटर/);
  assert.match(beats[1]?.display ?? "", /\\frac/);
  assert.match(beats[2]?.display ?? "", /5000/);
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /Devanagari/);
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /what it is asking/);
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /one equation/);
});

test("a packed board line is revealed one item at a time", () => {
  const beats = parseSolutionBeats(`BEAT
Say: Length is 10 cm. The spring constant is 0.5. The field is 0.1 tesla. Resistance is 10 ohm.
Show: l = 0.1 m, k = 0.5 N/m, B = 0.1 T, R = 10 ohm
BEAT
Say: First write the damping constant. Then the time to fall by a factor of e.
Show: $$b = \\frac{B^{2} l^{2}}{R}$$
$$t = 10000$$`);
  assert.equal(beats.length, 6);
  assert.equal(beats[0]?.display, "l = 0.1 m");
  assert.match(beats[0]?.narration ?? "", /Length is 10 cm/);
  assert.equal(beats[3]?.display, "R = 10 ohm");
  assert.match(beats[4]?.display ?? "", /\\frac/);
  assert.match(beats[4]?.narration ?? "", /damping constant/);
  assert.match(beats[5]?.display ?? "", /10000/);
  assert.match(beats[5]?.narration ?? "", /factor of e/);
});

test("extra beats keep the final answer", () => {
  const blocks = Array.from({ length: 43 }, (_item, index) => {
    return `BEAT\nSay: step ${index}.\nShow: equation ${index}`;
  });
  blocks.push("BEAT\nSay: final.\nShow: $$N = 5000$$");
  const beats = parseSolutionBeats(blocks.join("\n"));
  assert.equal(beats.length, 40);
  assert.match(beats[39]?.display ?? "", /5000/);
});

test("spoken math drops TeX commands", () => {
  assert.equal(
    narrationWithoutLatex("time is $$t = \\frac{2m}{b}$$ seconds"),
    "time is t = 2m b seconds",
  );
});

test("each slide holds for the narration plus a pause", () => {
  assert.deepEqual(slideDurations([2, 3]), [2.45, 4.2]);
});

test("a drawing is a separate object, not part of the board line", () => {
  const beats = parseSolutionBeats(`BEAT
Say: The leaf takes in light. It happens in the green part of the plant.
Show: Light enters the leaf
Draw: a single leaf
At: centre
BEAT
Say: First the length. Then the constant. Then the field. Then the resistance.
Show: l = 0.1 m, k = 0.5 N/m
Draw: a single leaf`);
  assert.equal(beats[0]?.display, "Light enters the leaf");
  assert.equal(beats[0]?.draw?.id, "a-single-leaf");
  assert.equal(beats[0]?.draw?.place, "center");
  assert.equal(beats[1]?.draw?.id, "a-single-leaf");
  assert.equal(beats[2]?.draw, undefined);
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /Do not Draw equations/);
});

test("drawings stay, then a stage shot replaces them", () => {
  const plans = planFrames([
    { draw: { id: "sun", place: "left" } },
    { draw: { id: "leaf", place: "center" } },
    {},
    { draw: { id: "tree", place: "stage" } },
    { draw: { id: "tree", place: "stage" } },
  ]);
  assert.equal(plans[0]?.kind, "row");
  assert.equal(plans[0]?.sprites[0]?.reveal, true);
  assert.equal(plans[1]?.sprites.length, 2);
  assert.equal(plans[1]?.sprites.find((sprite) => sprite.id === "sun")?.reveal, false);
  assert.equal(plans[1]?.sprites.find((sprite) => sprite.id === "leaf")?.reveal, true);
  assert.equal(plans[2]?.sprites.every((sprite) => !sprite.reveal), true);
  assert.equal(plans[3]?.kind, "stage");
  assert.deepEqual(
    plans[3]?.sprites.map((sprite) => sprite.id),
    ["tree"],
  );
  assert.equal(plans[3]?.sprites[0]?.reveal, true);
  assert.equal(plans[4]?.sprites[0]?.reveal, false);
  const cues = drawingCues([
    { draw: { id: "sun", prompt: "a sun", place: "left" } },
    { draw: { id: "sun", prompt: "a sun", place: "left" } },
    { draw: { id: "leaf", prompt: "a leaf", place: "center" } },
  ]);
  assert.deepEqual(
    cues.map((cue) => cue.id),
    ["sun", "leaf"],
  );
  assert.match(drawingPrompt("a leaf", false), /plain white background/);
  assert.match(drawingPrompt("a leaf", true), /<image_0>/);
});

test("frames reveal the steps and mux into one video", async () => {
  const beats = parseSolutionBeats(SCRIPT);
  const frames = await renderSolutionFrames(beats);
  assert.equal(frames.length, 3);
  for (const frame of frames) {
    assert.equal(frame.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
  await writeFile("/tmp/alakh-board-last.png", frames[frames.length - 1]);
  await writeFile("/tmp/alakh-board-first.png", frames[0]);
  const sized = await renderSolutionFrames([
    { narration: "The length is ten centimetres.", display: "Length of the strip" },
    { narration: "The answer is about five thousand.", display: "$$N \\approx 5000$$" },
    {
      narration: "Damping constant from the field and resistance.",
      display: "$$b = \\frac{B^{2} l^{2}}{R}$$",
    },
  ]);
  await writeFile("/tmp/alakh-board-sizes.png", sized[sized.length - 1]);

  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return;
  const workDir = await mkdtemp(join(tmpdir(), "alakh-video-test-"));
  try {
    const audio = [0.4, 0.5, 0.6].map((seconds, index) => join(workDir, `a${index}.ogg`));
    for (let index = 0; index < audio.length; index += 1) {
      const made = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-t",
          String([0.4, 0.5, 0.6][index]),
          "-i",
          "anullsrc=r=48000:cl=mono",
          "-c:a",
          "libopus",
          audio[index],
        ],
        { stdio: "ignore" },
      );
      assert.equal(made.status, 0);
    }
    const sequences = await renderSolutionMotion(beats);
    assert.equal(sequences.length, 3);
    assert.equal(sequences[0]?.length, 12);
    const video = await assembleSolutionVideo(sequences, audio, workDir);
    assert.equal(video.subarray(4, 8).toString(), "ftyp");
    const out = join(workDir, "out.mp4");
    await writeFile(out, video);
    const probed = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
      { encoding: "utf8" },
    );
    if (probed.status === 0) {
      const seconds = Number(probed.stdout.trim());
      assert.ok(seconds > 3 && seconds < 4.5, `video duration ${seconds}`);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

function pixel(path: string, x: number, y: number): [number, number, number, number] {
  const probed = spawnSync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-i",
      path,
      "-vf",
      `crop=1:1:${x}:${y}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
  );
  assert.equal(probed.status, 0);
  const bytes = probed.stdout;
  assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 4);
  return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0];
}

test("marker art becomes chalk, and the new drawing strokes on", async () => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return;

  const line = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#ffffff"/><circle cx="40" cy="40" r="16" fill="#000000"/></svg>`,
  )
    .render()
    .asPng();
  const chalk = await chalkFromLineArt(line);
  const chalkPath = "/tmp/alakh-chalk.png";
  await writeFile(chalkPath, chalk);
  const ink = pixel(chalkPath, 40, 40);
  const paper = pixel(chalkPath, 4, 4);
  assert.ok(ink[3] > 200, `chalk center alpha ${ink[3]}`);
  assert.ok(paper[3] < 20, `paper alpha ${paper[3]}`);

  const sticker = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="70" fill="#F4F7FB"/></svg>`,
  )
    .render()
    .asPng();
  const beats = [
    {
      narration: "The sun sends light to the leaf.",
      display: "Sunlight",
      draw: { id: "sun", prompt: "a sun", place: "right" as const },
    },
  ];
  const sequences = await renderSolutionMotion(beats, new Map([["sun", sticker]]));
  const workDir = await mkdtemp(join(tmpdir(), "alakh-motion-"));
  try {
    const audio = join(workDir, "a.ogg");
    const made = spawnSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-t", "1.5", "-i", "anullsrc=r=48000:cl=mono", "-c:a", "libopus", audio],
      { stdio: "ignore" },
    );
    assert.equal(made.status, 0);
    const video = await assembleSolutionVideo(sequences, [audio], workDir);
    const out = join(workDir, "out.mp4");
    await writeFile(out, video);
    const early = join(workDir, "early.png");
    const late = join(workDir, "late.png");
    for (const [at, dest] of [
      ["0", early],
      ["2.0", late],
    ] as const) {
      const shot = spawnSync(
        "ffmpeg",
        ["-y", "-i", out, "-ss", at, "-frames:v", "1", dest],
        { stdio: "ignore" },
      );
      assert.equal(shot.status, 0);
    }
    // Right-hand sun sits near the middle of its box. The stroke has not reached it yet.
    const hidden = pixel(early, 1060, 186);
    const shown = pixel(late, 1060, 186);
    assert.ok(hidden[0] < 40, `early sprite pixel ${hidden.join(",")}`);
    assert.ok(shown[0] > 200, `late sprite pixel ${shown.join(",")}`);
    await writeFile("/tmp/alakh-motion-early.png", await readFile(early));
    await writeFile("/tmp/alakh-motion-late.png", await readFile(late));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
