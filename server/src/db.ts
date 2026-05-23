import "./load-env.js";
import pg from "pg";

const { Pool } = pg;

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
  intimacy_level_unlocked: number;
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

export type DbUserEvent = {
  id: number;
  user_id: number | null;
  event_name: string;
  event_time: Date;
};

export async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        intimacy_level_unlocked INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS intimacy_level_unlocked INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS intimacy_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cf_order_id TEXT NOT NULL UNIQUE,
        target_level INTEGER NOT NULL CHECK (target_level IN (2, 3)),
        amount_inr NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'PAID', 'EXPIRED', 'FAILED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_intimacy_orders_user
        ON intimacy_orders (user_id, created_at DESC);

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

      CREATE TABLE IF NOT EXISTS user_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,
        event_time TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_user_events_user_time
        ON user_events (user_id, event_time DESC);

      ALTER TABLE user_events
        ALTER COLUMN user_id DROP NOT NULL;
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
