import assert from "node:assert/strict";
import test from "node:test";
import {
  RIVA_BOT_USERNAME,
  parseTelegramUpdate,
  readUpdateId,
  telegramWebhookSecret,
  webhookSecretMatches,
} from "../src/telegram-inbound.ts";

test("Riva bot username is the BotFather bot", () => {
  assert.equal(RIVA_BOT_USERNAME, "riva_pwtalk_bot");
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
