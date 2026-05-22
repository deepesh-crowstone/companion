import { readdir, readFile } from "fs/promises";
import path from "path";
import type { FeedbackRecord, FeedbackSummary } from "./types.js";

export const DEFAULT_FEEDBACK_DIR = path.join(process.cwd(), "eval", "feedback");

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?91[\s-]?)?[6-9]\d{9}\b/g;
const LONG_NUMBER_RE = /\b\d{6,}\b/g;

function redact(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]")
    .replace(LONG_NUMBER_RE, "[redacted-number]");
}

function sanitizeRecord(record: FeedbackRecord): FeedbackRecord {
  return {
    ...record,
    userMessage: redact(record.userMessage),
    assistantReply: redact(record.assistantReply),
    notes: redact(record.notes),
  };
}

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<FeedbackRecord>;
  return (
    typeof record.id === "string" &&
    (record.rating === "up" ||
      record.rating === "down" ||
      record.rating === "neutral") &&
    (record.channel === "text" ||
      record.channel === "voice" ||
      record.channel === "text_tagged_voice")
  );
}

async function readFeedbackFile(file: string): Promise<FeedbackRecord[]> {
  const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        "feedback" in parsed &&
        Array.isArray((parsed as { feedback?: unknown }).feedback)
      ? (parsed as { feedback: unknown[] }).feedback
      : [];
  return records.filter(isFeedbackRecord).map(sanitizeRecord);
}

export async function loadFeedbackSummary(
  feedbackDir = DEFAULT_FEEDBACK_DIR,
): Promise<FeedbackSummary> {
  let files: string[] = [];
  try {
    const entries = await readdir(feedbackDir, { withFileTypes: true });
    files = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          !entry.name.startsWith("example"),
      )
      .map((entry) => path.join(feedbackDir, entry.name))
      .sort();
  } catch {
    files = [];
  }

  const records = (
    await Promise.all(files.map((file) => readFeedbackFile(file)))
  ).flat();

  const summary: FeedbackSummary = {
    total: records.length,
    up: 0,
    down: 0,
    neutral: 0,
    reasonTagCounts: {},
    redactedExamples: [],
  };

  for (const record of records) {
    summary[record.rating] += 1;
    for (const tag of record.reasonTags ?? []) {
      summary.reasonTagCounts[tag] = (summary.reasonTagCounts[tag] ?? 0) + 1;
    }
  }

  summary.redactedExamples = records
    .filter((record) => record.rating !== "up")
    .slice(0, 10);

  return summary;
}
