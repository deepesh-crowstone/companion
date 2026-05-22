import { Router, type Request } from "express";
import { authMiddleware, type AuthPayload } from "../auth.js";
import {
  buildIntimacyOrderId,
  cashfreePublicEnvironment,
  createCashfreeOrder,
  fetchCashfreeOrder,
  isCashfreeConfigured,
  isCashfreeOrderPaid,
} from "../cashfree.js";
import {
  getUserIntimacyLevel,
  insertIntimacyOrder,
  findIntimacyOrderByCfId,
  INTIMACY_TIER_PRICES,
  markIntimacyOrderPaid,
  publicIntimacyStatus,
  unlockUserIntimacyLevel,
  type PaidIntimacyLevel,
} from "../intimacy.js";

export const intimacyRouter = Router();

function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}

intimacyRouter.get("/status", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  try {
    const unlockedLevel = await getUserIntimacyLevel(auth.userId);
    res.json({
      ...publicIntimacyStatus(unlockedLevel),
      cashfreeConfigured: isCashfreeConfigured(),
      cashfreeEnvironment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load intimacy status" });
  }
});

intimacyRouter.post("/orders", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  const { level } = req.body as { level?: number };

  if (level !== 2 && level !== 3) {
    res.status(400).json({ error: "level must be 2 or 3" });
    return;
  }

  if (!isCashfreeConfigured()) {
    res.status(503).json({
      error:
        "Payments are not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET on the server.",
    });
    return;
  }

  try {
    const unlockedLevel = await getUserIntimacyLevel(auth.userId);
    if (level <= unlockedLevel) {
      res.status(400).json({ error: "This intimacy level is already unlocked" });
      return;
    }

    const targetLevel = level as PaidIntimacyLevel;
    const amountInr = INTIMACY_TIER_PRICES[targetLevel];
    const cfOrderId = buildIntimacyOrderId(auth.userId, targetLevel);

    const cfOrder = await createCashfreeOrder({
      orderId: cfOrderId,
      amountInr,
      userId: auth.userId,
      username: auth.username,
    });

    await insertIntimacyOrder(
      auth.userId,
      cfOrder.cfOrderId,
      targetLevel,
      amountInr,
    );

    res.json({
      orderId: cfOrder.cfOrderId,
      paymentSessionId: cfOrder.paymentSessionId,
      amountInr,
      targetLevel,
      environment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to create payment order";
    res.status(502).json({ error: msg });
  }
});

async function finalizePaidOrder(cfOrderId: string, userId: number) {
  const localOrder = await findIntimacyOrderByCfId(cfOrderId);
  if (!localOrder) {
    throw new Error("Order not found");
  }
  if (localOrder.user_id !== userId) {
    throw new Error("Order does not belong to this user");
  }
  if (localOrder.status === "PAID") {
    const unlockedLevel = await getUserIntimacyLevel(userId);
    return { alreadyPaid: true, unlockedLevel, targetLevel: localOrder.target_level };
  }

  const cfStatus = await fetchCashfreeOrder(cfOrderId);
  if (!isCashfreeOrderPaid(cfStatus)) {
    return { paid: false as const, orderStatus: cfStatus.orderStatus };
  }

  const paidOrder = await markIntimacyOrderPaid(cfOrderId);
  if (!paidOrder) {
    const unlockedLevel = await getUserIntimacyLevel(userId);
    return {
      alreadyPaid: true,
      unlockedLevel,
      targetLevel: localOrder.target_level,
    };
  }

  const unlockedLevel = await unlockUserIntimacyLevel(
    userId,
    paidOrder.target_level,
  );
  return {
    paid: true as const,
    unlockedLevel,
    targetLevel: paidOrder.target_level,
  };
}

intimacyRouter.post("/orders/:orderId/verify", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  const { orderId } = req.params;

  if (!orderId?.trim()) {
    res.status(400).json({ error: "orderId is required" });
    return;
  }

  try {
    const result = await finalizePaidOrder(orderId, auth.userId);
    if ("paid" in result && result.paid === false) {
      res.json({
        paid: false,
        orderStatus: result.orderStatus,
        unlockedLevel: await getUserIntimacyLevel(auth.userId),
      });
      return;
    }

    res.json({
      paid: true,
      unlockedLevel: result.unlockedLevel,
      targetLevel: result.targetLevel,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to verify payment";
    const status = msg.includes("not found") ? 404 : 500;
    res.status(status).json({ error: msg });
  }
});

intimacyRouter.post("/webhook", async (req, res) => {
  try {
    const body = req.body as {
      data?: { order?: { order_id?: string; order_status?: string } };
      order_id?: string;
      order_status?: string;
    };

    const cfOrderId =
      body.data?.order?.order_id ?? body.order_id ?? null;
    const orderStatus = (
      body.data?.order?.order_status ?? body.order_status ?? ""
    ).toUpperCase();

    if (!cfOrderId) {
      res.status(400).json({ error: "Missing order id" });
      return;
    }

    if (orderStatus !== "PAID") {
      res.json({ ok: true, ignored: true });
      return;
    }

    const localOrder = await findIntimacyOrderByCfId(cfOrderId);
    if (!localOrder || localOrder.status === "PAID") {
      res.json({ ok: true });
      return;
    }

    await markIntimacyOrderPaid(cfOrderId);
    await unlockUserIntimacyLevel(localOrder.user_id, localOrder.target_level);
    res.json({ ok: true });
  } catch (e) {
    console.error("Cashfree webhook error:", e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
