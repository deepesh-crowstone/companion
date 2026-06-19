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
  age: number | null;
  private_mode_active: boolean;
  created_at: Date;
};

export type DbMessage = {
  id: number;
  user_id: number;
  profile_slug: string;
  role: "user" | "assistant";
  content: string;
  message_type: "text" | "audio" | "image";
  audio_filename: string | null;
  image_key: string | null;
  is_private: boolean;
  created_at: Date;
};

export type DbUserEvent = {
  id: number;
  user_id: number | null;
  event_name: string;
  event_time: Date;
  properties: Record<string, string | number | boolean | null> | null;
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

      CREATE TABLE IF NOT EXISTS personality_pass (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        unlocked_until TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS personality_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cf_order_id TEXT NOT NULL UNIQUE,
        amount_inr NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'PAID', 'EXPIRED', 'FAILED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_personality_orders_user
        ON personality_orders (user_id, created_at DESC);

      ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS private_mode_active BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS private_mode_pass (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        unlocked_until TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS private_mode_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cf_order_id TEXT NOT NULL UNIQUE,
        amount_inr NUMERIC(10, 2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'PAID', 'EXPIRED', 'FAILED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        paid_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_private_mode_orders_user
        ON private_mode_orders (user_id, created_at DESC);

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

      ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
      ALTER TABLE messages
        ADD CONSTRAINT messages_message_type_check
        CHECK (message_type IN ('text', 'audio', 'image'));

      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_key TEXT;
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

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

      ALTER TABLE user_events
        ADD COLUMN IF NOT EXISTS properties JSONB;

      CREATE TABLE IF NOT EXISTS push_device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        fcm_token TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'android',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (fcm_token)
      );

      CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user
        ON push_device_tokens (user_id);

      CREATE TABLE IF NOT EXISTS ai_profiles (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'generating'
          CHECK (status IN ('generating', 'draft', 'published', 'rejected', 'failed')),
        generation_step TEXT,
        error TEXT,
        persona_seed JSONB NOT NULL,
        profile JSONB,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE ai_profiles DROP CONSTRAINT IF EXISTS ai_profiles_status_check;
      ALTER TABLE ai_profiles
        ADD CONSTRAINT ai_profiles_status_check
        CHECK (status IN ('generating', 'anchor_review', 'draft', 'published', 'rejected', 'failed'));

      CREATE INDEX IF NOT EXISTS idx_ai_profiles_status
        ON ai_profiles (status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS ai_profile_photos (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES ai_profiles(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL,
        object_key TEXT NOT NULL,
        prompt TEXT NOT NULL,
        is_anchor BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (profile_id, slot)
      );

      CREATE TABLE IF NOT EXISTS ai_profile_reviews (
        id SERIAL PRIMARY KEY,
        profile_id INTEGER NOT NULL REFERENCES ai_profiles(id) ON DELETE CASCADE,
        target TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_profile_reviews_profile
        ON ai_profile_reviews (profile_id, created_at DESC);

      ALTER TABLE messages ADD COLUMN IF NOT EXISTS profile_slug TEXT;
      UPDATE messages SET profile_slug = 'zara' WHERE profile_slug IS NULL;
      ALTER TABLE messages ALTER COLUMN profile_slug SET DEFAULT 'zara';
      ALTER TABLE messages ALTER COLUMN profile_slug SET NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_messages_user_profile_created
        ON messages (user_id, profile_slug, created_at, id);

      ALTER TABLE personality_pass ADD COLUMN IF NOT EXISTS profile_slug TEXT;
      UPDATE personality_pass SET profile_slug = 'zara' WHERE profile_slug IS NULL;
      ALTER TABLE personality_pass ALTER COLUMN profile_slug SET DEFAULT 'zara';
      ALTER TABLE personality_pass ALTER COLUMN profile_slug SET NOT NULL;
      ALTER TABLE personality_pass DROP CONSTRAINT IF EXISTS personality_pass_pkey;
      ALTER TABLE personality_pass
        ADD CONSTRAINT personality_pass_pkey PRIMARY KEY (user_id, profile_slug);

      ALTER TABLE personality_orders ADD COLUMN IF NOT EXISTS profile_slug TEXT;
      UPDATE personality_orders SET profile_slug = 'zara' WHERE profile_slug IS NULL;
      ALTER TABLE personality_orders ALTER COLUMN profile_slug SET DEFAULT 'zara';
      ALTER TABLE personality_orders ALTER COLUMN profile_slug SET NOT NULL;
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
