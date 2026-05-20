import { Router, type Request } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, type AuthPayload } from "../auth.js";
import { db, getUploadsDir, type DbMessage } from "../db.js";
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

function listMessages(userId: number): DbMessage[] {
  return db
    .prepare(
      `SELECT id, user_id, role, content, message_type, audio_filename, created_at
       FROM messages WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(userId) as DbMessage[];
}

function insertMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
  messageType: "text" | "audio",
  audioFilename: string | null = null,
): DbMessage {
  return db
    .prepare(
      `INSERT INTO messages (user_id, role, content, message_type, audio_filename)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, user_id, role, content, message_type, audio_filename, created_at`,
    )
    .get(userId, role, content, messageType, audioFilename) as DbMessage;
}

/** SQLite datetime('now') is UTC but stored without a timezone suffix. */
function sqliteUtcToIso(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("T") && /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }
  const normalized = trimmed.replace(" ", "T");
  return new Date(`${normalized}Z`).toISOString();
}

function toPublicMessage(msg: DbMessage, baseUrl: string) {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    messageType: msg.message_type,
    audioUrl:
      msg.audio_filename != null
        ? `${baseUrl}/uploads/${msg.audio_filename}`
        : null,
    createdAt: sqliteUtcToIso(msg.created_at),
  };
}

messagesRouter.get("/", (req, res) => {
  const auth = getAuth(req);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const messages = listMessages(auth.userId).map((m) =>
    toPublicMessage(m, baseUrl),
  );
  res.json({ messages });
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
    const history = listMessages(auth.userId);
    const userMsg = insertMessage(auth.userId, "user", trimmed, "text");

    const reply = await chatWithMia([...history, userMsg]);
    const assistantMsg = insertMessage(auth.userId, "assistant", reply, "text");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessage: toPublicMessage(userMsg, baseUrl),
      assistantMessage: toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
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
    const history = listMessages(auth.userId);
    const userMsgs: DbMessage[] = [];
    for (const text of trimmed) {
      userMsgs.push(insertMessage(auth.userId, "user", text, "text"));
    }

    const reply = await chatWithMia([...history, ...userMsgs]);
    const assistantMsg = insertMessage(auth.userId, "assistant", reply, "text");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessages: userMsgs.map((m) => toPublicMessage(m, baseUrl)),
      assistantMessage: toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
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
  const savedName = `${uuidv4()}${ext}`;
  const { renameSync } = await import("fs");
  const finalPath = path.join(getUploadsDir(), savedName);
  renameSync(file.path, finalPath);

  const mime =
    file.mimetype && file.mimetype !== "application/octet-stream"
      ? file.mimetype
      : "audio/mp4";

  try {
    const history = listMessages(auth.userId);
    const transcript = await transcribeAudio(finalPath, mime);

    if (!transcript) {
      res.status(400).json({ error: "Could not transcribe audio" });
      return;
    }

    const userMsg = insertMessage(
      auth.userId,
      "user",
      transcript,
      "audio",
      savedName,
    );

    const reply = await chatWithMia([...history, userMsg]);
    const mp3Buffer = await synthesizeSpeech(reply);
    const assistantAudioName = `${uuidv4()}.mp3`;
    const { writeFileSync } = await import("fs");
    writeFileSync(path.join(getUploadsDir(), assistantAudioName), mp3Buffer);

    const assistantMsg = insertMessage(
      auth.userId,
      "assistant",
      reply,
      "audio",
      assistantAudioName,
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      userMessage: toPublicMessage(userMsg, baseUrl),
      assistantMessage: toPublicMessage(assistantMsg, baseUrl),
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to process voice note";
    const isXai = msg.includes("API key") || msg.includes("STT failed") || msg.includes("TTS failed");
    res.status(isXai ? 502 : 500).json({
      error: isXai
        ? "Mia could not reach xAI. Check XAI_API_KEY in server/.env and restart npm run dev."
        : msg,
    });
  }
});
