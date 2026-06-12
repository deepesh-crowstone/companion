import admin from "firebase-admin";
import { pool } from "./db.js";

type PushMessageType = "text" | "audio" | "image";

let initialized = false;

function parseServiceAccount():
  | admin.ServiceAccount
  | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as admin.ServiceAccount;
  } catch {
    console.warn("FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON");
    return null;
  }
}

function ensureFirebaseAdmin(): boolean {
  if (initialized) return true;

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) return false;

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
  return true;
}

export function isPushConfigured(): boolean {
  return ensureFirebaseAdmin();
}

export async function upsertDeviceToken(
  userId: number,
  fcmToken: string,
  platform = "android",
): Promise<void> {
  await pool.query(
    `INSERT INTO push_device_tokens (user_id, fcm_token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (fcm_token)
     DO UPDATE SET user_id = EXCLUDED.user_id,
                   platform = EXCLUDED.platform,
                   updated_at = NOW()`,
    [userId, fcmToken, platform],
  );
}

export async function removeDeviceToken(
  userId: number,
  fcmToken: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM push_device_tokens
     WHERE user_id = $1 AND fcm_token = $2`,
    [userId, fcmToken],
  );
}

export async function listDeviceTokens(userId: number): Promise<string[]> {
  const { rows } = await pool.query<{ fcm_token: string }>(
    `SELECT fcm_token FROM push_device_tokens WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => row.fcm_token);
}

function notificationBody(
  messageType: PushMessageType,
  content: string,
): string {
  switch (messageType) {
    case "audio":
      return "Zara sent you a voice note";
    case "image":
      return "Zara sent you a photo";
    default: {
      const trimmed = content.trim();
      if (!trimmed) return "Zara sent you a message";
      return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
    }
  }
}

async function removeInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await pool.query(
    `DELETE FROM push_device_tokens WHERE fcm_token = ANY($1::text[])`,
    [tokens],
  );
}

export async function notifyUserOfAssistantMessage(
  userId: number,
  message: {
    id: number;
    content: string;
    messageType: PushMessageType;
  },
): Promise<void> {
  if (!ensureFirebaseAdmin()) return;

  const tokens = await listDeviceTokens(userId);
  if (tokens.length === 0) return;

  const body = notificationBody(message.messageType, message.content);
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: "Zara",
      body,
    },
    data: {
      type: "new_message",
      messageId: String(message.id),
      messageType: message.messageType,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "zara_messages",
        sound: "default",
      },
    },
  });

  const invalidTokens: string[] = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[index]);
    } else if (result.error) {
      console.warn("FCM send failed:", result.error.message);
    }
  });

  await removeInvalidTokens(invalidTokens);
}

export async function notifyUserOfAssistantMessages(
  userId: number,
  messages: {
    id: number;
    content: string;
    message_type: PushMessageType;
  }[],
): Promise<void> {
  if (messages.length === 0) return;

  const last = messages[messages.length - 1];
  const combinedText = messages
    .filter((m) => m.message_type === "text")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");

  const messageType =
    last.message_type === "text" && combinedText
      ? ("text" as const)
      : last.message_type;

  await notifyUserOfAssistantMessage(userId, {
    id: last.id,
    content:
      messageType === "text" ? combinedText || last.content : last.content,
    messageType,
  });
}
