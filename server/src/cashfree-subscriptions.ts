import { v4 as uuidv4 } from "uuid";
import {
  cashfreeBaseUrl,
  cashfreeHeaders,
  cashfreePublicEnvironment,
  isCashfreeConfigured,
} from "./cashfree.js";

const CASHFREE_API_VERSION = "2025-01-01";
const DEFAULT_PLAN_ID = "zara_private_mode_v1";

export type CashfreeSubscriptionStatus = {
  subscriptionId: string;
  subscriptionStatus: string;
  authorizationStatus?: string;
  authorizationAmount?: number;
  nextScheduleDate?: string | null;
};

export type CashfreeCreateSubscriptionResult = {
  subscriptionId: string;
  subscriptionSessionId: string;
  subscriptionStatus: string;
};

export function buildPrivateModeSubscriptionId(userId: number): string {
  const suffix = uuidv4().replace(/-/g, "").slice(0, 12);
  return `private_sub_u${userId}_${suffix}`;
}

function subscriptionPlanId(): string {
  return process.env.CASHFREE_PRIVATE_MODE_PLAN_ID?.trim() || DEFAULT_PLAN_ID;
}

function subscriptionReturnUrl(): string {
  return (
    process.env.CASHFREE_SUBSCRIPTION_RETURN_URL?.trim() ||
    process.env.CASHFREE_RETURN_URL?.trim() ||
    "https://www.cashfree.com/devstudio/preview/subs/seamless"
  );
}

function subscriptionExpiryTime(): string {
  return "2100-01-01T00:00:00.000Z";
}

/** Tomorrow 10:00 IST — first recurring Rs 199 charge after the Rs 1 mandate auth. */
export function subscriptionFirstChargeTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00:00+05:30`;
}

async function parseCashfreeError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as {
      message?: string;
      code?: string;
      help?: string;
    };
    const parts = [
      data.message,
      data.code ? `(${data.code})` : null,
      data.help,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // fall through
  }
  return text || `HTTP ${res.status}`;
}

/** Ensure the recurring plan exists (idempotent). */
async function ensurePrivateModePlan(mandateAmountInr: number): Promise<string> {
  const planId = subscriptionPlanId();
  const res = await fetch(`${cashfreeBaseUrl()}/plans`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      plan_id: planId,
      plan_name: "Zara Private Mode",
      plan_type: "PERIODIC",
      plan_currency: "INR",
      plan_amount: mandateAmountInr,
      plan_max_amount: mandateAmountInr,
      plan_intervals: 1,
      plan_interval_type: "MONTH",
      plan_note: "Zara private mode monthly mandate",
    }),
  });

  if (res.ok) return planId;

  const err = await parseCashfreeError(res);
  // Plan already exists — safe to reuse.
  if (
    res.status === 409 ||
    err.toLowerCase().includes("already exists") ||
    err.toLowerCase().includes("plan_id")
  ) {
    return planId;
  }

  throw new Error(`Cashfree create plan failed: ${res.status} ${err}`);
}

export async function createCashfreeSubscription(options: {
  subscriptionId: string;
  userId: number;
  username: string;
  trialAmountInr: number;
  mandateAmountInr: number;
  planNote: string;
}): Promise<CashfreeCreateSubscriptionResult> {
  const planId = await ensurePrivateModePlan(options.mandateAmountInr);

  const res = await fetch(`${cashfreeBaseUrl()}/subscriptions`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      subscription_id: options.subscriptionId,
      customer_details: {
        customer_name: options.username.slice(0, 100),
        customer_email: `user${options.userId}@zara.crowstone.ai`,
        customer_phone: "9999999999",
      },
      plan_details: {
        plan_id: planId,
        plan_name: "Zara Private Mode",
        plan_type: "PERIODIC",
      },
      authorization_details: {
        authorization_amount: options.trialAmountInr,
        authorization_amount_refund: false,
      },
      subscription_meta: {
        return_url: subscriptionReturnUrl(),
        notification_channel: ["EMAIL", "SMS"],
      },
      subscription_tags: {
        subscription_note: options.planNote,
      },
      subscription_expiry_time: subscriptionExpiryTime(),
      subscription_first_charge_time: subscriptionFirstChargeTime(),
    }),
  });

  if (!res.ok) {
    const err = await parseCashfreeError(res);
    if (res.status >= 500 && err.includes("internal")) {
      throw new Error(
        `Cashfree subscription setup failed (${res.status}): ${err}. ` +
          "Confirm Subscriptions are enabled on your Cashfree merchant account " +
          "and check API logs in the Cashfree dashboard.",
      );
    }
    throw new Error(`Cashfree create subscription failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    subscription_id?: string;
    subscription_session_id?: string;
    subscription_status?: string;
  };

  if (!data.subscription_id || !data.subscription_session_id) {
    throw new Error("Cashfree create subscription returned incomplete data");
  }

  return {
    subscriptionId: data.subscription_id,
    subscriptionSessionId: data.subscription_session_id,
    subscriptionStatus: data.subscription_status ?? "INITIALIZED",
  };
}

export async function fetchCashfreeSubscription(
  subscriptionId: string,
): Promise<CashfreeSubscriptionStatus> {
  const res = await fetch(
    `${cashfreeBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "GET",
      headers: cashfreeHeaders(),
    },
  );

  if (!res.ok) {
    const err = await parseCashfreeError(res);
    throw new Error(`Cashfree get subscription failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    subscription_id?: string;
    subscription_status?: string;
    authorisation_details?: {
      authorization_status?: string;
      authorization_amount?: number;
    };
    authorization_details?: {
      authorization_status?: string;
      authorization_amount?: number;
    };
    next_schedule_date?: string | null;
  };

  const auth =
    data.authorisation_details ?? data.authorization_details ?? undefined;

  return {
    subscriptionId: data.subscription_id ?? subscriptionId,
    subscriptionStatus: data.subscription_status ?? "UNKNOWN",
    authorizationStatus: auth?.authorization_status,
    authorizationAmount: auth?.authorization_amount,
    nextScheduleDate: data.next_schedule_date ?? null,
  };
}

export function isCashfreeSubscriptionAuthorized(
  status: CashfreeSubscriptionStatus,
): boolean {
  const auth = status.authorizationStatus?.toUpperCase() ?? "";
  return auth === "SUCCESS" || auth === "ACTIVE";
}

export function isCashfreeSubscriptionActive(
  status: CashfreeSubscriptionStatus,
): boolean {
  const sub = status.subscriptionStatus.toUpperCase();
  return (
    sub === "ACTIVE" ||
    sub === "BANK_APPROVAL_PENDING" ||
    isCashfreeSubscriptionAuthorized(status)
  );
}

export { isCashfreeConfigured, cashfreePublicEnvironment, CASHFREE_API_VERSION };
