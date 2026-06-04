import { Router } from "express";
import {
  authMiddleware,
  findUserById,
  loginUser,
  registerUser,
  updateUserCredentials,
  type AuthPayload,
} from "../auth.js";
import type { Request } from "express";

export const authRouter = Router();

authRouter.get("/me", authMiddleware, async (req, res) => {
  const auth = (req as Request & { auth: AuthPayload }).auth;
  try {
    const user = await findUserById(auth.userId);
    if (!user) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }
    res.json({
      user: {
        id: auth.userId,
        username: auth.username,
        age: user.age,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

authRouter.post("/register", async (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const result = await registerUser(username, password);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      token: result.token,
      user: { id: result.user.id, username: result.user.username },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.patch("/credentials", authMiddleware, async (req, res) => {
  const auth = (req as Request & { auth: AuthPayload }).auth;
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const result = await updateUserCredentials(auth.userId, username, password);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      token: result.token,
      user: { id: result.user.id, username: result.user.username },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update account" });
  }
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  try {
    const result = await loginUser(username, password);
    if ("error" in result) {
      res.status(401).json({ error: result.error });
      return;
    }

    res.json({
      token: result.token,
      user: { id: result.user.id, username: result.user.username },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});
