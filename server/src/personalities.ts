import { pool } from "./db.js";
import type { ZaraMood } from "./mood.js";
import { getPersonalityPassPricing } from "./pricing.js";

export type DbPersonalityOrder = {
  id: number;
  user_id: number;
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
): Promise<PersonalityAccess> {
  const { rows } = await pool.query<{ unlocked_until: Date | null }>(
    `SELECT unlocked_until FROM personality_pass WHERE user_id = $1`,
    [userId],
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
): Promise<ZaraMood> {
  if (isFreePersonality(mood)) return mood;
  const access = await getPersonalityAccess(userId);
  return access.passActive ? mood : "friendly";
}

export async function grantPersonalityPass(userId: number): Promise<Date> {
  const access = await getPersonalityAccess(userId);
  const base =
    access.unlockedUntil != null && access.passActive
      ? new Date(access.unlockedUntil)
      : new Date();
  const unlockedUntil = new Date(base);
  unlockedUntil.setDate(
    unlockedUntil.getDate() + getPersonalityPassPricing().passDays,
  );

  await pool.query(
    `INSERT INTO personality_pass (user_id, unlocked_until, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET unlocked_until = EXCLUDED.unlocked_until, updated_at = NOW()`,
    [userId, unlockedUntil],
  );

  return unlockedUntil;
}

export async function insertPersonalityOrder(
  userId: number,
  cfOrderId: string,
  amountInr: number,
): Promise<DbPersonalityOrder> {
  const { rows } = await pool.query<DbPersonalityOrder>(
    `INSERT INTO personality_orders (user_id, cf_order_id, amount_inr, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     RETURNING id, user_id, cf_order_id, amount_inr, status, created_at, paid_at`,
    [userId, cfOrderId, amountInr],
  );
  return rows[0];
}

export async function findPersonalityOrderByCfId(
  cfOrderId: string,
): Promise<DbPersonalityOrder | null> {
  const { rows } = await pool.query<DbPersonalityOrder>(
    `SELECT id, user_id, cf_order_id, amount_inr, status, created_at, paid_at
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
     RETURNING id, user_id, cf_order_id, amount_inr, status, created_at, paid_at`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}
