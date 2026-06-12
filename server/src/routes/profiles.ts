import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { getPresignedPhotoUrl } from "../storage.js";
import {
  getPhotosForProfiles,
  listPublishedProfiles,
} from "../profile-factory/store.js";

export const profilesRouter = Router();

profilesRouter.use(authMiddleware);

/** Swipe deck: all published AI profiles with presigned photo URLs. */
profilesRouter.get("/deck", async (_req, res) => {
  try {
    const profiles = await listPublishedProfiles();
    const photoMap = await getPhotosForProfiles(profiles.map((p) => p.id));

    const deck = await Promise.all(
      profiles.map(async (p) => {
        const photos = await Promise.all(
          (photoMap.get(p.id) ?? []).map((photo) =>
            getPresignedPhotoUrl(photo.object_key),
          ),
        );
        return {
          slug: p.slug,
          name: p.profile?.name ?? p.persona_seed.name,
          age: p.profile?.age ?? p.persona_seed.age,
          city: p.profile?.city ?? p.persona_seed.city,
          profession: p.profile?.profession ?? p.persona_seed.profession,
          sections: p.profile?.sections ?? [],
          photos,
        };
      }),
    );

    res.json({ profiles: deck });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load deck" });
  }
});
