import "./load-env.js";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Local dev: `server/data`. Railway: mount a volume at `/data` and set `DATA_DIR=/data`. */
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
const dbPath = path.join(dataDir, "mia.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(dataDir, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'audio')),
    audio_filename TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_user_created
    ON messages(user_id, created_at);
`);

export type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
};

export type DbMessage = {
  id: number;
  user_id: number;
  role: "user" | "assistant";
  content: string;
  message_type: "text" | "audio";
  audio_filename: string | null;
  created_at: string;
};

export function getUploadsDir(): string {
  return uploadsDir;
}
