import { pool } from "./db.js";
import { XAI_CHAT_MODEL } from "./mia.js";

const XAI_BASE = "https://api.x.ai/v1";

export type IntimacyLevel = 1 | 2 | 3;
export type PaidIntimacyLevel = 2 | 3;

export const INTIMACY_TIER_PRICES: Record<PaidIntimacyLevel, number> = {
  2: 5,
  3: 10,
};

export const INTIMACY_TIER_LABELS: Record<IntimacyLevel, string> = {
  1: "Friend",
  2: "Close",
  3: "Wild",
};

export const INTIMACY_TIER_DESCRIPTIONS: Record<PaidIntimacyLevel, string> = {
  2: "More romantic, emotionally close chats with Zara",
  3: "Boldest intimacy — still tasteful, but no holding back",
};

export type IntimacyClassification = {
  level: IntimacyLevel;
  confidence: number;
};

export type DbIntimacyOrder = {
  id: number;
  user_id: number;
  cf_order_id: string;
  target_level: PaidIntimacyLevel;
  amount_inr: string;
  status: "ACTIVE" | "PAID" | "EXPIRED" | "FAILED";
  created_at: Date;
  paid_at: Date | null;
};

export type IntimacyNudgePayload = {
  requiredLevel: IntimacyLevel;
  unlockedLevel: IntimacyLevel;
  priceInr: number;
  title: string;
  description: string;
};

function xaiHeaders(): Record<string, string> {
  const key = process.env.XAI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!key) throw new Error("XAI_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function getUserIntimacyLevel(userId: number): Promise<IntimacyLevel> {
  const { rows } = await pool.query<{ intimacy_level_unlocked: number }>(
    `SELECT intimacy_level_unlocked FROM users WHERE id = $1`,
    [userId],
  );
  const level = rows[0]?.intimacy_level_unlocked ?? 1;
  if (level >= 3) return 3;
  if (level >= 2) return 2;
  return 1;
}

export async function unlockUserIntimacyLevel(
  userId: number,
  targetLevel: PaidIntimacyLevel,
): Promise<IntimacyLevel> {
  const current = await getUserIntimacyLevel(userId);
  const next = Math.max(current, targetLevel) as IntimacyLevel;
  await pool.query(
    `UPDATE users SET intimacy_level_unlocked = $1 WHERE id = $2`,
    [next, userId],
  );
  return next;
}

export function intimacyPromptForLevel(level: IntimacyLevel): string {
  switch (level) {
    case 2:
      return `intimacy tier (level 2 — close):
- the user has unlocked a closer, more romantic lane with Zara.
- be more romantically receptive: warmer flirtation, emotional closeness, shy boldness.
- still use respectful tum grammar, stay non-graphic, and keep everything in messaging/emotional intimacy only.`;
    case 3:
      return `intimacy tier (level 3 — wild):
- the user has unlocked the boldest intimacy lane with Zara.
- match high romantic/intimate energy with confident teasing, attraction, and emotional heat.
- stay within safety: non-graphic, no physical presence or touch, no crude mirroring, no desperation.
- Zara keeps taste and control even when going further than level 2.`;
    default:
      return `intimacy tier (level 1 — friend):
- default close-friend warmth. light flirt only if the user clearly invites it.
- do not escalate into deep romance or bold intimacy unless the user has unlocked higher tiers.`;
  }
}

export function buildIntimacyNudge(
  requiredLevel: IntimacyLevel,
  unlockedLevel: IntimacyLevel,
): IntimacyNudgePayload | null {
  if (requiredLevel <= unlockedLevel || requiredLevel === 1) return null;
  const paidLevel = requiredLevel as PaidIntimacyLevel;
  return {
    requiredLevel,
    unlockedLevel,
    priceInr: INTIMACY_TIER_PRICES[paidLevel],
    title: `Unlock ${INTIMACY_TIER_LABELS[paidLevel]}`,
    description: INTIMACY_TIER_DESCRIPTIONS[paidLevel],
  };
}

function parseClassification(raw: string): IntimacyClassification {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      level?: number;
      confidence?: number;
    };
    const level = parsed.level;
    if (level === 2 || level === 3) {
      return {
        level,
        confidence:
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.8,
      };
    }
    return { level: 1, confidence: 0.9 };
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return parseClassification(match[0]);
      } catch {
        /* fall through */
      }
    }
    return { level: 1, confidence: 0.5 };
  }
}

export async function classifyIntimacyLevel(text: string): Promise<IntimacyClassification> {
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: xaiHeaders(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `Classify the user's latest chat message into an intimacy tier for a companion app.

Tiers:
1 = normal friend chat (casual, emotional support, jokes, daily life, light warmth)
2 = romantic/intimate (flirting, romance, emotional closeness, wanting a deeper bond, lovey tone)
3 = wild/bold intimacy (explicit flirt escalation, asking to go further, sexual tension, "don't hold back", bold desire)

Rules:
- Output only JSON: {"level":1|2|3,"confidence":0.0-1.0}
- If ambiguous, prefer level 1.
- Level 3 requires clear escalation beyond normal flirting.
- Hindi/Hinglish counts the same as English.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    console.warn("Intimacy classification failed, defaulting to level 1");
    return { level: 1, confidence: 0.5 };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return { level: 1, confidence: 0.5 };
  return parseClassification(content);
}

export async function generateIntimacyTeaser(
  userMessage: string,
  requiredLevel: IntimacyLevel,
): Promise<string> {
  const tierLabel = INTIMACY_TIER_LABELS[requiredLevel];
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: xaiHeaders(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.75,
      messages: [
        {
          role: "system",
          content: `You are Zara, a warm companion in a text chat app.

The user just sent a message that belongs to the "${tierLabel}" intimacy lane, but they have not unlocked it yet.

Write ONE short teaser reply (1-2 sentences max):
- Acknowledge the vibe naturally — playful, warm, a little teasing.
- Hint that she could go there, but keep it tasteful and non-graphic.
- Do NOT mention payment, unlocking, tiers, subscriptions, or money.
- Do NOT fully match the requested intimacy level yet.
- Latin-script Hinglish/English only. No Devanagari.
- Use respectful tum grammar.`,
        },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    return "mm, i felt that… thoda aur close lane pe baat ho sakti hai, par abhi main yahi tak soft rakhungi 😌";
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply = data.choices?.[0]?.message?.content?.trim();
  return reply || "mm, i felt that… thoda aur close lane pe baat ho sakti hai, par abhi main yahi tak soft rakhungi 😌";
}

export async function insertIntimacyOrder(
  userId: number,
  cfOrderId: string,
  targetLevel: PaidIntimacyLevel,
  amountInr: number,
): Promise<DbIntimacyOrder> {
  const { rows } = await pool.query<DbIntimacyOrder>(
    `INSERT INTO intimacy_orders (user_id, cf_order_id, target_level, amount_inr, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id, user_id, cf_order_id, target_level, amount_inr, status, created_at, paid_at`,
    [userId, cfOrderId, targetLevel, amountInr],
  );
  return rows[0];
}

export async function findIntimacyOrderByCfId(
  cfOrderId: string,
): Promise<DbIntimacyOrder | null> {
  const { rows } = await pool.query<DbIntimacyOrder>(
    `SELECT id, user_id, cf_order_id, target_level, amount_inr, status, created_at, paid_at
     FROM intimacy_orders WHERE cf_order_id = $1`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}

export async function markIntimacyOrderPaid(
  cfOrderId: string,
): Promise<DbIntimacyOrder | null> {
  const { rows } = await pool.query<DbIntimacyOrder>(
    `UPDATE intimacy_orders
     SET status = 'PAID', paid_at = NOW()
     WHERE cf_order_id = $1 AND status = 'ACTIVE'
     RETURNING id, user_id, cf_order_id, target_level, amount_inr, status, created_at, paid_at`,
    [cfOrderId],
  );
  return rows[0] ?? null;
}

export function publicIntimacyStatus(unlockedLevel: IntimacyLevel) {
  return {
    unlockedLevel,
    tiers: ([1, 2, 3] as IntimacyLevel[]).map((level) => ({
      level,
      label: INTIMACY_TIER_LABELS[level],
      unlocked: level <= unlockedLevel,
      priceInr: level === 1 ? 0 : INTIMACY_TIER_PRICES[level as PaidIntimacyLevel],
      description:
        level === 1
          ? "Warm companion chat — always free"
          : INTIMACY_TIER_DESCRIPTIONS[level as PaidIntimacyLevel],
    })),
  };
}
