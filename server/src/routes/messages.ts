import { Router, type Request } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, type AuthPayload } from "../auth.js";
import { pool, getUploadsDir, type DbMessage } from "../db.js";
import {
  getPresignedVoiceUrl,
  isBucketConfigured,
  uploadVoiceObject,
} from "../storage.js";
import { chatWithMia, synthesizeSpeech, transcribeAudio } from "../xai.js";

const upload = multer({
  dest: getUploadsDir(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const messagesRouter = Router();

messagesRouter.use(authMiddleware);

function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}

function apiErrorFromDb(e: unknown): { status: number; message: string } | null {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code: string }).code;
    if (code === "23503") {
      return {
        status: 401,
        message: "Session expired. Please log in again.",
      };
    }
  }
  return null;
}

async function listMessages(userId: number): Promise<DbMessage[]> {
  const { rows } = await pool.query<DbMessage>(
    `SELECT id, user_id, role, content, message_type, audio_filename, created_at
     FROM messages WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId],
  );
  return rows;
}

async function insertMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  messageType: "text" | "audio",
  audioFilename: string | null = null,
): Promise<DbMessage> {
  const { rows } = await pool.query<DbMessage>(
    `INSERT INTO messages (user_id, role, content, message_type, audio_filename)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, role, content, message_type, audio_filename, created_at`,
    [userId, role, content, messageType, audioFilename],
  );
  return rows[0];
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

async function resolveAudioUrl(
  msg: DbMessage,
  baseUrl: string,
): Promise<string | null> {
  if (msg.audio_filename == null) return null;

  if (isBucketConfigured()) {
    try {
      return await getPresignedVoiceUrl(msg.audio_filename);
    } catch (e) {
      console.warn("Bucket presign failed, falling back to disk URL:", e);
    }
  }

  const name = msg.audio_filename.replace(/^voice\//, "");
  return `${baseUrl}/uploads/${name}`;
}

async function toPublicMessage(msg: DbMessage, baseUrl: string) {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    messageType: msg.message_type,
    audioUrl: await resolveAudioUrl(msg, baseUrl),
    createdAt: toIsoTimestamp(msg.created_at),
  };
}

messagesRouter.get("/", async (req, res) => {
  const auth = getAuth(req);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  try {
    const messages = await listMessages(auth.userId);
    const publicMessages = await Promise.all(
      messages.map((m) => toPublicMessage(m, baseUrl)),
    );
    res.json({ messages: publicMessages });
  } catch (e) {
    console.error(e);
    const mapped = apiErrorFromDb(e);
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    res.status(500).json({ error: "Failed to load messages" });
  }
});

messagesRouter.post("/text", async (req, res) => {
  const auth = getAuth(req);
  const { text } = req.body as { text?: string };
  const trimmed = text?.trim();

  if (!trimmed) {
    res.status(400).json({ error: "Message text is required" });
    return;
  }

  try {
    const history = await listMessages(auth.userId);
    const userMsg = await insertMessage(auth.userId, "user", trimmed, "text");

    const reply = await chatWithMia([...history, userMsg]);
    const assistantMsg = await insertMessage(auth.userId, "assistant", reply, "text");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessage: await toPublicMessage(userMsg, baseUrl),
      assistantMessage: await toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
    const mapped = apiErrorFromDb(e);
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to send message";
    const isXai = msg.includes("API key") || msg.includes("Chat failed");
    res.status(isXai ? 502 : 500).json({
      error: isXai
        ? "Mia could not reach xAI. Check XAI_API_KEY in server/.env and restart npm run dev."
        : msg,
    });
  }
});

messagesRouter.post("/text/batch", async (req, res) => {
  const auth = getAuth(req);
  const { texts } = req.body as { texts?: string[] };
  const trimmed = (texts ?? [])
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0);

  if (trimmed.length === 0) {
    res.status(400).json({ error: "At least one message is required" });
    return;
  }

  try {
    const history = await listMessages(auth.userId);
    const userMsgs: DbMessage[] = [];
    for (const text of trimmed) {
      userMsgs.push(await insertMessage(auth.userId, "user", text, "text"));
    }

    const reply = await chatWithMia([...history, ...userMsgs]);
    const assistantMsg = await insertMessage(auth.userId, "assistant", reply, "text");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessages: await Promise.all(
        userMsgs.map((m) => toPublicMessage(m, baseUrl)),
      ),
      assistantMessage: await toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
    const mapped = apiErrorFromDb(e);
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to send messages";
    const isXai = msg.includes("API key") || msg.includes("Chat failed");
    res.status(isXai ? 502 : 500).json({
      error: isXai
        ? "Mia could not reach xAI. Check XAI_API_KEY in server/.env and restart npm run dev."
        : msg,
    });
  }
});

messagesRouter.post("/voice", upload.single("audio"), async (req, res) => {
  const auth = getAuth(req);
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "Audio file is required" });
    return;
  }

  const ext = path.extname(file.originalname) || ".m4a";
  const localName = `${uuidv4()}${ext}`;
  const { readFileSync, renameSync, unlinkSync, writeFileSync } = await import("fs");
  const finalPath = path.join(getUploadsDir(), localName);
  renameSync(file.path, finalPath);

  const mime =
    file.mimetype && file.mimetype !== "application/octet-stream"
      ? file.mimetype
      : "audio/mp4";

  const cleanupLocal = () => {
    try {
      unlinkSync(finalPath);
    } catch {
      /* ignore */
    }
  };

  try {
    const history = await listMessages(auth.userId);
    const transcript = await transcribeAudio(finalPath, mime);

    if (!transcript) {
      res.status(400).json({ error: "Could not transcribe audio" });
      return;
    }

    let userAudioKey = localName;
    if (isBucketConfigured()) {
      const userBuffer = readFileSync(finalPath);
      userAudioKey = await uploadVoiceObject(localName, userBuffer, mime);
      cleanupLocal();
    }

    const userMsg = await insertMessage(
      auth.userId,
      "user",
      transcript,
      "audio",
      userAudioKey,
    );

    const reply = await chatWithMia([...history, userMsg]);
    const mp3Buffer = await synthesizeSpeech(reply);
    const assistantLocalName = `${uuidv4()}.mp3`;
    let assistantAudioKey = assistantLocalName;

    if (isBucketConfigured()) {
      assistantAudioKey = await uploadVoiceObject(
        assistantLocalName,
        mp3Buffer,
        "audio/mpeg",
      );
    } else {
      writeFileSync(path.join(getUploadsDir(), assistantLocalName), mp3Buffer);
    }

    const assistantMsg = await insertMessage(
      auth.userId,
      "assistant",
      reply,
      "audio",
      assistantAudioKey,
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessage: await toPublicMessage(userMsg, baseUrl),
      assistantMessage: await toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
    const mapped = apiErrorFromDb(e);
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to process voice note";
    const isXai = msg.includes("API key") || msg.includes("STT failed") || msg.includes("TTS failed");
    res.status(isXai ? 502 : 500).json({
      error: isXai
        ? "Mia could not reach xAI. Check XAI_API_KEY in server/.env and restart npm run dev."
        : msg,
    });
  }
});
