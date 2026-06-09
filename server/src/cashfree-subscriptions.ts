import { v4 as uuidv4 } from "uuid";
import {
  cashfreeBaseUrl,
  cashfreeHeaders,
  cashfreePublicEnvironment,
  isCashfreeConfigured,
} from "./cashfree.js";

const CASHFREE_API_VERSION = "2025-01-01";

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

function subscriptionReturnUrl(): string {
  return (
    process.env.CASHFREE_SUBSCRIPTION_RETURN_URL?.trim() ||
    process.env.CASHFREE_RETURN_URL?.trim() ||
    "https://www.cashfree.com/devstudio/preview/subs/seamless"
  );
}

function subscriptionExpiryTime(): string {
  return "2100-01-01T05:29:59+05:30";
}

/** Tomorrow 10:00 IST — first recurring ₹199 charge after the ₹1 mandate auth. */
export function subscriptionFirstChargeTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00:00+05:30`;
}

export async function createCashfreeSubscription(options: {
  subscriptionId: string;
  userId: number;
  username: string;
  trialAmountInr: number;
  mandateAmountInr: number;
  planNote: string;
}): Promise<CashfreeCreateSubscriptionResult> {
  const res = await fetch(`${cashfreeBaseUrl()}/subscriptions`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      subscription_id: options.subscriptionId,
      customer_details: {
        customer_name: options.username,
        customer_email: `user${options.userId}@zara.crowstone.ai`,
        customer_phone: "9999999999",
      },
      plan_details: {
        plan_name: "Zara Private Mode",
        plan_type: "PERIODIC",
        plan_amount: options.mandateAmountInr,
        plan_max_amount: options.mandateAmountInr,
        plan_max_cycles: 0,
        plan_intervals: 1,
        plan_interval_type: "MONTH",
        plan_currency: "INR",
        plan_note: options.planNote,
      },
      authorization_details: {
        authorization_amount: options.trialAmountInr,
        authorization_amount_refund: false,
        payment_methods: ["upi", "card", "enach"],
      },
      subscription_meta: {
        return_url: subscriptionReturnUrl(),
      },
      subscription_expiry_time: subscriptionExpiryTime(),
      subscription_first_charge_time: subscriptionFirstChargeTime(),
      subscription_note: "Zara private mode — ₹1 trial, then ₹199/month",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
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
    const err = await res.text();
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
