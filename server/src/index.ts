import "./load-env.js";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.js";
import { messagesRouter } from "./routes/messages.js";
import { realtimeRouter } from "./routes/realtime.js";
import { checkDbConnection, getUploadsDir, initDb } from "./db.js";
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
}

validateEnv();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(getUploadsDir()));

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
    res.json({ ok: true, bucket: "not_configured", storage: "disk" });
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

async function main(): Promise<void> {
  await initDb();
  console.log("✓ PostgreSQL schema ready");
  if (isBucketConfigured()) {
    console.log("✓ Voice storage: Railway bucket");
  } else {
    console.log("✓ Voice storage: local disk (server/data/uploads)");
  }

  app.listen(port, host, async () => {
    console.log(`Mia server listening on http://${host}:${port}`);
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
