/**
 * Phase-0 smoke test for the AI profile factory.
 *
 * Generates one persona's identity anchor portrait, then 4 gallery shots that
 * reuse the anchor as a reference image, and saves everything to
 * server/tmp/profile-smoke/ so face consistency can be eyeballed before we
 * build the full pipeline. Costs roughly $0.13 per run.
 *
 * Usage: cd server && npm run profiles:smoke
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "../src/load-env.js";
import {
  editImage,
  generateImage,
  IMAGINE_MODEL_FAST,
  IMAGINE_MODEL_QUALITY,
  type GeneratedImage,
} from "../src/imagine-client.js";

const APPEARANCE =
  "a 24-year-old Indian woman with warm brown skin, long wavy dark brown hair, " +
  "expressive dark eyes, a small nose stud, and a bright natural smile";

const PHOTO_STYLE =
  "Shot looks like a candid amateur smartphone photo from a real dating profile: " +
  "natural skin texture with pores, soft imperfect lighting, slight motion blur, " +
  "realistic background clutter, no studio look, no airbrushing, no AI gloss.";

const ANCHOR_PROMPT =
  `Casual phone-camera portrait of ${APPEARANCE}, wearing a simple olive ` +
  `green kurti, looking at the camera with a relaxed smile, standing on a ` +
  `sunlit apartment balcony in an Indian city. ${PHOTO_STYLE}`;

const SCENE_PROMPTS = [
  "Keep the exact same woman from the reference image with an identical face. " +
    "Now she is sitting at a cozy cafe table, laughing mid-conversation, " +
    "wearing a black casual top, holding a cappuccino, warm indoor light. " +
    PHOTO_STYLE,
  "Keep the exact same woman from the reference image with an identical face. " +
    "Now a mirror selfie in her bedroom, phone covering part of her face is " +
    "NOT allowed — phone held at chest height, wearing blue jeans and a white " +
    "crop top, fairy lights in the background. " +
    PHOTO_STYLE,
  "Keep the exact same woman from the reference image with an identical face. " +
    "Now walking outdoors at golden hour in a leafy park, wearing athleisure " +
    "(grey leggings, pink sports tee), hair in a ponytail, caught mid-stride " +
    "smiling away from the camera. " +
    PHOTO_STYLE,
  "Keep the exact same woman from the reference image with an identical face. " +
    "Now dressed up for an evening out in an elegant maroon saree with subtle " +
    "jewelry, soft string-light bokeh behind her at a rooftop restaurant at " +
    "night. " +
    PHOTO_STYLE,
];

function extensionFor(image: GeneratedImage): string {
  if (image.mimeType.includes("png")) return "png";
  if (image.mimeType.includes("webp")) return "webp";
  return "jpg";
}

async function main(): Promise<void> {
  const serverDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const outDir = path.join(serverDir, "tmp", "profile-smoke");
  mkdirSync(outDir, { recursive: true });

  console.log("1/2 Generating identity anchor portrait (quality model)...");
  const anchor = await generateImage(ANCHOR_PROMPT, {
    model: IMAGINE_MODEL_QUALITY,
    aspectRatio: "3:4",
  });
  const anchorPath = path.join(outDir, `anchor.${extensionFor(anchor)}`);
  writeFileSync(anchorPath, anchor.bytes);
  console.log(`    saved ${anchorPath}`);

  console.log("2/2 Generating 4 gallery shots referencing the anchor...");
  const results = await Promise.allSettled(
    SCENE_PROMPTS.map((prompt) =>
      editImage(prompt, [anchor], { model: IMAGINE_MODEL_FAST }),
    ),
  );

  const saved: string[] = [anchorPath];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`    photo_${i + 1} FAILED: ${result.reason}`);
      return;
    }
    const image = result.value;
    const filePath = path.join(
      outDir,
      `photo_${i + 1}.${extensionFor(image)}`,
    );
    writeFileSync(filePath, image.bytes);
    saved.push(filePath);
    console.log(`    saved ${filePath}`);
  });

  console.log(
    `\nDone. ${saved.length}/5 images in ${outDir} — check that all faces match.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
