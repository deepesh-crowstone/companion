import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { replyToProfileText } from "./routes/messages.js";
import {
  RIVA_BOT_USERNAME,
  RIVA_PROFILE_SLUG,
  parseTelegramUpdate,
  readUpdateId,
  telegramBotToken,
  telegramWebhookSecret,
  telegramWebhookUrl,
  webhookSecretMatches,
} from "./telegram-inbound.js";

const lanes = new Map<number, Promise<void>>();

function botApi(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramCall(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string; result?: { username?: string } }> {
  const response = await fetch(botApi(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { username?: string };
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description || `Telegram ${method} failed`);
  }
  return { ok: true, result: payload.result };
}

async function sendChatAction(token: string, chatId: number): Promise<void> {
  await telegramCall(token, "sendChatAction", { chat_id: chatId, action: "typing" });
}

async function sendText(token: string, chatId: number, text: string): Promise<void> {
  await telegramCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimUpdate(updateId: number): Promise<boolean> {
  const { rows } = await pool.query<{ update_id: string }>(
    `INSERT INTO telegram_updates (update_id)
     VALUES ($1)
     ON CONFLICT (update_id) DO NOTHING
     RETURNING update_id`,
    [updateId],
  );
  if (rows.length === 0) return false;
  await pool.query(
    `DELETE FROM telegram_updates WHERE created_at < NOW() - INTERVAL '2 days'`,
  );
  return true;
}

async function userIdForTelegram(telegramUserId: number): Promise<number> {
  const existing = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM telegram_identities WHERE telegram_user_id = $1`,
    [telegramUserId],
  );
  if (existing.rows[0]) return existing.rows[0].user_id;

  const username = `tg_riva_${telegramUserId}`;
  const passwordHash = bcrypt.hashSync(randomBytes(24).toString("hex"), 8);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const again = await client.query<{ user_id: number }>(
      `SELECT user_id FROM telegram_identities WHERE telegram_user_id = $1 FOR UPDATE`,
      [telegramUserId],
    );
    if (again.rows[0]) {
      await client.query("COMMIT");
      return again.rows[0].user_id;
    }
    const created = await client.query<{ id: number }>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id`,
      [username, passwordHash],
    );
    const userId = created.rows[0].id;
    const linked = await client.query<{ user_id: number }>(
      `INSERT INTO telegram_identities (telegram_user_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (telegram_user_id) DO NOTHING
       RETURNING user_id`,
      [telegramUserId, userId],
    );
    if (!linked.rows[0]) {
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      const winner = await client.query<{ user_id: number }>(
        `SELECT user_id FROM telegram_identities WHERE telegram_user_id = $1`,
        [telegramUserId],
      );
      await client.query("COMMIT");
      return winner.rows[0].user_id;
    }
    await client.query("COMMIT");
    return userId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deliverBubbles(
  token: string,
  chatId: number,
  bubbles: string[],
): Promise<void> {
  const texts = bubbles.map((bubble) => bubble.trim()).filter(Boolean);
  const outgoing = texts.length > 0 ? texts : ["got stuck, say that again"];
  for (let index = 0; index < outgoing.length; index += 1) {
    if (index > 0) {
      await sendChatAction(token, chatId);
      await sleep(700);
    }
    await sendText(token, chatId, outgoing[index]);
  }
}

async function replyInChat(
  token: string,
  chatId: number,
  telegramUserId: number,
  text: string,
): Promise<void> {
  const typing = setInterval(() => {
    void sendChatAction(token, chatId).catch(() => undefined);
  }, 4000);
  try {
    await sendChatAction(token, chatId);
    const userId = await userIdForTelegram(telegramUserId);
    const bubbles = await replyToProfileText({
      userId,
      profileSlug: RIVA_PROFILE_SLUG,
      text,
      mood: "friendly",
      privateMode: false,
      allowPrivateModeInvite: false,
    });
    await deliverBubbles(token, chatId, bubbles);
  } finally {
    clearInterval(typing);
  }
}

function enqueue(chatId: number, job: () => Promise<void>): void {
  const previous = lanes.get(chatId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(job)
    .finally(() => {
      if (lanes.get(chatId) === next) lanes.delete(chatId);
    });
  lanes.set(chatId, next);
}

export function telegramWebhookAuthorized(header: string | undefined): boolean {
  const token = telegramBotToken();
  if (!token) return false;
  return webhookSecretMatches(telegramWebhookSecret(token), header);
}

export async function acceptTelegramUpdate(body: unknown): Promise<void> {
  const token = telegramBotToken();
  if (!token) return;

  const updateId = readUpdateId(body);
  if (updateId == null) return;
  const claimed = await claimUpdate(updateId);
  if (!claimed) return;

  const inbound = parseTelegramUpdate(body);
  if (inbound.kind === "ignore") return;

  enqueue(inbound.chatId, async () => {
    try {
      if (inbound.kind === "unsupported") {
        await sendText(token, inbound.chatId, "text me yaar, i can't open that here");
        return;
      }
      await replyInChat(token, inbound.chatId, inbound.telegramUserId, inbound.text);
    } catch (error) {
      console.error("Telegram reply failed:", error instanceof Error ? error.message : error);
      try {
        await sendText(token, inbound.chatId, "something glitched, text me again");
      } catch (sendError) {
        console.error(
          "Telegram error reply failed:",
          sendError instanceof Error ? sendError.message : sendError,
        );
      }
    }
  });
}

/** Points the Riva bot at this API. Safe to call on every production boot. */
export async function registerRivaTelegramWebhook(): Promise<void> {
  const token = telegramBotToken();
  if (!token) {
    console.warn("⚠ Telegram bot disabled until TELEGRAM_BOT_TOKEN is set");
    return;
  }
  if (process.env.NODE_ENV !== "production") return;

  const me = await telegramCall(token, "getMe");
  const username = me.result?.username ?? "";
  if (username.toLowerCase() !== RIVA_BOT_USERNAME) {
    console.warn(
      `⚠ TELEGRAM_BOT_TOKEN belongs to @${username || "unknown"}, expected @${RIVA_BOT_USERNAME}`,
    );
  }
  await telegramCall(token, "setWebhook", {
    url: telegramWebhookUrl(),
    secret_token: telegramWebhookSecret(token),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  console.log(`✓ Telegram webhook registered for @${username || RIVA_BOT_USERNAME}`);
}
