import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  alakhSpeechChunks,
  readAlakhTtsConfig,
  synthesizeAlakhSpeech,
} from "./alakh-tts.js";
import { pool } from "./db.js";
import { replyToProfileText } from "./routes/messages.js";
import {
  TELEGRAM_BOTS,
  parseTelegramUpdate,
  readTelegramBotToken,
  readUpdateId,
  telegramWebhookSecret,
  telegramWebhookUrl,
  webhookSecretMatches,
  type TelegramBotConfig,
  type TelegramBotId,
} from "./telegram-inbound.js";
import { readTelegramSttConfig, transcribeVoiceNote } from "./telegram-stt.js";
import {
  LatencyAccount,
  telegramMessageAgeSeconds,
} from "./telegram-latency.js";

const lanes = new Map<string, Promise<void>>();

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

const MAX_VOICE_BYTES = 20 * 1024 * 1024;

async function downloadTelegramVoice(
  token: string,
  fileId: string,
): Promise<{ bytes: Buffer; filename: string; mimeType: string }> {
  const response = await fetch(botApi(token, "getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    description?: string;
    result?: { file_path?: string; file_size?: number };
  };
  const filePath = payload.result?.file_path;
  if (!response.ok || payload.ok === false || !filePath) {
    throw new Error(payload.description || "Telegram getFile failed");
  }
  if ((payload.result?.file_size ?? 0) > MAX_VOICE_BYTES) {
    throw new Error("Voice note is too large");
  }

  let fileResponse: Response;
  try {
    fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  } catch {
    throw new Error("Telegram file download failed");
  }
  if (!fileResponse.ok) {
    throw new Error(`Telegram file download failed: ${fileResponse.status}`);
  }
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  if (bytes.length > MAX_VOICE_BYTES) {
    throw new Error("Voice note is too large");
  }
  return {
    bytes,
    filename: filePath.split("/").pop() || "speech.opus",
    mimeType: "audio/ogg",
  };
}

async function replyToVoiceNote(
  bot: TelegramBotConfig,
  token: string,
  chatId: number,
  telegramUserId: number,
  fileId: string,
  account: LatencyAccount,
): Promise<void> {
  const stt = readTelegramSttConfig();
  if (!stt) {
    await account.time("send", () =>
      sendText(token, chatId, bot.unsupportedReply, account),
    );
    return;
  }
  await account.time("typing", () => sendChatAction(token, chatId));
  const audio = await account.time("download", () =>
    downloadTelegramVoice(token, fileId),
  );
  account.note("bytes", audio.bytes.length);
  const transcript = await account.time("stt", () =>
    transcribeVoiceNote(stt, audio),
  );
  account.note("chars", transcript.length);
  if (!transcript) {
    await account.time("send", () =>
      sendText(token, chatId, bot.voiceMissReply, account),
    );
    return;
  }
  await replyInChat(
    bot,
    token,
    chatId,
    telegramUserId,
    transcript,
    account,
    "voice",
  );
}

async function sendChatAction(
  token: string,
  chatId: number,
  action: "typing" | "record_voice" = "typing",
): Promise<void> {
  await telegramCall(token, "sendChatAction", { chat_id: chatId, action });
}

async function sendText(
  token: string,
  chatId: number,
  text: string,
  account?: LatencyAccount,
): Promise<void> {
  await telegramCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  account?.markFirstSend();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimUpdate(botId: TelegramBotId, updateId: number): Promise<boolean> {
  const { rows } = await pool.query<{ update_id: string }>(
    `INSERT INTO telegram_updates (bot, update_id)
     VALUES ($1, $2)
     ON CONFLICT (bot, update_id) DO NOTHING
     RETURNING update_id`,
    [botId, updateId],
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

  const username = `tg_${telegramUserId}`;
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

async function sendVoice(
  token: string,
  chatId: number,
  audio: Buffer,
  account?: LatencyAccount,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append(
    "voice",
    new Blob([new Uint8Array(audio)], { type: "audio/ogg" }),
    "alakh.ogg",
  );
  const response = await fetch(botApi(token, "sendVoice"), {
    method: "POST",
    body: form,
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description || "Telegram sendVoice failed");
  }
  account?.markFirstSend();
}

async function deliverAlakhVoice(
  token: string,
  chatId: number,
  bubbles: string[],
  emptyReply: string,
  account: LatencyAccount,
): Promise<void> {
  const config = readAlakhTtsConfig();
  const chunks = alakhSpeechChunks(bubbles);
  if (!config || chunks.length === 0) {
    await deliverBubbles(token, chatId, bubbles, emptyReply, account);
    return;
  }
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      if (index > 0) await sleep(400);
      await sendChatAction(token, chatId, "record_voice");
      const audio = await synthesizeAlakhSpeech(chunks[index], config);
      await sendVoice(token, chatId, audio, account);
    }
  } catch (error) {
    console.error(
      "Alakh voice note failed, sending text:",
      error instanceof Error ? error.message : error,
    );
    await deliverBubbles(token, chatId, bubbles, emptyReply, account);
  }
}

async function deliverBubbles(
  token: string,
  chatId: number,
  bubbles: string[],
  emptyReply: string,
  account: LatencyAccount,
): Promise<void> {
  const texts = bubbles.map((bubble) => bubble.trim()).filter(Boolean);
  const outgoing = texts.length > 0 ? texts : [emptyReply];
  for (let index = 0; index < outgoing.length; index += 1) {
    if (index > 0) {
      await sendChatAction(token, chatId);
      await sleep(700);
    }
    await sendText(token, chatId, outgoing[index], account);
  }
}

async function replyInChat(
  bot: TelegramBotConfig,
  token: string,
  chatId: number,
  telegramUserId: number,
  text: string,
  account: LatencyAccount,
  delivery: "text" | "voice" = "text",
): Promise<void> {
  const speak = bot.id === "alakh" && delivery === "voice";
  const action = speak ? "record_voice" : "typing";
  const typing = setInterval(() => {
    void sendChatAction(token, chatId, action).catch(() => undefined);
  }, 4000);
  try {
    await account.time("typing", () => sendChatAction(token, chatId, action));
    const userId = await account.time("identity", () =>
      userIdForTelegram(telegramUserId),
    );
    const bubbles = await replyToProfileText({
      userId,
      profileSlug: bot.profileSlug,
      text,
      mood: "friendly",
      privateMode: false,
      spoken: speak,
      stage: (name, work) => account.time(name, work),
    });
    account.note("bubbles", bubbles.length);
    await account.time("send", () =>
      speak
        ? deliverAlakhVoice(token, chatId, bubbles, bot.emptyReply, account)
        : deliverBubbles(token, chatId, bubbles, bot.emptyReply, account),
    );
  } finally {
    clearInterval(typing);
  }
}

function enqueue(laneKey: string, job: () => Promise<void>): void {
  const previous = lanes.get(laneKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(job)
    .finally(() => {
      if (lanes.get(laneKey) === next) lanes.delete(laneKey);
    });
  lanes.set(laneKey, next);
}

function botConfig(botId: TelegramBotId): TelegramBotConfig {
  return TELEGRAM_BOTS[botId];
}

function botSecret(bot: TelegramBotConfig, token: string): string {
  return telegramWebhookSecret(token, {
    salt: bot.secretSalt,
    secretEnv: bot.secretEnv,
  });
}

export function telegramWebhookAuthorized(
  header: string | undefined,
  botId: TelegramBotId = "riva",
): boolean {
  const bot = botConfig(botId);
  const token = readTelegramBotToken(bot.tokenEnv);
  if (!token) return false;
  return webhookSecretMatches(botSecret(bot, token), header);
}

export async function acceptTelegramUpdate(
  body: unknown,
  botId: TelegramBotId = "riva",
): Promise<void> {
  const bot = botConfig(botId);
  const token = readTelegramBotToken(bot.tokenEnv);
  if (!token) return;

  const updateId = readUpdateId(body);
  if (updateId == null) return;
  const account = new LatencyAccount();
  const ageSeconds = telegramMessageAgeSeconds(body);
  const claimed = await account.time("claim", () => claimUpdate(botId, updateId));
  if (!claimed) return;

  const inbound = parseTelegramUpdate(body);
  if (inbound.kind === "ignore") return;

  enqueue(`${botId}:${inbound.chatId}`, async () => {
    account.wait("queue");
    const kind = inbound.kind;
    try {
      if (inbound.kind === "unsupported") {
        await account.time("send", () =>
          sendText(token, inbound.chatId, bot.unsupportedReply, account),
        );
      } else if (inbound.kind === "voice") {
        await replyToVoiceNote(
          bot,
          token,
          inbound.chatId,
          inbound.telegramUserId,
          inbound.fileId,
          account,
        );
      } else {
        await replyInChat(
          bot,
          token,
          inbound.chatId,
          inbound.telegramUserId,
          inbound.text,
          account,
        );
      }
      account.log({
        username: bot.username,
        kind,
        updateId,
        ageSeconds,
        outcome: "ok",
      });
    } catch (error) {
      console.error(
        `${bot.username} reply failed:`,
        error instanceof Error ? error.message : error,
      );
      try {
        await account.time("error_send", () =>
          sendText(token, inbound.chatId, bot.errorReply, account),
        );
      } catch (sendError) {
        console.error(
          `${bot.username} error reply failed:`,
          sendError instanceof Error ? sendError.message : sendError,
        );
      }
      account.log({
        username: bot.username,
        kind,
        updateId,
        ageSeconds,
        outcome: "error",
      });
    }
  });
}

/** Points one Telegram bot at this API. Safe to call on every production boot. */
export async function registerTelegramWebhook(botId: TelegramBotId): Promise<void> {
  const bot = botConfig(botId);
  const token = readTelegramBotToken(bot.tokenEnv);
  if (!token) {
    console.warn(`⚠ @${bot.username} disabled until ${bot.tokenEnv} is set`);
    return;
  }
  if (process.env.NODE_ENV !== "production") return;

  const me = await telegramCall(token, "getMe");
  const username = me.result?.username ?? "";
  if (username.toLowerCase() !== bot.username.toLowerCase()) {
    console.warn(
      `⚠ ${bot.tokenEnv} belongs to @${username || "unknown"}, expected @${bot.username}`,
    );
  }
  await telegramCall(token, "setWebhook", {
    url: telegramWebhookUrl(bot.webhookPath),
    secret_token: botSecret(bot, token),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  console.log(`✓ Telegram webhook registered for @${username || bot.username}`);
}

/** Points the Riva bot at this API. Safe to call on every production boot. */
export async function registerRivaTelegramWebhook(): Promise<void> {
  await registerTelegramWebhook("riva");
}
