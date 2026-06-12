import { Router, type Request } from "express";
import { authMiddleware, type AuthPayload } from "../auth.js";
import {
  buildPersonalityOrderId,
  cashfreePublicEnvironment,
  createCashfreeOrder,
  fetchCashfreeOrder,
  isCashfreeConfigured,
  isCashfreeOrderPaid,
} from "../cashfree.js";
import {
  findPersonalityOrderByCfId,
  getPersonalityAccess,
  grantPersonalityPass,
  insertPersonalityOrder,
  markPersonalityOrderPaid,
} from "../personalities.js";
import { getPersonalityPassPricing } from "../pricing.js";

export const personalitiesRouter = Router();

function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}

personalitiesRouter.get("/status", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  try {
    const access = await getPersonalityAccess(auth.userId);
    res.json({
      ...access,
      cashfreeConfigured: isCashfreeConfigured(),
      cashfreeEnvironment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load personality access" });
  }
});

personalitiesRouter.post("/orders", authMiddleware, async (req, res) => {
  const auth = getAuth(req);

  if (!isCashfreeConfigured()) {
    res.status(503).json({
      error:
        "Payments are not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET on the server.",
    });
    return;
  }

  try {
    const access = await getPersonalityAccess(auth.userId);
    if (access.passActive) {
      res.status(400).json({ error: "Personalities are already unlocked" });
      return;
    }

    const pricing = getPersonalityPassPricing();
    const cfOrderId = buildPersonalityOrderId(auth.userId);
    const cfOrder = await createCashfreeOrder({
      orderId: cfOrderId,
      amountInr: pricing.priceInr,
      userId: auth.userId,
      username: auth.username,
      orderNote: "Zara personality pass (30 days)",
      itemName: "Zara Personality Pass",
      itemDescription: "30-day personality unlock pass",
    });

    await insertPersonalityOrder(
      auth.userId,
      cfOrder.cfOrderId,
      pricing.priceInr,
    );

    res.json({
      orderId: cfOrder.cfOrderId,
      paymentSessionId: cfOrder.paymentSessionId,
      amountInr: pricing.priceInr,
      passDays: access.passDays,
      environment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to create payment order";
    res.status(502).json({ error: msg });
  }
});

async function finalizePaidOrder(cfOrderId: string, userId: number) {
  const localOrder = await findPersonalityOrderByCfId(cfOrderId);
  if (!localOrder) {
    throw new Error("Order not found");
  }
  if (localOrder.user_id !== userId) {
    throw new Error("Order does not belong to this user");
  }
  if (localOrder.status === "PAID") {
    const access = await getPersonalityAccess(userId);
    return { alreadyPaid: true as const, access };
  }

  const cfStatus = await fetchCashfreeOrder(cfOrderId);
  if (!isCashfreeOrderPaid(cfStatus)) {
    return { paid: false as const, orderStatus: cfStatus.orderStatus };
  }

  const paidOrder = await markPersonalityOrderPaid(cfOrderId);
  if (!paidOrder) {
    const access = await getPersonalityAccess(userId);
    return { alreadyPaid: true as const, access };
  }

  const unlockedUntil = await grantPersonalityPass(userId);
  const access = await getPersonalityAccess(userId);
  return {
    paid: true as const,
    access,
    unlockedUntil: unlockedUntil.toISOString(),
  };
}

personalitiesRouter.post(
  "/orders/:orderId/verify",
  authMiddleware,
  async (req, res) => {
    const auth = getAuth(req);
    const { orderId } = req.params;

    if (!orderId?.trim()) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    try {
      const result = await finalizePaidOrder(orderId, auth.userId);
      if ("paid" in result && result.paid === false) {
        const access = await getPersonalityAccess(auth.userId);
        res.json({
          paid: false,
          orderStatus: result.orderStatus,
          passActive: access.passActive,
          unlockedUntil: access.unlockedUntil,
        });
        return;
      }

      res.json({
        paid: true,
        passActive: result.access.passActive,
        unlockedUntil: result.access.unlockedUntil,
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Failed to verify payment";
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

personalitiesRouter.post("/webhook", async (req, res) => {
  try {
    const body = req.body as {
      data?: { order?: { order_id?: string; order_status?: string } };
      order_id?: string;
      order_status?: string;
    };

    const cfOrderId = body.data?.order?.order_id ?? body.order_id ?? null;
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

    const localOrder = await findPersonalityOrderByCfId(cfOrderId);
    if (!localOrder || localOrder.status === "PAID") {
      res.json({ ok: true });
      return;
    }

    await markPersonalityOrderPaid(cfOrderId);
    await grantPersonalityPass(localOrder.user_id);
    res.json({ ok: true });
  } catch (e) {
    console.error("Cashfree webhook error:", e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
