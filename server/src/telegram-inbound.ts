import { createHash, timingSafeEqual } from "node:crypto";

/** BotFather username for the open Riva bot. */
export const RIVA_BOT_USERNAME = "riva_pwtalk_bot";

/** Stored profile slug whose spoken name is Riva. */
export const RIVA_PROFILE_SLUG = "zara";

/** BotFather username for the open Alakh Sir bot. */
export const ALAKH_BOT_USERNAME = "alakhpandeysir1bot";

export type TelegramBotId = "riva" | "alakh";

export type TelegramBotConfig = {
  id: TelegramBotId;
  username: string;
  profileSlug: string;
  tokenEnv: string;
  secretEnv: string;
  secretSalt: string;
  webhookPath: string;
  unsupportedReply: string;
  errorReply: string;
  emptyReply: string;
};

export const TELEGRAM_BOTS: Record<TelegramBotId, TelegramBotConfig> = {
  riva: {
    id: "riva",
    username: RIVA_BOT_USERNAME,
    profileSlug: RIVA_PROFILE_SLUG,
    tokenEnv: "TELEGRAM_BOT_TOKEN",
    secretEnv: "TELEGRAM_WEBHOOK_SECRET",
    secretSalt: "riva-telegram-webhook",
    webhookPath: "webhook",
    unsupportedReply: "text me yaar, i can't open that here",
    errorReply: "something glitched, text me again",
    emptyReply: "got stuck, say that again",
  },
  alakh: {
    id: "alakh",
    username: ALAKH_BOT_USERNAME,
    profileSlug: "alakh",
    tokenEnv: "TELEGRAM_ALAKH_BOT_TOKEN",
    secretEnv: "TELEGRAM_ALAKH_WEBHOOK_SECRET",
    secretSalt: "alakh-telegram-webhook",
    webhookPath: "alakh/webhook",
    unsupportedReply: "beta, yahan text likh ke bhejo",
    errorReply: "ek second beta, phir se bhej dena",
    emptyReply: "phir se likh dena beta",
  },
};

const DEFAULT_PUBLIC_API_BASE = "https://api.chatlife.online";

export type TelegramInbound =
  | { kind: "ignore" }
  | { kind: "text"; chatId: number; telegramUserId: number; text: string }
  | { kind: "unsupported"; chatId: number };

type TelegramUpdate = {
  update_id?: number;
  message?: {
    chat?: { id?: number; type?: string };
    from?: { id?: number; is_bot?: boolean };
    text?: string;
  };
};

export function readTelegramBotToken(envName: string): string | null {
  const token = process.env[envName]
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
  if (!token) return null;
  return token;
}

export function telegramBotToken(): string | null {
  return readTelegramBotToken("TELEGRAM_BOT_TOKEN");
}

/** Stable webhook secret so random callers cannot post fake updates. */
export function telegramWebhookSecret(
  token: string,
  options?: { salt?: string; secretEnv?: string },
): string {
  const explicit = process.env[options?.secretEnv ?? "TELEGRAM_WEBHOOK_SECRET"]?.trim();
  if (explicit) return explicit;
  const salt = options?.salt ?? "riva-telegram-webhook";
  return createHash("sha256").update(`${salt}:${token}`).digest("hex");
}

export function telegramWebhookUrl(path = "webhook"): string {
  const configured = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim().replace(/\/+$/, "");
  const base = configured || DEFAULT_PUBLIC_API_BASE;
  return `${base}/telegram/${path}`;
}

export function webhookSecretMatches(
  expected: string,
  received: string | undefined,
): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readUpdateId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as TelegramUpdate).update_id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Private text chats become Riva replies. /start is stored as a normal hello
 * so the opening greeting runs. Groups, bots, and non-text messages are split out.
 */
export function parseTelegramUpdate(body: unknown): TelegramInbound {
  if (!body || typeof body !== "object") return { kind: "ignore" };
  const message = (body as TelegramUpdate).message;
  if (!message?.chat || message.chat.type !== "private") return { kind: "ignore" };
  if (typeof message.chat.id !== "number") return { kind: "ignore" };
  if (!message.from || message.from.is_bot || typeof message.from.id !== "number") {
    return { kind: "ignore" };
  }

  const text = message.text?.trim();
  if (!text) return { kind: "unsupported", chatId: message.chat.id };

  const command = text.split(/\s+/, 1)[0]?.split("@", 1)[0]?.toLowerCase();
  const normalized =
    command === "/start" || command === "/help" ? "hi" : text;

  return {
    kind: "text",
    chatId: message.chat.id,
    telegramUserId: message.from.id,
    text: normalized,
  };
}
