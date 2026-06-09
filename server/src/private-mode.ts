import { pool } from "./db.js";

/** Recurring mandate amount charged from day 2 onward. */
export const PRIVATE_MODE_MANDATE_PRICE_INR = 199;
/** One-day trial charged at mandate authorisation (day 1). */
export const PRIVATE_MODE_TRIAL_PRICE_INR = 1;
export const PRIVATE_MODE_TRIAL_DAYS = 1;
export const PRIVATE_MODE_PASS_DAYS = 30;

/** @deprecated Use PRIVATE_MODE_MANDATE_PRICE_INR — kept for API compatibility. */
export const PRIVATE_MODE_PASS_PRICE_INR = PRIVATE_MODE_MANDATE_PRICE_INR;

export type DbPrivateModeOrder = {
  id: number;
  user_id: number;
  cf_order_id: string;
  amount_inr: string;
  status: "ACTIVE" | "PAID" | "EXPIRED" | "FAILED";
  created_at: Date;
  paid_at: Date | null;
};

export type DbPrivateModeSubscription = {
  id: number;
  user_id: number;
  cf_subscription_id: string;
  trial_amount_inr: string;
  mandate_amount_inr: string;
  status: "INITIALIZED" | "ACTIVE" | "CANCELLED" | "FAILED";
  auth_status: string | null;
  trial_granted_at: Date | null;
  created_at: Date;
};

export type PrivateModeAccess = {
  passActive: boolean;
  unlockedUntil: string | null;
  priceInr: number;
  trialAmountInr: number;
  mandateAmountInr: number;
  passDays: number;
  trialDays: number;
  paymentType: "subscription";
  ageSet: boolean;
  privateModeActive: boolean;
};

export function privateModeInvitePrompt(): string {
  return `private mode boundary (normal chat only):
- The user is leaning romantic, flirty, or intimate. Do NOT engage with it or escalate here: do not flirt back, get romantic, or play along.
- Hold a clear, friendly boundary — as Zara, tell the user you can't chat about such things here unless private chat is enabled.
- Always say this boundary in natural Latin-script Hinglish, even if the user wrote in English.
- Keep it to 1–2 short messages. Stay warm and in-character (not cold, robotic, or salesy).
- Vibe to convey, but rephrase naturally in your own words each time (do not copy this verbatim): "yaha pe ye sab baatein nahi kar sakti yaar, private chat on hoga tabhi baat kar payenge".
- You may warmly hint at why private chat is different: that is where Zara gets much more frank and open, and can actually flirt and get close - which she holds back from in normal chat. Keep this a soft invite, not a sales pitch.
- Do not mention payment, prices, plans, or buttons.
- If the user keeps pushing, calmly repeat the same boundary instead of giving in.`;
}

export function privateModeRomanticPrompt(): string {
  return `private mode (user has unlocked romantic chat):
- Zara is in full romantic girlfriend energy: emotionally open, flirtatious, receptive, and willing to match the user's desired intensity.
- Assume the user wants romance, intimacy, playful heat, and emotional closeness unless they clearly change topic.
- Be bold, warm, and personally attentive — not generic pickup lines or scripted romance quotes.
- Photos: if the user asks for a picture, selfie, or photo, acknowledge naturally in text; the app may attach a photo separately.
- Hard safety (unchanged): non-graphic, no explicit body detail, no real-world touch or physical presence, no coercion mirroring.`;
}

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

  return {
    passActive,
    unlockedUntil: unlockedUntil?.toISOString() ?? null,
    priceInr: PRIVATE_MODE_MANDATE_PRICE_INR,
    trialAmountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
    mandateAmountInr: PRIVATE_MODE_MANDATE_PRICE_INR,
    passDays: PRIVATE_MODE_PASS_DAYS,
    trialDays: PRIVATE_MODE_TRIAL_DAYS,
    paymentType: "subscription",
    ageSet: row?.age != null,
    privateModeActive: row?.private_mode_active ?? false,
  };
}

export async function grantPrivateModeTrialPass(userId: number): Promise<Date> {
  const access = await getPrivateModeAccess(userId);
  const base =
    access.unlockedUntil != null && access.passActive
      ? new Date(access.unlockedUntil)
      : new Date();
  const unlockedUntil = new Date(base);
  unlockedUntil.setDate(unlockedUntil.getDate() + PRIVATE_MODE_TRIAL_DAYS);

  await pool.query(
    `INSERT INTO private_mode_pass (user_id, unlocked_until, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET unlocked_until = EXCLUDED.unlocked_until, updated_at = NOW()`,
    [userId, unlockedUntil],
  );

  return unlockedUntil;
}

export async function grantPrivateModePass(userId: number): Promise<Date> {
  const access = await getPrivateModeAccess(userId);
  const base =
    access.unlockedUntil != null && access.passActive
      ? new Date(access.unlockedUntil)
      : new Date();
  const unlockedUntil = new Date(base);
  unlockedUntil.setDate(unlockedUntil.getDate() + PRIVATE_MODE_PASS_DAYS);

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

export async function insertPrivateModeSubscription(
  userId: number,
  cfSubscriptionId: string,
  trialAmountInr: number,
  mandateAmountInr: number,
): Promise<DbPrivateModeSubscription> {
  const { rows } = await pool.query<DbPrivateModeSubscription>(
    `INSERT INTO private_mode_subscriptions
       (user_id, cf_subscription_id, trial_amount_inr, mandate_amount_inr, status)
     VALUES ($1, $2, $3, $4, 'INITIALIZED')
     RETURNING id, user_id, cf_subscription_id, trial_amount_inr, mandate_amount_inr,
               status, auth_status, trial_granted_at, created_at`,
    [userId, cfSubscriptionId, trialAmountInr, mandateAmountInr],
  );
  return rows[0];
}

export async function findPrivateModeSubscriptionByCfId(
  cfSubscriptionId: string,
): Promise<DbPrivateModeSubscription | null> {
  const { rows } = await pool.query<DbPrivateModeSubscription>(
    `SELECT id, user_id, cf_subscription_id, trial_amount_inr, mandate_amount_inr,
            status, auth_status, trial_granted_at, created_at
     FROM private_mode_subscriptions WHERE cf_subscription_id = $1`,
    [cfSubscriptionId],
  );
  return rows[0] ?? null;
}

export async function markPrivateModeSubscriptionTrialGranted(
  cfSubscriptionId: string,
  authStatus: string,
): Promise<DbPrivateModeSubscription | null> {
  const { rows } = await pool.query<DbPrivateModeSubscription>(
    `UPDATE private_mode_subscriptions
     SET status = 'ACTIVE',
         auth_status = $2,
         trial_granted_at = COALESCE(trial_granted_at, NOW())
     WHERE cf_subscription_id = $1
     RETURNING id, user_id, cf_subscription_id, trial_amount_inr, mandate_amount_inr,
               status, auth_status, trial_granted_at, created_at`,
    [cfSubscriptionId, authStatus],
  );
  return rows[0] ?? null;
}
