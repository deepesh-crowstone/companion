import { Router, type Request } from "express";
import { authMiddleware, type AuthPayload } from "../auth.js";
import {
  isPushConfigured,
  removeDeviceToken,
  upsertDeviceToken,
} from "../push-notifications.js";

export const devicesRouter = Router();

devicesRouter.use(authMiddleware);

function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}

devicesRouter.post("/push-token", async (req, res) => {
  const auth = getAuth(req);
  const { token, platform } = req.body as {
    token?: string;
    platform?: string;
  };

  const fcmToken = token?.trim();
  if (!fcmToken) {
    res.status(400).json({ error: "FCM token is required" });
    return;
  }

  if (!isPushConfigured()) {
    res.status(503).json({ error: "Push notifications are not configured" });
    return;
  }

  try {
    await upsertDeviceToken(
      auth.userId,
      fcmToken,
      platform?.trim() || "android",
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to register push token" });
  }
});

devicesRouter.delete("/push-token", async (req, res) => {
  const auth = getAuth(req);
  const { token } = req.body as { token?: string };
  const fcmToken = token?.trim();

  if (!fcmToken) {
    res.status(400).json({ error: "FCM token is required" });
    return;
  }

  try {
    await removeDeviceToken(auth.userId, fcmToken);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to unregister push token" });
  }
});
