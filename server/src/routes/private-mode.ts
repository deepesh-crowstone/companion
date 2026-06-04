import { Router, type Request } from "express";
import { authMiddleware, type AuthPayload } from "../auth.js";
import {
  buildPrivateModeOrderId,
  cashfreePublicEnvironment,
  createCashfreeOrder,
  fetchCashfreeOrder,
  isCashfreeConfigured,
  isCashfreeOrderPaid,
} from "../cashfree.js";
import {
  findPrivateModeOrderByCfId,
  getPrivateModeAccess,
  grantPrivateModePass,
  insertPrivateModeOrder,
  markPrivateModeOrderPaid,
  PRIVATE_MODE_PASS_PRICE_INR,
  setUserAge,
  deletePrivateMessages,
  setUserPrivateModeActive,
} from "../private-mode.js";

export const privateModeRouter = Router();

function getAuth(req: Request): AuthPayload {
  return (req as Request & { auth: AuthPayload }).auth;
}

privateModeRouter.get("/status", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  try {
    const access = await getPrivateModeAccess(auth.userId);
    res.json({
      ...access,
      cashfreeConfigured: isCashfreeConfigured(),
      cashfreeEnvironment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load private mode access" });
  }
});

privateModeRouter.patch("/age", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  const { age } = req.body as { age?: number };
  if (age == null || typeof age !== "number") {
    res.status(400).json({ error: "Age is required" });
    return;
  }
  const result = await setUserAge(auth.userId, Math.trunc(age));
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

privateModeRouter.post("/enter", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  try {
    const access = await getPrivateModeAccess(auth.userId);
    if (!access.passActive) {
      res.status(403).json({ error: "Private mode pass is not active" });
      return;
    }
    if (!access.ageSet) {
      res.status(403).json({ error: "Age verification is required" });
      return;
    }
    await setUserPrivateModeActive(auth.userId, true);
    res.json({ privateModeActive: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to enter private mode" });
  }
});

privateModeRouter.post("/exit", authMiddleware, async (req, res) => {
  const auth = getAuth(req);
  try {
    await setUserPrivateModeActive(auth.userId, false);
    const deleted = await deletePrivateMessages(auth.userId);
    res.json({ privateModeActive: false, deletedMessageCount: deleted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to exit private mode" });
  }
});

privateModeRouter.post("/orders", authMiddleware, async (req, res) => {
  const auth = getAuth(req);

  if (!isCashfreeConfigured()) {
    res.status(503).json({
      error:
        "Payments are not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET on the server.",
    });
    return;
  }

  try {
    const access = await getPrivateModeAccess(auth.userId);
    if (access.passActive) {
      res.status(400).json({ error: "Private mode is already unlocked" });
      return;
    }

    const cfOrderId = buildPrivateModeOrderId(auth.userId);
    const cfOrder = await createCashfreeOrder({
      orderId: cfOrderId,
      amountInr: PRIVATE_MODE_PASS_PRICE_INR,
      userId: auth.userId,
      username: auth.username,
      orderNote: "Zara private mode (30 days)",
    });

    await insertPrivateModeOrder(
      auth.userId,
      cfOrder.cfOrderId,
      PRIVATE_MODE_PASS_PRICE_INR,
    );

    res.json({
      orderId: cfOrder.cfOrderId,
      paymentSessionId: cfOrder.paymentSessionId,
      amountInr: PRIVATE_MODE_PASS_PRICE_INR,
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
  const localOrder = await findPrivateModeOrderByCfId(cfOrderId);
  if (!localOrder) {
    throw new Error("Order not found");
  }
  if (localOrder.user_id !== userId) {
    throw new Error("Order does not belong to this user");
  }
  if (localOrder.status === "PAID") {
    const access = await getPrivateModeAccess(userId);
    return { alreadyPaid: true as const, access };
  }

  const cfStatus = await fetchCashfreeOrder(cfOrderId);
  if (!isCashfreeOrderPaid(cfStatus)) {
    return { paid: false as const, orderStatus: cfStatus.orderStatus };
  }

  const paidOrder = await markPrivateModeOrderPaid(cfOrderId);
  if (!paidOrder) {
    const access = await getPrivateModeAccess(userId);
    return { alreadyPaid: true as const, access };
  }

  const unlockedUntil = await grantPrivateModePass(userId);
  const access = await getPrivateModeAccess(userId);
  return {
    paid: true as const,
    access,
    unlockedUntil: unlockedUntil.toISOString(),
  };
}

privateModeRouter.post(
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
        const access = await getPrivateModeAccess(auth.userId);
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
        ageSet: result.access.ageSet,
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Failed to verify payment";
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

privateModeRouter.post("/webhook", async (req, res) => {
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

    const localOrder = await findPrivateModeOrderByCfId(cfOrderId);
    if (!localOrder || localOrder.status === "PAID") {
      res.json({ ok: true });
      return;
    }

    await markPrivateModeOrderPaid(cfOrderId);
    await grantPrivateModePass(localOrder.user_id);
    res.json({ ok: true });
  } catch (e) {
    console.error("Private mode Cashfree webhook error:", e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
