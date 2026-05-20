import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db, type DbUser } from "./db.js";

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

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    (req as Request & { auth: AuthPayload }).auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function registerUser(
  username: string,
  password: string,
): { user: DbUser; token: string } | { error: string } {
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

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const result = db
      .prepare(
        "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username, password_hash, created_at",
      )
      .get(trimmed, passwordHash) as DbUser;

    return { user: result, token: signToken(result) };
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return { error: "Username already taken" };
    }
    throw e;
  }
}

export function loginUser(
  username: string,
  password: string,
): { user: DbUser; token: string } | { error: string } {
  const user = db
    .prepare(
      "SELECT id, username, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE",
    )
    .get(username.trim()) as DbUser | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { error: "Invalid username or password" };
  }

  return { user, token: signToken(user) };
}
