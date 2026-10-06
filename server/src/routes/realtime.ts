import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { createRealtimeClientSecret } from "../xai.js";
import { buildRealtimeSessionConfig } from "../realtime-session.js";
import { resolveProfileSlug } from "../profiles/catalog.js";

export const realtimeRouter = Router();

realtimeRouter.use(authMiddleware);

realtimeRouter.post("/session", async (req, res) => {
  try {
    const rawProfileSlug = (req.body as { profileSlug?: unknown } | undefined)
      ?.profileSlug;
    const profileSlug = resolveProfileSlug(
      typeof rawProfileSlug === "string" ? rawProfileSlug : null,
    );
    const secret = await createRealtimeClientSecret(profileSlug);
    res.json({
      token: secret.value,
      expiresAt: secret.expires_at,
      model: "grok-voice-latest",
      wsUrl: "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
      sessionPreconfigured: true,
      sessionConfig: buildRealtimeSessionConfig(profileSlug),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to create realtime session",
    });
  }
});
