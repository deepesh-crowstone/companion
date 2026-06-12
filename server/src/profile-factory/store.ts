import { pool } from "../db.js";
import type {
  AiProfileStatus,
  DbAiProfile,
  DbAiProfilePhoto,
  DbAiProfileReview,
  PersonaSeed,
  ProfileContent,
} from "./types.js";

const PROFILE_COLUMNS =
  "id, slug, status, generation_step, error, persona_seed, profile, version, created_at, updated_at";

export async function insertProfile(
  slug: string,
  seed: PersonaSeed,
): Promise<DbAiProfile> {
  const { rows } = await pool.query<DbAiProfile>(
    `INSERT INTO ai_profiles (slug, persona_seed, status)
     VALUES ($1, $2, 'generating')
     RETURNING ${PROFILE_COLUMNS}`,
    [slug, JSON.stringify(seed)],
  );
  return rows[0];
}

export async function getProfile(id: number): Promise<DbAiProfile | null> {
  const { rows } = await pool.query<DbAiProfile>(
    `SELECT ${PROFILE_COLUMNS} FROM ai_profiles WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listProfiles(
  status?: AiProfileStatus,
): Promise<DbAiProfile[]> {
  if (status) {
    const { rows } = await pool.query<DbAiProfile>(
      `SELECT ${PROFILE_COLUMNS} FROM ai_profiles
       WHERE status = $1 ORDER BY updated_at DESC`,
      [status],
    );
    return rows;
  }
  const { rows } = await pool.query<DbAiProfile>(
    `SELECT ${PROFILE_COLUMNS} FROM ai_profiles ORDER BY updated_at DESC`,
  );
  return rows;
}

export async function listPublishedProfiles(): Promise<DbAiProfile[]> {
  const { rows } = await pool.query<DbAiProfile>(
    `SELECT ${PROFILE_COLUMNS} FROM ai_profiles
     WHERE status = 'published' ORDER BY id`,
  );
  return rows;
}

export async function setGenerationStep(
  id: number,
  step: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles SET generation_step = $2, updated_at = NOW() WHERE id = $1`,
    [id, step],
  );
}

export async function setProfileContent(
  id: number,
  profile: ProfileContent,
): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles
     SET profile = $2, version = version + 1, updated_at = NOW()
     WHERE id = $1`,
    [id, JSON.stringify(profile)],
  );
}

export async function setStatus(
  id: number,
  status: AiProfileStatus,
): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles
     SET status = $2, generation_step = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id, status],
  );
}

export async function markGenerating(id: number, step: string): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles
     SET status = 'generating', generation_step = $2, updated_at = NOW()
     WHERE id = $1`,
    [id, step],
  );
}

export async function markFailed(id: number, error: string): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles
     SET status = 'failed', error = $2, generation_step = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id, error.slice(0, 500)],
  );
}

export async function deleteProfile(id: number): Promise<void> {
  await pool.query(`DELETE FROM ai_profiles WHERE id = $1`, [id]);
}

export async function hasGeneratingProfile(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM ai_profiles WHERE status = 'generating' LIMIT 1`,
  );
  return rows.length > 0;
}

/** Marks profiles stuck in 'generating' (e.g. after a restart) as failed. */
export async function recoverInterruptedGenerations(): Promise<void> {
  await pool.query(
    `UPDATE ai_profiles
     SET status = 'failed', error = 'Generation interrupted by server restart',
         generation_step = NULL, updated_at = NOW()
     WHERE status = 'generating'`,
  );
}

export async function usedSeedValues(): Promise<{
  usedNames: Set<string>;
  usedArchetypeCity: Set<string>;
}> {
  const { rows } = await pool.query<{ name: string; combo: string }>(
    `SELECT persona_seed->>'name' AS name,
            (persona_seed->>'archetype') || '|' || (persona_seed->>'city') AS combo
     FROM ai_profiles WHERE status != 'rejected' AND status != 'failed'`,
  );
  return {
    usedNames: new Set(rows.map((r) => r.name.toLowerCase())),
    usedArchetypeCity: new Set(rows.map((r) => r.combo)),
  };
}

export async function upsertPhoto(
  profileId: number,
  slot: number,
  objectKey: string,
  prompt: string,
  isAnchor: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO ai_profile_photos (profile_id, slot, object_key, prompt, is_anchor)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (profile_id, slot)
     DO UPDATE SET object_key = EXCLUDED.object_key, prompt = EXCLUDED.prompt,
                   created_at = NOW()`,
    [profileId, slot, objectKey, prompt, isAnchor],
  );
}

export async function getPhotos(
  profileId: number,
): Promise<DbAiProfilePhoto[]> {
  const { rows } = await pool.query<DbAiProfilePhoto>(
    `SELECT id, profile_id, slot, object_key, prompt, is_anchor, created_at
     FROM ai_profile_photos WHERE profile_id = $1 ORDER BY slot`,
    [profileId],
  );
  return rows;
}

export async function getPhotosForProfiles(
  profileIds: number[],
): Promise<Map<number, DbAiProfilePhoto[]>> {
  if (profileIds.length === 0) return new Map();
  const { rows } = await pool.query<DbAiProfilePhoto>(
    `SELECT id, profile_id, slot, object_key, prompt, is_anchor, created_at
     FROM ai_profile_photos WHERE profile_id = ANY($1) ORDER BY slot`,
    [profileIds],
  );
  const map = new Map<number, DbAiProfilePhoto[]>();
  for (const row of rows) {
    const list = map.get(row.profile_id) ?? [];
    list.push(row);
    map.set(row.profile_id, list);
  }
  return map;
}

export async function insertReview(
  profileId: number,
  target: string,
  comment: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO ai_profile_reviews (profile_id, target, comment)
     VALUES ($1, $2, $3)`,
    [profileId, target, comment],
  );
}

export async function getReviews(
  profileId: number,
): Promise<DbAiProfileReview[]> {
  const { rows } = await pool.query<DbAiProfileReview>(
    `SELECT id, profile_id, target, comment, created_at
     FROM ai_profile_reviews WHERE profile_id = $1 ORDER BY created_at DESC`,
    [profileId],
  );
  return rows;
}
