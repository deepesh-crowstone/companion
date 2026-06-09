import { Router, type Request } from "express";
import { authMiddleware, type AuthPayload } from "../auth.js";
import { cashfreePublicEnvironment, isCashfreeConfigured } from "../cashfree.js";
import {
  buildPrivateModeSubscriptionId,
  createCashfreeSubscription,
  fetchCashfreeSubscription,
  isCashfreeSubscriptionActive,
  isCashfreeSubscriptionAuthorized,
  subscriptionFirstChargeTime,
} from "../cashfree-subscriptions.js";
import {
  findPrivateModeSubscriptionByCfId,
  getPrivateModeAccess,
  grantPrivateModePass,
  grantPrivateModeTrialPass,
  insertPrivateModeSubscription,
  markPrivateModeSubscriptionTrialGranted,
  PRIVATE_MODE_MANDATE_PRICE_INR,
  PRIVATE_MODE_TRIAL_PRICE_INR,
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

/** Creates a Cashfree subscription mandate: ₹1 trial today, ₹199 from day 2. */
privateModeRouter.post("/subscriptions", authMiddleware, async (req, res) => {
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

    const cfSubscriptionId = buildPrivateModeSubscriptionId(auth.userId);
    const cfSub = await createCashfreeSubscription({
      subscriptionId: cfSubscriptionId,
      userId: auth.userId,
      username: auth.username,
      trialAmountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
      mandateAmountInr: PRIVATE_MODE_MANDATE_PRICE_INR,
      planNote: "Zara private mode monthly mandate",
    });

    await insertPrivateModeSubscription(
      auth.userId,
      cfSub.subscriptionId,
      PRIVATE_MODE_TRIAL_PRICE_INR,
      PRIVATE_MODE_MANDATE_PRICE_INR,
    );

    res.json({
      subscriptionId: cfSub.subscriptionId,
      subscriptionSessionId: cfSub.subscriptionSessionId,
      trialAmountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
      mandateAmountInr: PRIVATE_MODE_MANDATE_PRICE_INR,
      firstChargeTime: subscriptionFirstChargeTime(),
      passDays: access.passDays,
      trialDays: access.trialDays,
      environment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    const msg =
      e instanceof Error ? e.message : "Failed to create subscription";
    res.status(502).json({ error: msg });
  }
});

/** Backward-compatible alias — clients should migrate to /subscriptions. */
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

    const cfSubscriptionId = buildPrivateModeSubscriptionId(auth.userId);
    const cfSub = await createCashfreeSubscription({
      subscriptionId: cfSubscriptionId,
      userId: auth.userId,
      username: auth.username,
      trialAmountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
      mandateAmountInr: PRIVATE_MODE_MANDATE_PRICE_INR,
      planNote: "Zara private mode monthly mandate",
    });

    await insertPrivateModeSubscription(
      auth.userId,
      cfSub.subscriptionId,
      PRIVATE_MODE_TRIAL_PRICE_INR,
      PRIVATE_MODE_MANDATE_PRICE_INR,
    );

    res.json({
      orderId: cfSub.subscriptionId,
      paymentSessionId: cfSub.subscriptionSessionId,
      subscriptionId: cfSub.subscriptionId,
      subscriptionSessionId: cfSub.subscriptionSessionId,
      trialAmountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
      mandateAmountInr: PRIVATE_MODE_MANDATE_PRICE_INR,
      amountInr: PRIVATE_MODE_TRIAL_PRICE_INR,
      firstChargeTime: subscriptionFirstChargeTime(),
      passDays: access.passDays,
      trialDays: access.trialDays,
      environment: cashfreePublicEnvironment(),
    });
  } catch (e) {
    console.error(e);
    const msg =
      e instanceof Error ? e.message : "Failed to create subscription";
    res.status(502).json({ error: msg });
  }
});

async function finalizeAuthorizedSubscription(
  cfSubscriptionId: string,
  userId: number,
) {
  const localSub = await findPrivateModeSubscriptionByCfId(cfSubscriptionId);
  if (!localSub) {
    throw new Error("Subscription not found");
  }
  if (localSub.user_id !== userId) {
    throw new Error("Subscription does not belong to this user");
  }

  const cfStatus = await fetchCashfreeSubscription(cfSubscriptionId);
  const authorized =
    isCashfreeSubscriptionAuthorized(cfStatus) ||
    isCashfreeSubscriptionActive(cfStatus);

  if (!authorized) {
    return {
      authorized: false as const,
      subscriptionStatus: cfStatus.subscriptionStatus,
      authorizationStatus: cfStatus.authorizationStatus ?? null,
    };
  }

  if (localSub.trial_granted_at == null) {
    await markPrivateModeSubscriptionTrialGranted(
      cfSubscriptionId,
      cfStatus.authorizationStatus ?? "SUCCESS",
    );
    await grantPrivateModeTrialPass(userId);
  }

  const access = await getPrivateModeAccess(userId);
  return {
    authorized: true as const,
    access,
    subscriptionStatus: cfStatus.subscriptionStatus,
    nextScheduleDate: cfStatus.nextScheduleDate ?? null,
  };
}

privateModeRouter.post(
  "/subscriptions/:subscriptionId/verify",
  authMiddleware,
  async (req, res) => {
    const auth = getAuth(req);
    const { subscriptionId } = req.params;

    if (!subscriptionId?.trim()) {
      res.status(400).json({ error: "subscriptionId is required" });
      return;
    }

    try {
      const result = await finalizeAuthorizedSubscription(
        subscriptionId,
        auth.userId,
      );
      if ("authorized" in result && result.authorized === false) {
        const access = await getPrivateModeAccess(auth.userId);
        res.json({
          paid: false,
          authorized: false,
          subscriptionStatus: result.subscriptionStatus,
          authorizationStatus: result.authorizationStatus,
          passActive: access.passActive,
          unlockedUntil: access.unlockedUntil,
        });
        return;
      }

      res.json({
        paid: true,
        authorized: true,
        passActive: result.access.passActive,
        unlockedUntil: result.access.unlockedUntil,
        ageSet: result.access.ageSet,
        subscriptionStatus: result.subscriptionStatus,
        nextScheduleDate: result.nextScheduleDate,
        trialGranted: true,
      });
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error ? e.message : "Failed to verify subscription";
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

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
      const result = await finalizeAuthorizedSubscription(orderId, auth.userId);
      if ("authorized" in result && result.authorized === false) {
        const access = await getPrivateModeAccess(auth.userId);
        res.json({
          paid: false,
          authorized: false,
          orderStatus: result.subscriptionStatus,
          subscriptionStatus: result.subscriptionStatus,
          passActive: access.passActive,
          unlockedUntil: access.unlockedUntil,
        });
        return;
      }

      res.json({
        paid: true,
        authorized: true,
        passActive: result.access.passActive,
        unlockedUntil: result.access.unlockedUntil,
        ageSet: result.access.ageSet,
        subscriptionStatus: result.subscriptionStatus,
        nextScheduleDate: result.nextScheduleDate,
      });
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error ? e.message : "Failed to verify subscription";
      const status = msg.includes("not found") ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  },
);

privateModeRouter.post("/webhook", async (req, res) => {
  try {
    const body = req.body as {
      type?: string;
      data?: {
        subscription?: {
          subscription_id?: string;
          subscription_status?: string;
          authorisation_details?: { authorization_status?: string };
          authorization_details?: { authorization_status?: string };
        };
        payment?: {
          payment_amount?: number;
          payment_status?: string;
        };
        order?: { order_id?: string; order_status?: string };
      };
      subscription_id?: string;
      order_id?: string;
      order_status?: string;
    };

    const eventType = body.type ?? "";
    const cfSubscriptionId =
      body.data?.subscription?.subscription_id ?? body.subscription_id ?? null;

    if (
      eventType === "SUBSCRIPTION_AUTH_STATUS" ||
      eventType === "SUBSCRIPTION_STATUS_CHANGED"
    ) {
      if (!cfSubscriptionId) {
        res.status(400).json({ error: "Missing subscription id" });
        return;
      }

      const localSub = await findPrivateModeSubscriptionByCfId(cfSubscriptionId);
      if (!localSub || localSub.trial_granted_at != null) {
        res.json({ ok: true });
        return;
      }

      const cfStatus = await fetchCashfreeSubscription(cfSubscriptionId);
      if (!isCashfreeSubscriptionAuthorized(cfStatus)) {
        res.json({ ok: true, ignored: true });
        return;
      }

      await markPrivateModeSubscriptionTrialGranted(
        cfSubscriptionId,
        cfStatus.authorizationStatus ?? "SUCCESS",
      );
      await grantPrivateModeTrialPass(localSub.user_id);
      res.json({ ok: true, trialGranted: true });
      return;
    }

    if (eventType === "SUBSCRIPTION_PAYMENT_SUCCESS") {
      if (!cfSubscriptionId) {
        res.status(400).json({ error: "Missing subscription id" });
        return;
      }

      const localSub = await findPrivateModeSubscriptionByCfId(cfSubscriptionId);
      if (!localSub) {
        res.json({ ok: true, ignored: true });
        return;
      }

      const paymentAmount = body.data?.payment?.payment_amount ?? 0;
      if (paymentAmount >= PRIVATE_MODE_MANDATE_PRICE_INR) {
        await grantPrivateModePass(localSub.user_id);
      }
      res.json({ ok: true, passExtended: true });
      return;
    }

    // Legacy one-time order webhook (no-op for new subscriptions).
    const cfOrderId = body.data?.order?.order_id ?? body.order_id ?? null;
    const orderStatus = (
      body.data?.order?.order_status ?? body.order_status ?? ""
    ).toUpperCase();

    if (cfOrderId && orderStatus === "PAID") {
      res.json({ ok: true, legacy: true });
      return;
    }

    res.json({ ok: true, ignored: true });
  } catch (e) {
    console.error("Private mode Cashfree webhook error:", e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});
