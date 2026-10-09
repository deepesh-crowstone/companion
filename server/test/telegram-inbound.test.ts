import assert from "node:assert/strict";
import test from "node:test";
import {
  ALAKH_BOT_USERNAME,
  RIVA_BOT_USERNAME,
  TELEGRAM_BOTS,
  parseTelegramUpdate,
  readUpdateId,
  telegramWebhookSecret,
  telegramWebhookUrl,
  webhookSecretMatches,
} from "../src/telegram-inbound.ts";

test("Riva bot username is the BotFather bot", () => {
  assert.equal(RIVA_BOT_USERNAME, "riva_pwtalk_bot");
});

test("Alakh Sir bot is a separate webhook and profile", () => {
  assert.equal(ALAKH_BOT_USERNAME, "alakhpandeysir1Bot");
  assert.equal(TELEGRAM_BOTS.alakh.profileSlug, "alakh");
  assert.equal(TELEGRAM_BOTS.alakh.tokenEnv, "TELEGRAM_ALAKH_BOT_TOKEN");
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
  const previousAlakh = process.env.TELEGRAM_ALAKH_WEBHOOK_SECRET;
  const previousBase = process.env.TELEGRAM_WEBHOOK_BASE_URL;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_ALAKH_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
  assert.equal(
    telegramWebhookUrl(TELEGRAM_BOTS.alakh.webhookPath),
    "https://api.chatlife.online/telegram/alakh/webhook",
  );
  assert.notEqual(
    telegramWebhookUrl(TELEGRAM_BOTS.alakh.webhookPath),
    telegramWebhookUrl(TELEGRAM_BOTS.riva.webhookPath),
  );
  assert.notEqual(
    telegramWebhookSecret("shared-token"),
    telegramWebhookSecret("shared-token", {
      salt: TELEGRAM_BOTS.alakh.secretSalt,
      secretEnv: TELEGRAM_BOTS.alakh.secretEnv,
    }),
  );
  if (previous == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
  if (previousAlakh == null) delete process.env.TELEGRAM_ALAKH_WEBHOOK_SECRET;
  else process.env.TELEGRAM_ALAKH_WEBHOOK_SECRET = previousAlakh;
  if (previousBase == null) delete process.env.TELEGRAM_WEBHOOK_BASE_URL;
  else process.env.TELEGRAM_WEBHOOK_BASE_URL = previousBase;
});

test("private text is delivered to Riva and /start opens like a hello", () => {
  assert.deepEqual(
    parseTelegramUpdate({
      update_id: 10,
      message: {
        message_id: 1,
        text: "  what are you doing  ",
        chat: { id: 55, type: "private" },
        from: { id: 99, is_bot: false },
      },
    }),
    { kind: "text", chatId: 55, telegramUserId: 99, text: "what are you doing" },
  );

  assert.deepEqual(
    parseTelegramUpdate({
      update_id: 11,
      message: {
        text: "/start@riva_pwtalk_bot",
        chat: { id: 55, type: "private" },
        from: { id: 99, is_bot: false },
      },
    }),
    { kind: "text", chatId: 55, telegramUserId: 99, text: "hi" },
  );
});

test("groups, bots, and non-text messages do not enter the reply model", () => {
  assert.deepEqual(
    parseTelegramUpdate({
      update_id: 1,
      message: {
        text: "hi",
        chat: { id: 7, type: "group" },
        from: { id: 3, is_bot: false },
      },
    }),
    { kind: "ignore" },
  );
  assert.deepEqual(
    parseTelegramUpdate({
      update_id: 2,
      message: {
        sticker: { file_id: "x" },
        chat: { id: 7, type: "private" },
        from: { id: 3, is_bot: false },
      },
    }),
    { kind: "unsupported", chatId: 7 },
  );
  assert.equal(readUpdateId({ update_id: 42 }), 42);
  assert.equal(readUpdateId({}), null);
});

test("webhook secret matches only the exact header", () => {
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const secret = telegramWebhookSecret("test-token");
  assert.equal(webhookSecretMatches(secret, secret), true);
  assert.equal(webhookSecretMatches(secret, `${secret}x`), false);
  assert.equal(webhookSecretMatches(secret, undefined), false);
  if (previous == null) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
});
