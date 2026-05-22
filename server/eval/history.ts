import type { DbMessage } from "../src/db.js";
import type { EvalMessage } from "./types.js";

export function toDbHistory(messages: EvalMessage[]): DbMessage[] {
  const baseDate = new Date("2026-05-22T08:30:00.000Z");
  return messages.map((message, index) => ({
    id: index + 1,
    user_id: 1,
    role: message.role,
    content: message.content,
    message_type: message.messageType ?? "text",
    audio_filename: null,
    created_at: new Date(baseDate.getTime() + index * 1000),
  }));
}
