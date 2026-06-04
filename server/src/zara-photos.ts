import path from "path";
import { fileURLToPath } from "url";

export type ClothingLevel = "casual" | "modest" | "romantic" | "bold";

export type ZaraPhoto = {
  id: string;
  /** S3 key in the Railway bucket, e.g. photos/zara/photo_1.jpg */
  objectKey: string;
  emotions: string[];
  clothingLevel: ClothingLevel;
};

/**
 * Catalog of Zara private-mode photos. Files are stored in the Railway bucket
 * under `photos/zara/` (upload via `npm run seed:zara-photos`).
 */
export const ZARA_PHOTO_CATALOG: ZaraPhoto[] = [
  {
    id: "photo_1",
    objectKey: "photos/zara/photo_1.jpg",
    emotions: ["happy", "playful", "warm"],
    clothingLevel: "casual",
  },
  {
    id: "photo_2",
    objectKey: "photos/zara/photo_2.jpg",
    emotions: ["romantic", "soft", "caring"],
    clothingLevel: "romantic",
  },
  {
    id: "photo_3",
    objectKey: "photos/zara/photo_3.jpg",
    emotions: ["flirty", "bold", "confident"],
    clothingLevel: "bold",
  },
  {
    id: "photo_4",
    objectKey: "photos/zara/photo_4.jpg",
    emotions: ["shy", "sweet", "modest"],
    clothingLevel: "modest",
  },
];

const PHOTO_KEYWORDS =
  /\b(photo|pic|picture|selfie|image|snap|send\s+(me\s+)?(a\s+)?(pic|photo)|dikha|dikhao|bhej|bhejo)\b/i;

/** Local source files used by the seed script (Flutter app assets). */
export function zaraPhotoLocalPath(photo: ZaraPhoto): string {
  const filename = path.basename(photo.objectKey);
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(serverDir, "../..");
  return path.join(
    repoRoot,
    "client/mia_companion/assets/images/zara_gallery",
    filename,
  );
}

export function userLikelyWantsPhoto(text: string): boolean {
  return PHOTO_KEYWORDS.test(text);
}

export function pickZaraPhoto(options: {
  emotion?: string | null;
  clothingLevel?: string | null;
}): ZaraPhoto {
  const emotion = options.emotion?.trim().toLowerCase();
  const level = normalizeClothingLevel(options.clothingLevel);

  let candidates = ZARA_PHOTO_CATALOG.filter((p) => p.clothingLevel === level);
  if (candidates.length === 0) {
    candidates = [...ZARA_PHOTO_CATALOG];
  }

  if (emotion) {
    const emotionMatch = candidates.filter((p) =>
      p.emotions.some((e) => emotion.includes(e) || e.includes(emotion)),
    );
    if (emotionMatch.length > 0) candidates = emotionMatch;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Maps legacy DB values (e.g. `photo_1`) to full bucket keys. */
export function normalizePhotoStoredKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.startsWith("photos/")) return trimmed;
  if (trimmed.endsWith(".jpg") || trimmed.endsWith(".jpeg") || trimmed.endsWith(".png")) {
    return `photos/zara/${trimmed}`;
  }
  return `photos/zara/${trimmed}.jpg`;
}

function normalizeClothingLevel(raw: string | null | undefined): ClothingLevel {
  const value = raw?.trim().toLowerCase();
  if (value === "modest" || value === "casual" || value === "romantic" || value === "bold") {
    return value;
  }
  if (value === "spicy" || value === "sexy" || value === "hot") return "bold";
  if (value === "cute" || value === "soft") return "modest";
  return "romantic";
}
