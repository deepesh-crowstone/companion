import { pool } from "./db.js";
import { getPrivateModePassPricing } from "./pricing.js";

export {
  privateModeInvitePrompt,
  privateModeRomanticPrompt,
} from "./private-mode-prompts.js";

export type DbPrivateModeOrder = {
  id: number;
  user_id: number;
  cf_order_id: string;
  amount_inr: string;
  status: "ACTIVE" | "PAID" | "EXPIRED" | "FAILED";
  created_at: Date;
  paid_at: Date | null;
};

export type PrivateModeAccess = {
  passActive: boolean;
  unlockedUntil: string | null;
  priceInr: number;
  strikePriceInr: number;
  passDays: number;
  ageSet: boolean;
  privateModeActive: boolean;
};

export async function getUserAge(userId: number): Promise<number | null> {
  const { rows } = await pool.query<{ age: number | null }>(
    `SELECT age FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.age ?? null;
}

export async function setUserAge(
  userId: number,
  age: number,
): Promise<{ ok: true } | { error: string }> {
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    return { error: "Enter a valid age" };
  }
  if (age < 18) {
    return { error: "We dont allow minors to enter into private chat mode" };
  }
  await pool.query(`UPDATE users SET age = $2 WHERE id = $1`, [userId, age]);
  return { ok: true };
}

export async function isUserPrivateModeActive(userId: number): Promise<boolean> {
  const { rows } = await pool.query<{ private_mode_active: boolean }>(
    `SELECT private_mode_active FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.private_mode_active ?? false;
}

export async function setUserPrivateModeActive(
  userId: number,
  active: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE users SET private_mode_active = $2 WHERE id = $1`,
    [userId, active],
  );
}

export async function getPrivateModeAccess(
  userId: number,
): Promise<PrivateModeAccess> {
  const { rows } = await pool.query<{
    unlocked_until: Date | null;
    age: number | null;
    private_mode_active: boolean;
  }>(
    `SELECT p.unlocked_until, u.age, u.private_mode_active
     FROM users u
     LEFT JOIN private_mode_pass p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  const row = rows[0];
  const unlockedUntil = row?.unlocked_until ?? null;
  const passActive =
    unlockedUntil != null && unlockedUntil.getTime() > Date.now();

  const pricing = getPrivateModePassPricing();
  return {
    passActive,
    unlockedUntil: unlockedUntil?.toISOString() ?? null,
    priceInr: pricing.priceInr,
    strikePriceInr: pricing.strikePriceInr,
    passDays: pricing.passDays,
    ageSet: row?.age != null,
    privateModeActive: row?.private_mode_active ?? false,
  };
}

export async function grantPrivateModePass(userId: number): Promise<Date> {
  const access = await getPrivateModeAccess(userId);
  const base =
    access.unlockedUntil != null && access.passActive
      ? new Date(access.unlockedUntil)
      : new Date();
  const unlockedUntil = new Date(base);
  unlockedUntil.setDate(
    unlockedUntil.getDate() + getPrivateModePassPricing().passDays,
  );

  await pool.query(
    `INSERT INTO private_mode_pass (user_id, unlocked_until, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET unlocked_until = EXCLUDED.unlocked_until, updated_at = NOW()`,
    [userId, unlockedUntil],
  );

  return unlockedUntil;
}

export async function deletePrivateMessages(userId: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM messages WHERE user_id = $1 AND is_private = TRUE`,
    [userId],
  );
  return rowCount ?? 0;
}

export async function insertPrivateModeOrder(
  userId: number,
  cfOrderId: string,
  amountInr: number,
): Promise<DbPrivateModeOrder> {
  const { rows } = await pool.query<DbPrivateModeOrder>(
    `INSERT INTO private_mode_orders (user_id, cf_order_id, amount_inr, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     RETURNING id, user_id, cf_order_id, amount_inr, status, created_at, paid_at`,
    [userId, cfOrderId, amountInr],
  );
  return rows[0];
}

export async function findPrivateModeOrderByCfId(
  cfOrderId: string,
): Promise<DbPrivateModeOrder | null> {
  const { rows } = await pool.query<DbPrivateModeOrder>(
    `SELECT id, user_id, cf_order_id, amount_inr, status, created_at, paid_at
     FROM private_mode_orders WHERE cf_order_id = $1`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}

export async function markPrivateModeOrderPaid(
  cfOrderId: string,
): Promise<DbPrivateModeOrder | null> {
  const { rows } = await pool.query<DbPrivateModeOrder>(
    `UPDATE private_mode_orders
     SET status = 'PAID', paid_at = NOW()
     WHERE cf_order_id = $1 AND status = 'ACTIVE'
     RETURNING id, user_id, cf_order_id, amount_inr, status, created_at, paid_at`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}
