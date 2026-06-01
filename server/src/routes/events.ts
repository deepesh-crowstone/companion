import { Router, type Request } from "express";
import { optionalAuthMiddleware, type AuthPayload } from "../auth.js";
import { pool, type DbUserEvent } from "../db.js";

export const eventsRouter = Router();

const ANONYMOUS_EVENTS = new Set(["page_viewed", "site_explored"]);

const MAX_PROPERTY_KEYS = 20;
const MAX_PROPERTIES_BYTES = 2048;

type EventProperties = Record<string, string | number | boolean | null>;

function getOptionalAuth(req: Request): AuthPayload | undefined {
  return (req as Request & { auth?: AuthPayload }).auth;
}

function parseEventProperties(
  raw: unknown,
):
  | { ok: true; value: EventProperties | null }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "eventProperties must be an object" };
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: true, value: null };
  }
  if (entries.length > MAX_PROPERTY_KEYS) {
    return {
      ok: false,
      error: `eventProperties supports at most ${MAX_PROPERTY_KEYS} keys`,
    };
  }

  const value: EventProperties = {};
  for (const [key, val] of entries) {
    if (val === null) {
      value[key] = null;
      continue;
    }
    const type = typeof val;
    if (type === "number" && !Number.isFinite(val)) {
      return { ok: false, error: `eventProperties.${key} must be a finite number` };
    }
    if (type !== "string" && type !== "number" && type !== "boolean") {
      return {
        ok: false,
        error: `eventProperties.${key} must be a string, number, boolean, or null`,
      };
    }
    value[key] = val as string | number | boolean;
  }

  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_PROPERTIES_BYTES) {
    return { ok: false, error: "eventProperties is too large" };
  }

  return { ok: true, value };
}

eventsRouter.post("/", optionalAuthMiddleware, async (req, res) => {
  const auth = getOptionalAuth(req);
  const { eventName, eventTime, eventProperties } = req.body as {
    eventName?: string;
    eventTime?: string;
    eventProperties?: unknown;
  };

  const trimmed = eventName?.trim();
  if (!trimmed) {
    res.status(400).json({ error: "eventName is required" });
    return;
  }
  if (trimmed.length > 128) {
    res.status(400).json({ error: "eventName must be 128 characters or fewer" });
    return;
  }

  const occurredAt = eventTime ? new Date(eventTime) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    res.status(400).json({ error: "Invalid eventTime" });
    return;
  }

  const parsedProps = parseEventProperties(eventProperties);
  if (!parsedProps.ok) {
    res.status(400).json({ error: parsedProps.error });
    return;
  }

  const anonymous = ANONYMOUS_EVENTS.has(trimmed);
  if (!anonymous && !auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { rows } = await pool.query<DbUserEvent>(
      `INSERT INTO user_events (user_id, event_name, event_time, properties)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, user_id, event_name, event_time, properties`,
      [
        anonymous ? null : auth!.userId,
        trimmed,
        occurredAt,
        parsedProps.value ? JSON.stringify(parsedProps.value) : null,
      ],
    );
    res.status(201).json({ event: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to record event" });
  }
});
