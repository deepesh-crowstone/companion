import { Router, type Request } from "express";
import { optionalAuthMiddleware, type AuthPayload } from "../auth.js";
import { pool, type DbUserEvent } from "../db.js";

export const eventsRouter = Router();

const ANONYMOUS_EVENTS = new Set(["page_viewed"]);

function getOptionalAuth(req: Request): AuthPayload | undefined {
  return (req as Request & { auth?: AuthPayload }).auth;
}

eventsRouter.post("/", optionalAuthMiddleware, async (req, res) => {
  const auth = getOptionalAuth(req);
  const { eventName, eventTime } = req.body as {
    eventName?: string;
    eventTime?: string;
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

  const anonymous = ANONYMOUS_EVENTS.has(trimmed);
  if (!anonymous && !auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { rows } = await pool.query<DbUserEvent>(
      `INSERT INTO user_events (user_id, event_name, event_time)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, event_name, event_time`,
      [anonymous ? null : auth!.userId, trimmed, occurredAt],
    );
    res.status(201).json({ event: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to record event" });
  }
});
