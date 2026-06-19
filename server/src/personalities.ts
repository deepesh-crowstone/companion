import { pool } from "./db.js";
import type { ZaraMood } from "./mood.js";
import { getPersonalityPassPricing } from "./pricing.js";
import { resolveProfileSlug } from "./profiles/catalog.js";

export type DbPersonalityOrder = {
  id: number;
  user_id: number;
  profile_slug: string;
  cf_order_id: string;
  amount_inr: string;
  status: "ACTIVE" | "PAID" | "EXPIRED" | "FAILED";
  created_at: Date;
  paid_at: Date | null;
};

export type PersonalityAccess = {
  passActive: boolean;
  unlockedUntil: string | null;
  priceInr: number;
  strikePriceInr: number;
  passDays: number;
};

export function isFreePersonality(mood: ZaraMood): boolean {
  return mood === "friendly";
}

export async function getPersonalityAccess(
  userId: number,
  profileSlugRaw?: string | null,
): Promise<PersonalityAccess> {
  const profileSlug = resolveProfileSlug(profileSlugRaw);
  const { rows } = await pool.query<{ unlocked_until: Date | null }>(
    `SELECT unlocked_until FROM personality_pass
     WHERE user_id = $1 AND profile_slug = $2`,
    [userId, profileSlug],
  );
  const unlockedUntil = rows[0]?.unlocked_until ?? null;
  const passActive =
    unlockedUntil != null && unlockedUntil.getTime() > Date.now();

  const pricing = getPersonalityPassPricing();
  return {
    passActive,
    unlockedUntil: unlockedUntil?.toISOString() ?? null,
    priceInr: pricing.priceInr,
    strikePriceInr: pricing.strikePriceInr,
    passDays: pricing.passDays,
  };
}

export async function resolveMoodForUser(
  userId: number,
  mood: ZaraMood,
  profileSlugRaw?: string | null,
): Promise<ZaraMood> {
  if (isFreePersonality(mood)) return mood;
  const access = await getPersonalityAccess(userId, profileSlugRaw);
  return access.passActive ? mood : "friendly";
}

export async function grantPersonalityPass(
  userId: number,
  profileSlugRaw?: string | null,
): Promise<Date> {
  const profileSlug = resolveProfileSlug(profileSlugRaw);
  const access = await getPersonalityAccess(userId, profileSlug);
  const base =
    access.unlockedUntil != null && access.passActive
      ? new Date(access.unlockedUntil)
      : new Date();
  const unlockedUntil = new Date(base);
  unlockedUntil.setDate(
    unlockedUntil.getDate() + getPersonalityPassPricing().passDays,
  );

  await pool.query(
    `INSERT INTO personality_pass (user_id, profile_slug, unlocked_until, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, profile_slug)
     DO UPDATE SET unlocked_until = EXCLUDED.unlocked_until, updated_at = NOW()`,
    [userId, profileSlug, unlockedUntil],
  );

  return unlockedUntil;
}

export async function insertPersonalityOrder(
  userId: number,
  cfOrderId: string,
  amountInr: number,
  profileSlugRaw?: string | null,
): Promise<DbPersonalityOrder> {
  const profileSlug = resolveProfileSlug(profileSlugRaw);
  const { rows } = await pool.query<DbPersonalityOrder>(
    `INSERT INTO personality_orders (user_id, profile_slug, cf_order_id, amount_inr, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id, user_id, profile_slug, cf_order_id, amount_inr, status, created_at, paid_at`,
    [userId, profileSlug, cfOrderId, amountInr],
  );
  return rows[0];
}

export async function findPersonalityOrderByCfId(
  cfOrderId: string,
): Promise<DbPersonalityOrder | null> {
  const { rows } = await pool.query<DbPersonalityOrder>(
    `SELECT id, user_id, profile_slug, cf_order_id, amount_inr, status, created_at, paid_at
     FROM personality_orders WHERE cf_order_id = $1`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}

export async function markPersonalityOrderPaid(
  cfOrderId: string,
): Promise<DbPersonalityOrder | null> {
  const { rows } = await pool.query<DbPersonalityOrder>(
    `UPDATE personality_orders
     SET status = 'PAID', paid_at = NOW()
     WHERE cf_order_id = $1 AND status = 'ACTIVE'
     RETURNING id, user_id, profile_slug, cf_order_id, amount_inr, status, created_at, paid_at`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}
