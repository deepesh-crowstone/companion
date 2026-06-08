import { Router } from "express";
import { getAppConfig } from "../app-config.js";

export const configRouter = Router();

// Public, non-sensitive client config (e.g. the free daily message limit).
// The app reads this on launch so values can change from Railway without an
// app update. No auth required.
configRouter.get("/", (_req, res) => {
  res.json(getAppConfig());
});
