import assert from "node:assert/strict";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { readRaster, shrinkImageForVision, VISION_MAX_EDGE } from "../src/vision-image.ts";

function png(width: number, height: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/></svg>`;
  return Buffer.from(new Resvg(svg).render().asPng());
}

test("a large photo is shrunk so the longest side is 1024", () => {
  const fitted = shrinkImageForVision(png(2000, 800), "image/png");
  const size = readRaster(fitted.bytes);
  assert.equal(fitted.mimeType, "image/png");
  assert.equal(size?.width, VISION_MAX_EDGE);
  assert.equal(size?.height, 410);
});

test("a small upright photo is sent unchanged", () => {
  const original = png(320, 240);
  const fitted = shrinkImageForVision(original, "image/png");
  assert.equal(fitted.bytes.equals(original), true);
  assert.equal(fitted.mimeType, "image/png");
});

test("jpeg size and orientation are read from the header", () => {
  const exif = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const app1Length = 2 + exif.length;
  const image = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, app1Length >> 8, app1Length & 0xff]),
    exif,
    Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x00, 0x02, 0x80, 0x01, 0x01, 0x11, 0x00]),
  ]);
  assert.deepEqual(readRaster(image), { width: 640, height: 1024, orientation: 6 });
});

test("a file that is not an image is left unchanged", () => {
  const original = Buffer.from("question-photo");
  const fitted = shrinkImageForVision(original, "image/jpeg");
  assert.equal(fitted.bytes.equals(original), true);
  assert.equal(fitted.mimeType, "image/jpeg");
});
