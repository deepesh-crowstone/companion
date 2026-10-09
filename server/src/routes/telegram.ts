import { Router, type Request, type Response } from "express";
import {
  acceptTelegramUpdate,
  telegramWebhookAuthorized,
} from "../telegram-bot.js";
import type { TelegramBotId } from "../telegram-inbound.js";

export const telegramRouter = Router();

function webhookHandler(botId: TelegramBotId) {
  return (req: Request, res: Response) => {
    const header = req.header("x-telegram-bot-api-secret-token");
    if (!telegramWebhookAuthorized(header, botId)) {
      res.sendStatus(401);
      return;
    }
    res.sendStatus(200);
    void acceptTelegramUpdate(req.body, botId).catch((error) => {
      console.error(
        `${botId} Telegram update failed:`,
        error instanceof Error ? error.message : error,
      );
    });
  };
}

telegramRouter.post("/webhook", webhookHandler("riva"));
telegramRouter.post("/alakh/webhook", webhookHandler("alakh"));
