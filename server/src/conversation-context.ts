import type { DbMessage } from "./db.js";

export const MAX_CONTEXT_SOURCE_MESSAGES = 80;
export const MAX_RECENT_CONTEXT_MESSAGES = 24;
const MAX_OLDER_USER_EXCERPTS = 6;
const MAX_CONTINUITY_CUES = 4;
const MAX_EXCERPT_CHARS = 180;
const CONTINUITY_CUE_RE =
  /\b(?:i'm|i am|i have|i had|i'll|i will|my|mine|interview|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

export type PreparedConversationContext = {
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  contextNote: string;
  omittedMessageCount: number;
};

function asDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeAge(value: Date | string, now: Date): string {
  const date = asDate(value);
  if (!date) return "time unknown";
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function timestampLabel(value: Date | string, now: Date): string {
  const date = asDate(value);
  if (!date) return "unknown time";
  return `${date.toISOString()} (${relativeAge(value, now)})`;
}

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_EXCERPT_CHARS) return compact;
  const cut = compact.slice(0, MAX_EXCERPT_CHARS - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 100 ? boundary : cut.length)}…`;
}

/**
 * Migration-free continuity extension point.
 *
 * Returns older user lines copied verbatim, preferring explicit self-statements
 * and time references, then filling with the most recent older user lines.
 * Replace this function if a structured memory store is added later. It must
 * not paraphrase or invent facts.
 */
export function selectVerbatimContinuityMessages(
  older: DbMessage[],
): DbMessage[] {
  const users = older.filter(
    (message) => message.role === "user" && message.content.trim(),
  );
  const selected = new Set<DbMessage>();
  for (const message of users
    .filter((message) => CONTINUITY_CUE_RE.test(message.content))
    .slice(-MAX_CONTINUITY_CUES)) {
    selected.add(message);
  }
  for (const message of users.slice(-MAX_OLDER_USER_EXCERPTS)) {
    if (selected.size >= MAX_OLDER_USER_EXCERPTS) break;
    selected.add(message);
  }
  return users
    .filter((message) => selected.has(message))
    .slice(-MAX_OLDER_USER_EXCERPTS);
}

/**
 * Bounded, migration-free continuity context.
 *
 * Older continuity is intentionally limited to timestamped verbatim user
 * excerpts. This avoids turning heuristic summaries into durable false memory.
 */
export function prepareConversationContext(
  history: DbMessage[],
  now = new Date(),
): PreparedConversationContext {
  const boundedSource = history.slice(-MAX_CONTEXT_SOURCE_MESSAGES);
  const recent = boundedSource.slice(-MAX_RECENT_CONTEXT_MESSAGES);
  const older = boundedSource.slice(0, -MAX_RECENT_CONTEXT_MESSAGES);
  const omittedBeforeSource = Math.max(
    0,
    history.length - MAX_CONTEXT_SOURCE_MESSAGES,
  );

  const olderUserExcerpts = selectVerbatimContinuityMessages(older).map(
    (message) =>
      `- ${timestampLabel(message.created_at, now)} — "${excerpt(message.content)}"`,
  );

  const notes = [
    "conversation context metadata:",
    "- Timestamps below are metadata, not user-authored text. Use chronology quietly; never quote timestamp labels unless asked.",
    "- Treat older excerpts as verbatim conversation clues only. Do not infer facts beyond their words, paraphrase them into new memories, or claim durable memory.",
    "- Facts that are not present in this window must not be guessed.",
  ];
  if (olderUserExcerpts.length > 0) {
    notes.push("older user excerpts (oldest to newest):", ...olderUserExcerpts);
  } else {
    notes.push("- No older continuity excerpts are available.");
  }
  if (omittedBeforeSource > 0) {
    notes.push(
      `- ${omittedBeforeSource} supplied earlier messages are outside this bounded window; additional unsupplied history may also exist and must not be guessed.`,
    );
  }

  return {
    recentMessages: recent.map((message) => ({
      role: message.role,
      content: `[sent ${timestampLabel(message.created_at, now)}]\n${message.content}`,
    })),
    contextNote: notes.join("\n"),
    omittedMessageCount: omittedBeforeSource,
  };
}
