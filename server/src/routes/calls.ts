import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { getCallPreviewAudioUrls } from "../call-preview.js";
import { resolveProfileSlug } from "../profiles/catalog.js";

export const callsRouter = Router();

callsRouter.use(authMiddleware);

callsRouter.get("/preview-audio", (req, res) => {
  const profileSlug = resolveProfileSlug(
    typeof req.query.profileSlug === "string" ? req.query.profileSlug : null,
  );
  res.json({
    // The current preview catalog contains Zara recordings only. Returning an
    // empty list is safer than playing Zara audio while Aryan is selected.
    urls: profileSlug === "zara" ? getCallPreviewAudioUrls() : [],
  });
});
