import { Router } from "express";
import {
  acceptTelegramUpdate,
  telegramWebhookAuthorized,
} from "../telegram-bot.js";

export const telegramRouter = Router();

telegramRouter.post("/webhook", (req, res) => {
  const header = req.header("x-telegram-bot-api-secret-token");
  if (!telegramWebhookAuthorized(header)) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  void acceptTelegramUpdate(req.body).catch((error) => {
    console.error(
      "Telegram update failed:",
      error instanceof Error ? error.message : error,
    );
  });
});
