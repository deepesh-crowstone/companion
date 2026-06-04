import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { pool, type DbUser } from "./db.js";

const JWT_EXPIRY = "30d";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set in environment");
  }
  return secret;
}

export type AuthPayload = { userId: number; username: string };

export function signToken(user: DbUser): string {
  return jwt.sign(
    { userId: user.id, username: user.username } satisfies AuthPayload,
    jwtSecret(),
    { expiresIn: JWT_EXPIRY },
  );
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, jwtSecret()) as AuthPayload;
}

export async function findUserById(userId: number): Promise<DbUser | null> {
  const { rows } = await pool.query<DbUser>(
    `SELECT id, username, password_hash, intimacy_level_unlocked, age,
            COALESCE(private_mode_active, FALSE) AS private_mode_active, created_at
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    const user = await findUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        error: "Session expired. Please log in again.",
      });
      return;
    }
    (req as Request & { auth: AuthPayload }).auth = {
      userId: user.id,
      username: user.username,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    const user = await findUserById(payload.userId);
    if (user) {
      (req as Request & { auth?: AuthPayload }).auth = {
        userId: user.id,
        username: user.username,
      };
    }
  } catch {
    // Ignore invalid tokens for anonymous analytics events.
  }

  next();
}

export async function registerUser(
  username: string,
  password: string,
): Promise<{ user: DbUser; token: string } | { error: string }> {
  const validated = validateCredentials(username, password);
  if ("error" in validated) {
    return validated;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const { rows } = await pool.query<DbUser>(
      `INSERT INTO users (username, password_hash)
       VALUES ($1, $2)
       RETURNING id, username, password_hash, intimacy_level_unlocked, created_at`,
      [validated.username, passwordHash],
    );
    const user = rows[0];
    return { user, token: signToken(user) };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
      return { error: "Username already taken" };
    }
    throw e;
  }
}

function validateCredentials(
  username: string,
  password: string,
): { username: string } | { error: string } {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return { error: "Username must be 3–32 characters" };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { error: "Username can only contain letters, numbers, and underscores" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  return { username: trimmed };
}

export async function updateUserCredentials(
  userId: number,
  username: string,
  password: string,
): Promise<{ user: DbUser; token: string } | { error: string }> {
  const validated = validateCredentials(username, password);
  if ("error" in validated) {
    return validated;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET username = $1, password_hash = $2
       WHERE id = $3
       RETURNING id, username, password_hash, intimacy_level_unlocked, created_at`,
      [validated.username, passwordHash, userId],
    );
    const user = rows[0];
    if (!user) {
      return { error: "User not found" };
    }
    return { user, token: signToken(user) };
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
      return { error: "Username already taken" };
    }
    throw e;
  }
}

export async function loginUser(
  username: string,
  password: string,
): Promise<{ user: DbUser; token: string } | { error: string }> {
  const { rows } = await pool.query<DbUser>(
    `SELECT id, username, password_hash, intimacy_level_unlocked, created_at
     FROM users WHERE LOWER(username) = LOWER($1)`,
    [username.trim()],
  );
  const user = rows[0];

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { error: "Invalid username or password" };
  }

  return { user, token: signToken(user) };
}
