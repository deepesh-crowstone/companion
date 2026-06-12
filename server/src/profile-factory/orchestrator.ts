import {
  editImage,
  generateImage,
  IMAGINE_MODEL_QUALITY,
  type GeneratedImage,
} from "../imagine-client.js";
import { getPresignedPhotoUrl, uploadPhotoObject } from "../storage.js";
import { generateProfileText, regenerateSectionContent } from "./generate-text.js";
import { anchorPrompt, scenePrompt } from "./photo-prompts.js";
import { samplePersonaSeed, slugForSeed } from "./seeds.js";
import * as store from "./store.js";
import type { DbAiProfile, PersonaSeed } from "./types.js";

function extensionFor(image: GeneratedImage): string {
  if (image.mimeType.includes("png")) return "png";
  if (image.mimeType.includes("webp")) return "webp";
  return "jpg";
}

function photoKey(slug: string, slot: number, image: GeneratedImage): string {
  return `photos/profiles/${slug}/photo_${slot}_${Date.now()}.${extensionFor(image)}`;
}

async function uploadPhoto(
  profileId: number,
  slug: string,
  slot: number,
  image: GeneratedImage,
  prompt: string,
): Promise<void> {
  const key = photoKey(slug, slot, image);
  await uploadPhotoObject(key, image.bytes, image.mimeType);
  await store.upsertPhoto(profileId, slot, key, prompt, slot === 0);
}

async function fetchPhotoBytes(objectKey: string): Promise<GeneratedImage> {
  const url = await getPresignedPhotoUrl(objectKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Could not download stored photo (${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    mimeType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

async function generateGalleryPhoto(
  seed: PersonaSeed,
  anchor: GeneratedImage,
  slot: number,
  feedback?: string,
): Promise<{ image: GeneratedImage; prompt: string }> {
  const scene = seed.scenes[slot];
  if (!scene) throw new Error(`No scene defined for photo slot ${slot}`);
  const prompt = scenePrompt(scene, feedback);
  const image = await editImage(prompt, [anchor], {
    model: IMAGINE_MODEL_QUALITY,
  });
  return { image, prompt };
}

/**
 * Samples a fresh persona, inserts a `generating` row, and runs the pipeline
 * in the background. Returns the new row immediately.
 */
export async function startProfileGeneration(): Promise<DbAiProfile> {
  const used = await store.usedSeedValues();
  const seed = samplePersonaSeed(used);
  const profile = await store.insertProfile(slugForSeed(seed), seed);

  void runGenerationJob(profile.id, profile.slug, seed).catch(async (e) => {
    console.error(`Profile ${profile.id} generation failed:`, e);
    await store
      .markFailed(profile.id, e instanceof Error ? e.message : String(e))
      .catch(() => {});
  });

  return profile;
}

/**
 * Stage 1: text + identity anchor only, then stop at `anchor_review` so the
 * reviewer can iterate on the face cheaply before the gallery is generated.
 */
async function runGenerationJob(
  profileId: number,
  slug: string,
  seed: PersonaSeed,
): Promise<void> {
  await store.setGenerationStep(profileId, "writing profile text");
  const content = await generateProfileText(seed);
  await store.setProfileContent(profileId, content);

  await store.setGenerationStep(profileId, "creating identity anchor photo");
  const anchorImagePrompt = anchorPrompt(seed);
  const anchor = await generateImage(anchorImagePrompt, {
    model: IMAGINE_MODEL_QUALITY,
    aspectRatio: "3:4",
  });
  await uploadPhoto(profileId, slug, 0, anchor, anchorImagePrompt);

  await store.setStatus(profileId, "anchor_review");
}

/**
 * Stage 2: once the reviewer approves the anchor, generate the remaining
 * gallery photos from it in the background.
 */
export async function startGalleryGeneration(
  profile: DbAiProfile,
): Promise<void> {
  const photos = await store.getPhotos(profile.id);
  const anchorPhoto = photos.find((p) => p.slot === 0);
  if (!anchorPhoto) {
    throw new Error("Anchor photo missing — redo the anchor first");
  }

  const galleryCount = profile.persona_seed.layout.photoCount - 1;
  await store.markGenerating(
    profile.id,
    `shooting ${galleryCount} gallery photos`,
  );

  void runGalleryJob(profile.id, profile.slug, profile.persona_seed, anchorPhoto.object_key)
    .catch(async (e) => {
      console.error(`Profile ${profile.id} gallery generation failed:`, e);
      await store
        .markFailed(profile.id, e instanceof Error ? e.message : String(e))
        .catch(() => {});
    });
}

async function runGalleryJob(
  profileId: number,
  slug: string,
  seed: PersonaSeed,
  anchorObjectKey: string,
): Promise<void> {
  const anchor = await fetchPhotoBytes(anchorObjectKey);

  const gallerySlots = Array.from(
    { length: seed.layout.photoCount - 1 },
    (_, i) => i + 1,
  );

  const results = await Promise.allSettled(
    gallerySlots.map((slot) => generateGalleryPhoto(seed, anchor, slot)),
  );

  const failures: number[] = [];
  for (let i = 0; i < results.length; i++) {
    const slot = gallerySlots[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      await uploadPhoto(profileId, slug, slot, result.value.image, result.value.prompt);
    } else {
      failures.push(slot);
      console.error(`Profile ${profileId} photo ${slot} failed:`, result.reason);
    }
  }

  // One sequential retry round for failed slots; leftover gaps can be filled
  // from the dashboard via per-photo regenerate.
  for (const slot of failures) {
    try {
      const { image, prompt } = await generateGalleryPhoto(seed, anchor, slot);
      await uploadPhoto(profileId, slug, slot, image, prompt);
    } catch (e) {
      console.error(`Profile ${profileId} photo ${slot} retry failed:`, e);
    }
  }

  await store.setStatus(profileId, "draft");
}

/** Regenerates a single photo slot, folding reviewer feedback into the prompt. */
export async function regeneratePhotoSlot(
  profile: DbAiProfile,
  slot: number,
  feedback?: string,
): Promise<void> {
  const seed = profile.persona_seed;
  if (slot < 0 || slot >= seed.layout.photoCount) {
    throw new Error(`Photo slot ${slot} out of range`);
  }

  if (slot === 0) {
    // Regenerating the anchor creates a new identity (text-to-image).
    const prompt = anchorPrompt(seed, feedback);
    const image = await generateImage(prompt, {
      model: IMAGINE_MODEL_QUALITY,
      aspectRatio: "3:4",
    });
    await uploadPhoto(profile.id, profile.slug, 0, image, prompt);
    return;
  }

  const photos = await store.getPhotos(profile.id);
  const anchorPhoto = photos.find((p) => p.slot === 0);
  if (!anchorPhoto) {
    throw new Error("Anchor photo missing — regenerate photo 1 first");
  }
  const anchor = await fetchPhotoBytes(anchorPhoto.object_key);
  const { image, prompt } = await generateGalleryPhoto(
    seed,
    anchor,
    slot,
    feedback,
  );
  await uploadPhoto(profile.id, profile.slug, slot, image, prompt);
}

/** Regenerates one text section in place. */
export async function regenerateSection(
  profile: DbAiProfile,
  sectionIndex: number,
  feedback?: string,
): Promise<void> {
  if (!profile.profile) throw new Error("Profile has no text content yet");
  const updated = await regenerateSectionContent(
    profile.persona_seed,
    profile.profile,
    sectionIndex,
    feedback,
  );
  const content = { ...profile.profile };
  content.sections = [...content.sections];
  content.sections[sectionIndex] = updated;
  await store.setProfileContent(profile.id, content);
}

/** Rewrites all text sections (photos untouched), honoring feedback. */
export async function rewriteAllText(
  profile: DbAiProfile,
  feedback?: string,
): Promise<void> {
  const content = await generateProfileText(profile.persona_seed, {
    feedback,
    currentProfile: profile.profile ?? undefined,
  });
  await store.setProfileContent(profile.id, content);
}
