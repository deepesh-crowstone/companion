import { Resvg } from "@resvg/resvg-js";

/** Longest side sent to Qwen vision. Larger photos are scaled down first. */
export const VISION_MAX_EDGE = 1024;

type Raster = { width: number; height: number; orientation: number };

/**
 * Shrink a photo so its longest side is at most maxEdge pixels, and turn a
 * sideways JPEG upright. A file that is already small and upright is unchanged.
 * A file that cannot be read is returned as it arrived.
 */
export function shrinkImageForVision(
  image: Buffer,
  mimeType: string,
  maxEdge = VISION_MAX_EDGE,
): { bytes: Buffer; mimeType: string } {
  const mime = mimeType || "image/jpeg";
  const limit = maxEdge > 0 ? maxEdge : VISION_MAX_EDGE;
  try {
    const raster = readRaster(image);
    if (!raster) return { bytes: image, mimeType: mime };
    const upright = uprightBox(raster);
    const longest = Math.max(upright.width, upright.height);
    const needsTurn = raster.orientation >= 2 && raster.orientation <= 8;
    if (longest <= limit && !needsTurn) {
      return { bytes: image, mimeType: mime };
    }
    const scale = Math.min(1, limit / longest);
    const targetWidth = Math.max(1, Math.round(upright.width * scale));
    const href = `data:${mime};base64,${image.toString("base64")}`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${upright.width}" height="${upright.height}" viewBox="0 0 ${upright.width} ${upright.height}">
  <g transform="${orientationMatrix(raster.orientation, raster.width, raster.height)}">
    <image href="${href}" width="${raster.width}" height="${raster.height}"/>
  </g>
</svg>`;
    const rendered = new Resvg(svg, {
      fitTo: { mode: "width", value: targetWidth },
      background: "white",
    }).render();
    return { bytes: Buffer.from(rendered.asPng()), mimeType: "image/png" };
  } catch {
    return { bytes: image, mimeType: mime };
  }
}

export function visionImageUrl(image: Buffer, mimeType: string, maxEdge = VISION_MAX_EDGE): string {
  const fitted = shrinkImageForVision(image, mimeType, maxEdge);
  return `data:${fitted.mimeType};base64,${fitted.bytes.toString("base64")}`;
}

/** Pixel size and EXIF orientation. Orientation 1 means the pixels are already upright. */
export function readRaster(image: Buffer): Raster | null {
  const png = pngSize(image);
  if (png) return png;
  const jpeg = jpegSize(image);
  if (jpeg) return jpeg;
  const gif = gifSize(image);
  if (gif) return gif;
  return webpSize(image);
}

function uprightBox(raster: Raster): { width: number; height: number } {
  if (raster.orientation >= 5 && raster.orientation <= 8) {
    return { width: raster.height, height: raster.width };
  }
  return { width: raster.width, height: raster.height };
}

/** Canvas orientation matrices, with the SVG y axis pointing down. */
function orientationMatrix(orientation: number, width: number, height: number): string {
  switch (orientation) {
    case 2:
      return `matrix(-1 0 0 1 ${width} 0)`;
    case 3:
      return `matrix(-1 0 0 -1 ${width} ${height})`;
    case 4:
      return `matrix(1 0 0 -1 0 ${height})`;
    case 5:
      return `matrix(0 1 1 0 0 0)`;
    case 6:
      return `matrix(0 1 -1 0 ${height} 0)`;
    case 7:
      return `matrix(0 -1 -1 0 ${height} ${width})`;
    case 8:
      return `matrix(0 -1 1 0 0 ${width})`;
    default:
      return "matrix(1 0 0 1 0 0)";
  }
}

function pngSize(image: Buffer): Raster | null {
  if (image.length < 24) return null;
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (image.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width < 1 || height < 1) return null;
  return { width, height, orientation: 1 };
}

function gifSize(image: Buffer): Raster | null {
  const magic = image.toString("ascii", 0, 6);
  if (magic !== "GIF87a" && magic !== "GIF89a") return null;
  if (image.length < 10) return null;
  const width = image.readUInt16LE(6);
  const height = image.readUInt16LE(8);
  if (width < 1 || height < 1) return null;
  return { width, height, orientation: 1 };
}

function webpSize(image: Buffer): Raster | null {
  if (image.length < 30) return null;
  if (image.toString("ascii", 0, 4) !== "RIFF") return null;
  if (image.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = image.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + image.readUIntLE(24, 3);
    const height = 1 + image.readUIntLE(27, 3);
    if (width < 1 || height < 1) return null;
    return { width, height, orientation: 1 };
  }
  if (chunk === "VP8 ") {
    const width = image.readUInt16LE(26) & 0x3fff;
    const height = image.readUInt16LE(28) & 0x3fff;
    if (width < 1 || height < 1) return null;
    return { width, height, orientation: 1 };
  }
  return null;
}

function jpegSize(image: Buffer): Raster | null {
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8) return null;
  let offset = 2;
  let orientation = 1;
  let width = 0;
  let height = 0;
  while (offset + 3 < image.length) {
    if (image[offset] !== 0xff) return width > 0 ? { width, height, orientation } : null;
    const marker = image[offset + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = image.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > image.length) break;
    if (marker === 0xe1) {
      orientation = exifOrientation(image.subarray(offset + 4, offset + 2 + length)) ?? orientation;
    }
    if (marker >= 0xc0 && marker <= 0xc3 && length >= 7) {
      height = image.readUInt16BE(offset + 5);
      width = image.readUInt16BE(offset + 7);
    }
    offset += 2 + length;
    if (marker === 0xda) break;
  }
  if (width < 1 || height < 1) return null;
  return { width, height, orientation };
}

function exifOrientation(segment: Buffer): number | null {
  if (segment.length < 16 || segment.toString("ascii", 0, 6) !== "Exif\0\0") return null;
  const tiff = segment.subarray(6);
  const order = tiff.toString("ascii", 0, 2);
  const little = order === "II";
  if (!little && order !== "MM") return null;
  const u16 = (start: number) => (little ? tiff.readUInt16LE(start) : tiff.readUInt16BE(start));
  const u32 = (start: number) => (little ? tiff.readUInt32LE(start) : tiff.readUInt32BE(start));
  if (tiff.length < 8 || u16(2) !== 42) return null;
  let ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  ifd += 2;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + index * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) !== 0x0112) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}
