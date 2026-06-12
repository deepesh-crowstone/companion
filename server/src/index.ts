import "./load-env.js";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { messagesRouter } from "./routes/messages.js";
import { realtimeRouter } from "./routes/realtime.js";
import { personalitiesRouter } from "./routes/personalities.js";
import { privateModeRouter } from "./routes/private-mode.js";
import { eventsRouter } from "./routes/events.js";
import { callsRouter } from "./routes/calls.js";
import { configRouter } from "./routes/config.js";
import { devicesRouter } from "./routes/devices.js";
import { adminProfilesRouter } from "./routes/admin-profiles.js";
import { profilesRouter } from "./routes/profiles.js";
import { isPushConfigured } from "./push-notifications.js";
import { checkDbConnection, initDb } from "./db.js";
import { recoverInterruptedGenerations } from "./profile-factory/store.js";
import { checkBucketConnection, isBucketConfigured } from "./storage.js";
import { verifyXaiConnection } from "./xai.js";

function validateEnv(): void {
  const key = process.env.XAI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!key || key.includes("your_xai") || key === "test") {
    console.error(
      "\n❌  XAI_API_KEY missing or placeholder (set in server/.env or Railway variables)",
      "\n    If your terminal has export XAI_API_KEY=test, run: unset XAI_API_KEY",
      "\n    Then add your real key from https://console.x.ai/team/default/api-keys\n",
    );
    process.exit(1);
  }
  if (!process.env.JWT_SECRET?.trim()) {
    console.error("\n❌  JWT_SECRET missing (set in server/.env or Railway variables)\n");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("\n❌  DATABASE_URL missing (PostgreSQL connection string)\n");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !isBucketConfigured()) {
    console.error(
      "\n❌  Voice storage requires a Railway Bucket (BUCKET, ENDPOINT, REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY)\n",
    );
    process.exit(1);
  }
}

validateEnv();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/db", async (_req, res) => {
  const ok = await checkDbConnection();
  if (ok) {
    res.json({ ok: true, db: "connected" });
  } else {
    res.status(503).json({ ok: false, db: "disconnected" });
  }
});

app.get("/health/bucket", async (_req, res) => {
  if (!isBucketConfigured()) {
    res.status(503).json({ ok: false, bucket: "not_configured" });
    return;
  }
  const ok = await checkBucketConnection();
  if (ok) {
    res.json({ ok: true, bucket: "connected" });
  } else {
    res.status(503).json({ ok: false, bucket: "disconnected" });
  }
});

app.get("/health/xai", async (_req, res) => {
  try {
    await verifyXaiConnection();
    res.json({ ok: true, xai: "connected" });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e instanceof Error ? e.message : "xAI check failed",
    });
  }
});

app.use("/auth", authRouter);
app.use("/messages", messagesRouter);
app.use("/realtime", realtimeRouter);
app.use("/personalities", personalitiesRouter);
app.use("/private-mode", privateModeRouter);
app.use("/events", eventsRouter);
app.use("/calls", callsRouter);
app.use("/config", configRouter);
app.use("/devices", devicesRouter);
app.use("/admin/profiles", adminProfilesRouter);
app.use("/profiles", profilesRouter);

// Profile factory review dashboard (static page; the API it calls is token-gated).
app.get("/admin", (_req, res) => {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  res.sendFile(path.resolve(serverDir, "../admin/index.html"));
});

async function main(): Promise<void> {
  await initDb();
  console.log("✓ PostgreSQL schema ready");
  await recoverInterruptedGenerations();
  if (isBucketConfigured()) {
    console.log("✓ Object storage: voice + Zara photos (presigned URLs)");
  } else {
    console.warn(
      "⚠ Voice notes and private photos disabled until bucket env vars are set",
    );
  }
  if (isPushConfigured()) {
    console.log("✓ Push notifications: Firebase Cloud Messaging");
  } else {
    console.warn(
      "⚠ Push notifications disabled until FIREBASE_SERVICE_ACCOUNT_JSON is set",
    );
  }

  app.listen(port, host, async () => {
    console.log(`Zara server listening on http://${host}:${port}`);
    try {
      await verifyXaiConnection();
      console.log("✓ xAI API key verified");
    } catch (e) {
      console.error("✗ xAI API key check failed:", e);
    }
  });
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
