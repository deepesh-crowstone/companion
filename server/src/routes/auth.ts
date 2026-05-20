import { Router } from "express";
import { authMiddleware, loginUser, registerUser, type AuthPayload } from "../auth.js";
import type { Request } from "express";

export const authRouter = Router();

authRouter.get("/me", authMiddleware, (req, res) => {
  const auth = (req as Request & { auth: AuthPayload }).auth;
  res.json({ user: { id: auth.userId, username: auth.username } });
});

authRouter.post("/register", (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const result = registerUser(username, password);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({
    token: result.token,
    user: { id: result.user.id, username: result.user.username },
  });
});

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const result = loginUser(username, password);
  if ("error" in result) {
    res.status(401).json({ error: result.error });
    return;
  }

  res.json({
    token: result.token,
    user: { id: result.user.id, username: result.user.username },
  });
});
