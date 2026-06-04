/**
 * Uploads Zara private-mode gallery images to the Railway bucket.
 *
 * Prerequisites: same bucket env vars as voice notes (BUCKET, ENDPOINT, etc.).
 * Source files: client/mia_companion/assets/images/zara_gallery/*.jpg
 *
 * Usage: cd server && npm run seed:zara-photos
 */
import { readFileSync } from "fs";
import "../src/load-env.js";
import {
  isBucketConfigured,
  photoObjectExists,
  uploadPhotoObject,
} from "../src/storage.js";
import { ZARA_PHOTO_CATALOG, zaraPhotoLocalPath } from "../src/zara-photos.js";

async function main(): Promise<void> {
  if (!isBucketConfigured()) {
    console.error(
      "Bucket is not configured. Set BUCKET, ENDPOINT, ACCESS_KEY_ID, and SECRET_ACCESS_KEY.",
    );
    process.exit(1);
  }

  for (const photo of ZARA_PHOTO_CATALOG) {
    const localPath = zaraPhotoLocalPath(photo);
    const exists = await photoObjectExists(photo.objectKey);
    if (exists) {
      console.log(`✓ skip (already in bucket): ${photo.objectKey}`);
      continue;
    }

    const body = readFileSync(localPath);
    const stored = await uploadPhotoObject(photo.objectKey, body, "image/jpeg");
    console.log(`✓ uploaded ${localPath} → ${stored}`);
  }

  console.log("\nDone. Zara photos are ready in the Railway bucket.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
