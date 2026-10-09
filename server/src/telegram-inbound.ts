import { createHash, timingSafeEqual } from "node:crypto";

/** BotFather username for the open Riva bot. */
export const RIVA_BOT_USERNAME = "riva_pwtalk_bot";

/** Stored profile slug whose spoken name is Riva. */
export const RIVA_PROFILE_SLUG = "zara";

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

export function telegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "");
  if (!token) return null;
  return token;
}

/** Stable webhook secret so random callers cannot post fake updates. */
export function telegramWebhookSecret(token: string): string {
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (explicit) return explicit;
  return createHash("sha256")
    .update(`riva-telegram-webhook:${token}`)
    .digest("hex");
}

export function telegramWebhookUrl(): string {
  const configured = process.env.TELEGRAM_WEBHOOK_BASE_URL?.trim().replace(/\/+$/, "");
  const base = configured || DEFAULT_PUBLIC_API_BASE;
  return `${base}/telegram/webhook`;
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
