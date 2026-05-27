import { v4 as uuidv4 } from "uuid";

const CASHFREE_API_VERSION = "2025-01-01";

export type CashfreeEnvironment = "sandbox" | "production";

export type CashfreeCreateOrderResult = {
  cfOrderId: string;
  paymentSessionId: string;
  orderAmount: number;
  orderCurrency: string;
};

export type CashfreeOrderStatus = {
  orderId: string;
  orderStatus: string;
  orderAmount: number;
  paymentStatus?: string;
};

function cashfreeEnv(): CashfreeEnvironment {
  const raw = process.env.CASHFREE_ENV?.trim().toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

function cashfreeBaseUrl(): string {
  return cashfreeEnv() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function cashfreeCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.CASHFREE_CLIENT_ID?.trim();
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function cashfreeHeaders(): Record<string, string> {
  const { clientId, clientSecret } = cashfreeCredentials();
  return {
    "Content-Type": "application/json",
    "x-api-version": CASHFREE_API_VERSION,
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };
}

export function isCashfreeConfigured(): boolean {
  return Boolean(
    process.env.CASHFREE_CLIENT_ID?.trim() &&
      process.env.CASHFREE_CLIENT_SECRET?.trim(),
  );
}

export function cashfreePublicEnvironment(): CashfreeEnvironment {
  return cashfreeEnv();
}

export function buildPersonalityOrderId(userId: number): string {
  const suffix = uuidv4().replace(/-/g, "").slice(0, 12);
  return `personality_u${userId}_${suffix}`;
}

export async function createCashfreeOrder(options: {
  orderId: string;
  amountInr: number;
  userId: number;
  username: string;
  orderNote: string;
}): Promise<CashfreeCreateOrderResult> {
  const notifyUrl = process.env.CASHFREE_NOTIFY_URL?.trim();
  const returnUrl =
    process.env.CASHFREE_RETURN_URL?.trim() ||
    "https://www.cashfree.com/devstudio/preview/pg/web/checkout?order_id={order_id}";

  const res = await fetch(`${cashfreeBaseUrl()}/orders`, {
    method: "POST",
    headers: cashfreeHeaders(),
    body: JSON.stringify({
      order_id: options.orderId,
      order_amount: options.amountInr,
      order_currency: "INR",
      customer_details: {
        customer_id: String(options.userId),
        customer_name: options.username,
        customer_phone: "9999999999",
      },
      order_meta: {
        return_url: returnUrl,
        ...(notifyUrl ? { notify_url: notifyUrl } : {}),
      },
      order_note: options.orderNote,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cashfree create order failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    order_id?: string;
    payment_session_id?: string;
    order_amount?: number;
    order_currency?: string;
  };

  if (!data.order_id || !data.payment_session_id) {
    throw new Error("Cashfree create order returned incomplete data");
  }

  return {
    cfOrderId: data.order_id,
    paymentSessionId: data.payment_session_id,
    orderAmount: data.order_amount ?? options.amountInr,
    orderCurrency: data.order_currency ?? "INR",
  };
}

export async function fetchCashfreeOrder(
  orderId: string,
): Promise<CashfreeOrderStatus> {
  const res = await fetch(
    `${cashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: cashfreeHeaders(),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cashfree get order failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    order_id?: string;
    order_status?: string;
    order_amount?: number;
    payment_status?: string;
  };

  return {
    orderId: data.order_id ?? orderId,
    orderStatus: data.order_status ?? "UNKNOWN",
    orderAmount: data.order_amount ?? 0,
    paymentStatus: data.payment_status,
  };
}

export function isCashfreeOrderPaid(status: CashfreeOrderStatus): boolean {
  const orderStatus = status.orderStatus.toUpperCase();
  const paymentStatus = status.paymentStatus?.toUpperCase() ?? "";
  return (
    orderStatus === "PAID" ||
    paymentStatus === "SUCCESS" ||
    paymentStatus === "PAID"
  );
}
