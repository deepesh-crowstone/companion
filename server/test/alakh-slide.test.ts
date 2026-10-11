import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { holdPlates, plateCues, renderSlideFrames, renderSlideMotion, slideWell } from "../src/alakh-slide.ts";
import { parseSlideScript, SLIDE_SCRIPT_PROMPT } from "../src/alakh-slide-script.ts";
import { solutionVideoUsesSlides } from "../src/alakh-video.ts";

const SCRIPT = `EXPLAIN
The strip is ten centimetres. Then we write the damping.

SLIDE
Plate: a metal strip
Say: The strip is ten centimetres long. Watch the strip.
Write: The strip is ten centimetres
Write: We need the number of cycles
Math: $l = 0.1\\,\\mathrm{m}$
SLIDE
Plate: -
Say: Damping comes from the field. Write only that formula.
Write: Damping comes from the field
Math: $b = \\frac{B^{2} l^{2}}{R}$
SLIDE
Plate: a metal strip
Say: The same strip stays on the plate.
Write: The object stays
Math: -`;

test("the explanation is written first, then cut into slides", () => {
  const lesson = parseSlideScript(SCRIPT);
  assert.match(lesson.explain, /ten centimetres/);
  assert.equal(lesson.slides.length, 3);
  assert.equal(lesson.slides[0]?.plate?.id, "a-metal-strip");
  assert.deepEqual(lesson.slides[0]?.writes, [
    "The strip is ten centimetres",
    "We need the number of cycles",
  ]);
  assert.match(lesson.slides[0]?.math ?? "", /0\.1/);
  assert.equal(lesson.slides[1]?.plate, undefined);
  assert.equal(holdPlates(lesson.slides)[1]?.plate?.id, "a-metal-strip");
  assert.match(lesson.slides[1]?.math ?? "", /\\frac/);
  assert.equal(lesson.slides[2]?.plate?.id, "a-metal-strip");
  assert.equal(slideWell(false).x, 64);
  assert.ok(slideWell(true).x > 400);
  assert.deepEqual(
    plateCues(lesson.slides).map((plate) => plate.id),
    ["a-metal-strip"],
  );
  assert.match(SLIDE_SCRIPT_PROMPT, /Write is the claim/);
  assert.match(SLIDE_SCRIPT_PROMPT, /Devanagari/);
});

test("slides stay off unless the flag is set", () => {
  const previous = process.env.ALAKH_VIDEO_SLIDES;
  delete process.env.ALAKH_VIDEO_SLIDES;
  assert.equal(solutionVideoUsesSlides(), false);
  process.env.ALAKH_VIDEO_SLIDES = "1";
  assert.equal(solutionVideoUsesSlides(), true);
  if (previous === undefined) delete process.env.ALAKH_VIDEO_SLIDES;
  else process.env.ALAKH_VIDEO_SLIDES = previous;
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

function darkCount(path: string, x: number, y: number, w: number, h: number): number {
  const probed = spawnSync("ffmpeg", [
    "-loglevel",
    "error",
    "-i",
    path,
    "-vf",
    `crop=${w}:${h}:${x}:${y}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  assert.equal(probed.status, 0);
  const bytes = probed.stdout;
  assert.ok(Buffer.isBuffer(bytes));
  let dark = 0;
  for (let index = 0; index < bytes.length; index += 3) {
    if ((bytes[index] ?? 255) < 80) dark += 1;
  }
  return dark;
}

test("the plate stays while the well writes the next line", async () => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return;
  const sticker = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="70" fill="#1F4B99"/></svg>`,
  )
    .render()
    .asPng();
  const slides = parseSlideScript(SCRIPT).slides;
  const first = slides[0];
  assert.ok(first);
  const plates = new Map([[first.plate?.id ?? "", sticker]]);
  const sequences = await renderSlideMotion([first], plates);
  const early = sequences[0]?.[0];
  const late = sequences[0]?.[sequences[0].length - 1];
  assert.ok(early && late);
  await writeFile("/tmp/alakh-slide-early.png", early);
  await writeFile("/tmp/alakh-slide-late.png", late);
  const earlyPlate = pixel("/tmp/alakh-slide-early.png", 240, 240);
  const latePlate = pixel("/tmp/alakh-slide-late.png", 240, 240);
  assert.ok(earlyPlate[2] > 120 && earlyPlate[0] < 80, `early plate ${earlyPlate.join(",")}`);
  assert.ok(latePlate[2] > 120 && latePlate[0] < 80, `late plate ${latePlate.join(",")}`);
  const earlyInk = darkCount("/tmp/alakh-slide-early.png", 470, 112, 420, 36);
  const lateInk = darkCount("/tmp/alakh-slide-late.png", 470, 112, 420, 36);
  assert.ok(lateInk > earlyInk + 20, `well ink early ${earlyInk} late ${lateInk}`);
  const finished = await renderSlideFrames(slides.slice(1, 2));
  await writeFile("/tmp/alakh-slide-plain.png", finished[0] ?? Buffer.alloc(0));
  const corner = pixel("/tmp/alakh-slide-plain.png", 8, 8);
  const occupied = pixel("/tmp/alakh-slide-plain.png", 240, 240);
  assert.ok(corner[0] > 245 && corner[1] > 245 && corner[2] > 245, `paper ${corner.join(",")}`);
  assert.ok(occupied[2] < 80, `well-only has no plate ${occupied.join(",")}`);
});
