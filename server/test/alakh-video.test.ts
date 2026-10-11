import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { chooseLayout, lessonArtCues, lessonArtPrompt, lessonPicturePng } from "../src/alakh-motion.ts";
import { lessonPage } from "../src/alakh-scene.ts";
import {
  lessonMemory,
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

test("a picture stays out of the equation, and the words are a separate line", () => {
  const beats = parseSolutionBeats(`BEAT
Say: The leaf takes in light. It happens in the green part of the plant. Watch the leaf.
Text: Light enters the leaf
Math: -
Find: rate
Given: green leaf
Art: a single leaf
Mark: leaf=A
BEAT
Say: The damping constant comes from the field and the resistance. Write only that formula. Then stop.
Text: Damping comes from the field
Math: $b = \\frac{B^{2} l^{2}}{R}$
Art: -`);
  assert.equal(beats[0]?.text, "Light enters the leaf");
  assert.equal(beats[0]?.math, "");
  assert.equal(beats[0]?.art?.id, "a-single-leaf");
  assert.equal(beats[0]?.find, "rate");
  assert.deepEqual(beats[0]?.givens, ["green leaf"]);
  assert.deepEqual(beats[0]?.marks, [{ part: "leaf", symbol: "A" }]);
  assert.equal(chooseLayout(beats[0] ?? { math: "" }), "reference");
  assert.equal(beats[1]?.text, "Damping comes from the field");
  assert.match(beats[1]?.math ?? "", /\\frac/);
  assert.equal(beats[1]?.art, undefined);
  assert.equal(chooseLayout({ art: { prompt: "Diagram of the circuit" }, math: "" }), "reference");
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /Never put an equation in Art/);
  assert.match(lessonArtPrompt("a leaf"), /no equations/);
  assert.match(SOLUTION_VIDEO_SCRIPT_PROMPT, /almost every beat/);
  const cues = lessonArtCues([
    { narration: "a", display: "a", text: "a", math: "", art: { id: "sun", prompt: "a sun" } },
    { narration: "b", display: "b", text: "b", math: "", art: { id: "sun", prompt: "a sun" } },
    { narration: "c", display: "c", text: "c", math: "", art: { id: "leaf", prompt: "a leaf" } },
    { narration: "d", display: "d", text: "d", math: "", art: { id: "tree", prompt: "a tree" } },
  ]);
  assert.deepEqual(
    cues.map((cue) => cue.id),
    ["sun", "leaf", "tree"],
  );
  assert.equal(cues[0]?.aspect, "1:1");
  const memory = lessonMemory(beats, 1);
  assert.equal(memory.find, "rate");
  assert.deepEqual(memory.givens, ["green leaf"]);
  assert.equal(memory.art?.id, "a-single-leaf");
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

test("a webp lesson picture is converted to png before it is placed", async () => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return;
  const png = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#1F4B99"/></svg>`,
  )
    .render()
    .asPng();
  const dir = await mkdtemp(join(tmpdir(), "alakh-webp-"));
  try {
    const src = join(dir, "in.png");
    const dest = join(dir, "out.webp");
    await writeFile(src, png);
    const made = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, dest], { stdio: "ignore" });
    assert.equal(made.status, 0);
    const webp = await readFile(dest);
    assert.equal(webp.subarray(0, 4).toString(), "RIFF");
    const converted = await lessonPicturePng(webp);
    assert.equal(converted.subarray(1, 4).toString(), "PNG");
    const same = await lessonPicturePng(png);
    assert.equal(same, png);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the canvas is white, and the picture strokes on from the left", async () => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return;

  const sticker = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="70" fill="#1F4B99"/></svg>`,
  )
    .render()
    .asPng();
  const beats = [
    {
      narration: "The sun sends light to the leaf.",
      display: "Sunlight",
      text: "Sunlight",
      math: "",
      art: { id: "sun", prompt: "a sun" },
    },
  ];
  const still = await renderSolutionFrames(beats);
  await writeFile("/tmp/alakh-scene-still.png", still[0] ?? Buffer.alloc(0));
  const paper = pixel("/tmp/alakh-scene-still.png", 8, 8);
  assert.ok(paper[0] > 245 && paper[1] > 245 && paper[2] > 245, `paper ${paper.join(",")}`);

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
    // The object sits in the left reference. It is held back for the first fifth of the take.
    const hidden = pixel(early, 232, 210);
    const shown = pixel(late, 232, 210);
    assert.ok(hidden[0] > 220, `early picture pixel ${hidden.join(",")}`);
    assert.ok(shown[0] < 60 && shown[2] > 120, `late picture pixel ${shown.join(",")}`);
    await writeFile("/tmp/alakh-motion-early.png", await readFile(early));
    await writeFile("/tmp/alakh-motion-late.png", await readFile(late));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("givens stay on the left while the right column adds a line", async () => {
  const sticker = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="70" fill="#1F4B99"/></svg>`,
  )
    .render()
    .asPng();
  const beats = [
    {
      narration: "The length is ten centimetres.",
      display: "length",
      text: "The strip is ten centimetres long",
      math: "l = 0.1 m",
      givens: ["l = 0.1 m"],
      find: "N",
      art: { id: "sun", prompt: "a sun" },
    },
    {
      narration: "Write the damping constant.",
      display: "damping",
      text: "Damping comes from the field",
      math: String.raw`b = \frac{B^{2} l^{2}}{R}`,
    },
  ];
  const pictures = new Map([["sun", sticker]]);
  const first = lessonPage(beats, 0, pictures);
  const second = lessonPage(beats, 1, pictures);
  assert.equal(first.leftWidth, 384);
  assert.equal(second.leftWidth, 384);
  assert.equal(second.hasPicture, true);
  assert.equal(second.find, "N");
  assert.deepEqual(second.givens, ["l = 0.1 m"]);
  const frames = await renderSolutionFrames(beats, pictures);
  await writeFile("/tmp/alakh-page-given.png", frames[0] ?? Buffer.alloc(0));
  await writeFile("/tmp/alakh-page-work.png", frames[1] ?? Buffer.alloc(0));
  const hindi = await renderSolutionFrames([
    {
      narration: "length",
      display: "length",
      text: "स्ट्रिप की लंबाई",
      math: String.raw`l = 0.1\,\mathrm{m}`,
    },
  ]);
  await writeFile("/tmp/alakh-page-hindi.png", hindi[0] ?? Buffer.alloc(0));
});
