import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  narrationWithoutLatex,
  parseSolutionBeats,
  slideDurations,
  SOLUTION_VIDEO_SCRIPT_PROMPT,
} from "../src/alakh-video-script.ts";
import { assembleSolutionVideo, renderSolutionFrames } from "../src/alakh-video.ts";

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
    const video = await assembleSolutionVideo(frames, audio, workDir);
    assert.equal(video.subarray(4, 8).toString(), "ftyp");
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
