import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "../db.js";
import {
  findPrivateModeOrderByCfId,
  getPrivateModeAccess,
  grantPrivateModePass,
  markPrivateModeOrderPaid,
} from "../private-mode.js";
import {
  findPersonalityOrderByCfId,
  getPersonalityAccess,
  grantPersonalityPass,
  markPersonalityOrderPaid,
} from "../personalities.js";
import {
  fetchCashfreeOrder,
  isCashfreeOrderPaid,
} from "../cashfree.js";

export const supportRouter = Router();

function supportAuth(req: Request, res: Response, next: NextFunction): void {
  const expected =
    process.env.SUPPORT_TOKEN?.trim() || process.env.JWT_SECRET?.trim();
  if (!expected) {
    res.status(503).json({ error: "Support token is not configured" });
    return;
  }

  const provided =
    (req.headers["x-support-token"] as string | undefined)?.trim() ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : undefined);

  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

supportRouter.use(supportAuth);

supportRouter.post("/grant-access", async (req, res) => {
  const { username, userId: rawUserId, privateMode, personality, profileSlug } =
    req.body as {
      username?: string;
      userId?: number;
      privateMode?: boolean;
      personality?: boolean;
      profileSlug?: string;
    };

  const grantPrivate = privateMode !== false;
  const grantPersonality = personality === true;

  try {
    let userId = rawUserId;
    if (!userId && username?.trim()) {
      const { rows } = await pool.query<{ id: number; username: string }>(
        `SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)`,
        [username.trim()],
      );
      userId = rows[0]?.id;
    }

    if (!userId) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const result: Record<string, unknown> = { userId };

    if (grantPrivate) {
      const { rows } = await pool.query<{ cf_order_id: string; status: string }>(
        `SELECT cf_order_id, status FROM private_mode_orders
         WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );

      for (const order of rows) {
        if (order.status === "PAID") break;
        if (order.status !== "ACTIVE") continue;
        try {
          const cf = await fetchCashfreeOrder(order.cf_order_id);
          if (!isCashfreeOrderPaid(cf)) continue;
          await markPrivateModeOrderPaid(order.cf_order_id);
          result.reconciledPrivateOrder = order.cf_order_id;
          break;
        } catch {
          // keep trying other orders
        }
      }

      const unlockedUntil = await grantPrivateModePass(userId);
      result.privateMode = {
        ...(await getPrivateModeAccess(userId)),
        grantedUntil: unlockedUntil.toISOString(),
      };
    }

    if (grantPersonality) {
      const slug = profileSlug?.trim() || "zara";
      const { rows } = await pool.query<{
        cf_order_id: string;
        status: string;
        profile_slug: string;
      }>(
        `SELECT cf_order_id, status, profile_slug FROM personality_orders
         WHERE user_id = $1 AND profile_slug = $2 ORDER BY created_at DESC`,
        [userId, slug],
      );

      for (const order of rows) {
        if (order.status === "PAID") break;
        if (order.status !== "ACTIVE") continue;
        try {
          const cf = await fetchCashfreeOrder(order.cf_order_id);
          if (!isCashfreeOrderPaid(cf)) continue;
          await markPersonalityOrderPaid(order.cf_order_id);
          result.reconciledPersonalityOrder = order.cf_order_id;
          break;
        } catch {
          // keep trying
        }
      }

      const unlockedUntil = await grantPersonalityPass(userId, slug);
      result.personality = {
        ...(await getPersonalityAccess(userId, slug)),
        grantedUntil: unlockedUntil.toISOString(),
      };
    }

    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("Support grant-access error:", e);
    res.status(500).json({ error: "Failed to grant access" });
  }
});

supportRouter.post("/reconcile-order", async (req, res) => {
  const { orderId, userId: rawUserId } = req.body as {
    orderId?: string;
    userId?: number;
  };

  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const cf = await fetchCashfreeOrder(orderId);
    if (!isCashfreeOrderPaid(cf)) {
      res.json({
        ok: true,
        paid: false,
        orderStatus: cf.orderStatus,
        paymentStatus: cf.paymentStatus,
      });
      return;
    }

    const privateOrder = await findPrivateModeOrderByCfId(orderId);
    if (privateOrder) {
      if (rawUserId != null && privateOrder.user_id !== rawUserId) {
        res.status(403).json({ error: "Order does not belong to this user" });
        return;
      }
      if (privateOrder.status !== "PAID") {
        await markPrivateModeOrderPaid(orderId);
      }
      const unlockedUntil = await grantPrivateModePass(privateOrder.user_id);
      res.json({
        ok: true,
        paid: true,
        kind: "private_mode",
        userId: privateOrder.user_id,
        unlockedUntil: unlockedUntil.toISOString(),
        access: await getPrivateModeAccess(privateOrder.user_id),
      });
      return;
    }

    const personalityOrder = await findPersonalityOrderByCfId(orderId);
    if (personalityOrder) {
      if (rawUserId != null && personalityOrder.user_id !== rawUserId) {
        res.status(403).json({ error: "Order does not belong to this user" });
        return;
      }
      if (personalityOrder.status !== "PAID") {
        await markPersonalityOrderPaid(orderId);
      }
      const unlockedUntil = await grantPersonalityPass(
        personalityOrder.user_id,
        personalityOrder.profile_slug,
      );
      res.json({
        ok: true,
        paid: true,
        kind: "personality",
        userId: personalityOrder.user_id,
        profileSlug: personalityOrder.profile_slug,
        unlockedUntil: unlockedUntil.toISOString(),
        access: await getPersonalityAccess(
          personalityOrder.user_id,
          personalityOrder.profile_slug,
        ),
      });
      return;
    }

    res.status(404).json({ error: "Order not found" });
  } catch (e) {
    console.error("Support reconcile-order error:", e);
    res.status(500).json({ error: "Failed to reconcile order" });
  }
});
