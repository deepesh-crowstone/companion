import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { getCallPreviewAudioUrls } from "../call-preview.js";

export const callsRouter = Router();

callsRouter.use(authMiddleware);

callsRouter.get("/preview-audio", (_req, res) => {
  res.json({ urls: getCallPreviewAudioUrls() });
});
