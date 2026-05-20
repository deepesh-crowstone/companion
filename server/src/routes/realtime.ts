import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { createRealtimeClientSecret } from "../xai.js";
import { buildRealtimeSession } from "../realtime-session.js";

export const realtimeRouter = Router();

realtimeRouter.use(authMiddleware);

realtimeRouter.post("/session", async (_req, res) => {
  try {
    const secret = await createRealtimeClientSecret();
    const sessionConfig = buildRealtimeSession();
    res.json({
      token: secret.value,
      expiresAt: secret.expires_at,
      model: "grok-voice-latest",
      wsUrl: "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
      sessionConfig,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to create realtime session",
    });
  }
});
