import { Router, type NextFunction, type Request, type Response } from "express";
import { getPresignedPhotoUrl } from "../storage.js";
import {
  regeneratePhotoSlot,
  regenerateSection,
  rewriteAllText,
  startGalleryGeneration,
  startProfileGeneration,
} from "../profile-factory/orchestrator.js";
import * as store from "../profile-factory/store.js";
import type {
  DbAiProfile,
  ProfileContent,
  ProfileSection,
} from "../profile-factory/types.js";

export const adminProfilesRouter = Router();

function adminToken(): string | null {
  return process.env.ADMIN_TOKEN?.trim() || null;
}

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = adminToken();
  if (!expected) {
    res.status(503).json({ error: "ADMIN_TOKEN is not configured" });
    return;
  }
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const provided = (req.headers["x-admin-token"] as string | undefined) ?? bearer;
  if (provided !== expected) {
    res.status(401).json({ error: "Invalid admin token" });
    return;
  }
  next();
}

adminProfilesRouter.use(adminAuth);

async function profileDetail(profile: DbAiProfile): Promise<object> {
  const [photos, reviews] = await Promise.all([
    store.getPhotos(profile.id),
    store.getReviews(profile.id),
  ]);
  const photosWithUrls = await Promise.all(
    photos.map(async (p) => ({
      slot: p.slot,
      url: await getPresignedPhotoUrl(p.object_key),
      isAnchor: p.is_anchor,
      prompt: p.prompt,
    })),
  );
  return {
    id: profile.id,
    slug: profile.slug,
    status: profile.status,
    generationStep: profile.generation_step,
    error: profile.error,
    version: profile.version,
    seed: {
      archetype: profile.persona_seed.archetype,
      vibe: profile.persona_seed.vibe,
      appearance: profile.persona_seed.appearance,
      photoCount: profile.persona_seed.layout.photoCount,
      scenes: profile.persona_seed.scenes,
    },
    profile: profile.profile,
    photos: photosWithUrls,
    reviews: reviews.map((r) => ({
      target: r.target,
      comment: r.comment,
      createdAt: r.created_at,
    })),
    updatedAt: profile.updated_at,
  };
}

adminProfilesRouter.post("/", async (_req, res) => {
  try {
    if (await store.hasGeneratingProfile()) {
      res.status(409).json({
        error: "A profile is already generating — review flow is one at a time",
      });
      return;
    }
    const profile = await startProfileGeneration();
    res.json({ id: profile.id, slug: profile.slug, status: profile.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to start profile generation" });
  }
});

adminProfilesRouter.get("/", async (req, res) => {
  try {
    const status = (req.query.status as string | undefined)?.trim();
    const profiles = await store.listProfiles(
      status && status !== "all" ? (status as DbAiProfile["status"]) : undefined,
    );
    const photoMap = await store.getPhotosForProfiles(profiles.map((p) => p.id));

    const items = await Promise.all(
      profiles.map(async (p) => {
        const first = photoMap.get(p.id)?.[0];
        return {
          id: p.id,
          slug: p.slug,
          status: p.status,
          generationStep: p.generation_step,
          name: p.persona_seed.name,
          age: p.persona_seed.age,
          city: p.persona_seed.city,
          archetype: p.persona_seed.archetype,
          thumbnail: first ? await getPresignedPhotoUrl(first.object_key) : null,
          updatedAt: p.updated_at,
        };
      }),
    );
    res.json({ profiles: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list profiles" });
  }
});

adminProfilesRouter.get("/:id", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json(await profileDetail(profile));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

adminProfilesRouter.post("/:id/regenerate", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (profile.status === "generating") {
      res.status(409).json({ error: "Profile is still generating" });
      return;
    }

    const { target, comment } = req.body as { target?: string; comment?: string };
    if (!target) {
      res.status(400).json({ error: "target is required" });
      return;
    }

    const trimmedComment = comment?.trim() || undefined;
    if (trimmedComment) {
      await store.insertReview(profile.id, target, trimmedComment);
    }

    if (target.startsWith("photo:")) {
      await regeneratePhotoSlot(profile, Number(target.split(":")[1]), trimmedComment);
    } else if (target.startsWith("section:")) {
      await regenerateSection(profile, Number(target.split(":")[1]), trimmedComment);
    } else if (target === "text") {
      await rewriteAllText(profile, trimmedComment);
    } else {
      res.status(400).json({ error: `Unknown target: ${target}` });
      return;
    }

    const updated = await store.getProfile(profile.id);
    res.json(await profileDetail(updated!));
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Regeneration failed";
    res.status(502).json({ error: message });
  }
});

const SECTION_KINDS = new Set(["bio", "prompt", "interests", "basics"]);

function isValidProfileContent(value: unknown): value is ProfileContent {
  const profile = value as ProfileContent;
  return (
    typeof profile === "object" &&
    profile !== null &&
    typeof profile.name === "string" &&
    typeof profile.age === "number" &&
    typeof profile.city === "string" &&
    Array.isArray(profile.sections) &&
    profile.sections.every(
      (s: ProfileSection) => s && SECTION_KINDS.has(s.kind),
    )
  );
}

adminProfilesRouter.patch("/:id", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    const { profile: content } = req.body as { profile?: unknown };
    if (!isValidProfileContent(content)) {
      res.status(400).json({ error: "Invalid profile content" });
      return;
    }
    await store.setProfileContent(profile.id, content);
    const updated = await store.getProfile(profile.id);
    res.json(await profileDetail(updated!));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

adminProfilesRouter.post("/:id/generate-photos", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (profile.status !== "anchor_review") {
      res.status(409).json({
        error: `Gallery can only be generated from anchor review (status: ${profile.status})`,
      });
      return;
    }
    await startGalleryGeneration(profile);
    res.json({ ok: true, status: "generating" });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Failed to start gallery";
    res.status(500).json({ error: message });
  }
});

adminProfilesRouter.post("/:id/approve", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    if (profile.status !== "draft") {
      res.status(409).json({ error: `Cannot approve a ${profile.status} profile` });
      return;
    }
    await store.setStatus(profile.id, "published");
    res.json({ ok: true, status: "published" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to approve profile" });
  }
});

adminProfilesRouter.post("/:id/reject", async (req, res) => {
  try {
    const profile = await store.getProfile(Number(req.params.id));
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    await store.setStatus(profile.id, "rejected");
    res.json({ ok: true, status: "rejected" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to reject profile" });
  }
});

adminProfilesRouter.delete("/:id", async (req, res) => {
  try {
    await store.deleteProfile(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete profile" });
  }
});
