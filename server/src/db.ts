import "./load-env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

/** Local dev: `server/data/uploads`. Railway: volume at `/data` + `DATA_DIR=/data`. */
function resolveDataDir(): string {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return path.join(__dirname, "..", "data");
}

const dataDir = resolveDataDir();
const uploadsDir = path.join(dataDir, "uploads");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set (e.g. postgresql://user:pass@localhost:5432/mia)",
    );
  }
  return url;
}

export const pool = new Pool({
  connectionString: databaseUrl(),
});

export type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date;
};

export type DbMessage = {
  id: number;
  user_id: number;
  role: "user" | "assistant";
  content: string;
  message_type: "text" | "audio";
  audio_filename: string | null;
  created_at: Date;
};

export function getUploadsDir(): string {
  return uploadsDir;
}

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
        ON users (LOWER(username));

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'text'
          CHECK (message_type IN ('text', 'audio')),
        audio_filename TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_user_created
        ON messages (user_id, created_at, id);
    `);
  } finally {
    client.release();
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
