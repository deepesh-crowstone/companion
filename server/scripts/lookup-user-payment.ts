import "../src/load-env.js";
import jwt from "jsonwebtoken";
import pg from "pg";
import { checkDbConnection } from "../src/db.js";
import { fetchCashfreeOrder, isCashfreeOrderPaid } from "../src/cashfree.js";

const targetUsername = process.argv[2]?.trim();
const apiBase = process.argv[3]?.trim() || "https://api.chatlife.online";
const maxUserId = Number(process.argv[4] ?? 10000);

if (!targetUsername) {
  console.error(
    "Usage: npx tsx scripts/lookup-user-payment.ts <username> [apiBase] [maxUserId]",
  );
  process.exit(1);
}

const secret = process.env.JWT_SECRET?.trim();
if (!secret) {
  console.error("JWT_SECRET is not set");
  process.exit(1);
}

type UserRow = {
  id: number;
  username: string;
  age: number | null;
  private_mode_active: boolean;
};

async function findUserIdViaApi(): Promise<UserRow | null> {
  for (let userId = 1; userId <= maxUserId; userId++) {
    const token = jwt.sign({ userId, username: "probe" }, secret!, {
      expiresIn: "5m",
    });
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) continue;

    const data = (await res.json()) as {
      user?: { id?: number; username?: string; age?: number | null };
    };
    const username = data.user?.username;
    if (username?.toLowerCase() === targetUsername.toLowerCase()) {
      return {
        id: data.user?.id ?? userId,
        username: username!,
        age: data.user?.age ?? null,
      };
    }

    if (userId % 500 === 0) {
      console.error(`scanned through user id ${userId}`);
    }
  }
  return null;
}

async function findUserViaDb(): Promise<UserRow | null> {
  if (!(await checkDbConnection())) return null;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<UserRow>(
      `SELECT id, username, age, private_mode_active
       FROM users WHERE LOWER(username) = LOWER($1)`,
      [targetUsername],
    );
    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

async function loadDbState(userId: number): Promise<void> {
  if (!(await checkDbConnection())) {
    console.log("\nDATABASE_URL is not reachable — skipping order/pass SQL.");
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [passes, privateOrders, personalityOrders] = await Promise.all([
      pool.query(
        `SELECT 'private_mode' AS kind, unlocked_until, updated_at
         FROM private_mode_pass WHERE user_id = $1
         UNION ALL
         SELECT 'personality:' || profile_slug, unlocked_until, updated_at
         FROM personality_pass WHERE user_id = $1`,
        [userId],
      ),
      pool.query(
        `SELECT id, cf_order_id, status, amount_inr, created_at, paid_at
         FROM private_mode_orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      pool.query(
        `SELECT id, profile_slug, cf_order_id, status, amount_inr, created_at, paid_at
         FROM personality_orders WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
    ]);

    console.log("\n=== DB PASSES ===");
    console.log(JSON.stringify(passes.rows, null, 2));
    console.log("\n=== DB PRIVATE MODE ORDERS ===");
    console.log(JSON.stringify(privateOrders.rows, null, 2));
    console.log("\n=== DB PERSONALITY ORDERS ===");
    console.log(JSON.stringify(personalityOrders.rows, null, 2));

    const activeOrders = [
      ...privateOrders.rows
        .filter((row) => row.status === "ACTIVE")
        .map((row) => ({
          type: "private-mode" as const,
          cfOrderId: row.cf_order_id as string,
        })),
      ...personalityOrders.rows
        .filter((row) => row.status === "ACTIVE")
        .map((row) => ({
          type: "personalities" as const,
          cfOrderId: row.cf_order_id as string,
        })),
    ];

    if (activeOrders.length === 0) return;

    console.log("\n=== CASHFREE STATUS FOR ACTIVE LOCAL ORDERS ===");
    for (const order of activeOrders) {
      try {
        const cf = await fetchCashfreeOrder(order.cfOrderId);
        console.log(order.cfOrderId, {
          localType: order.type,
          cashfreeOrderStatus: cf.orderStatus,
          cashfreePaymentStatus: cf.paymentStatus,
          paid: isCashfreeOrderPaid(cf),
        });
      } catch (e) {
        console.log(order.cfOrderId, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    await pool.end();
  }
}

async function fetchAccess(user: UserRow): Promise<void> {
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    secret!,
    { expiresIn: "10m" },
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (const path of [
    "/private-mode/status",
    "/personalities/status",
    "/personalities/status?profileSlug=zara",
  ]) {
    const res = await fetch(`${apiBase}${path}`, { headers });
    console.log(`\n=== ${path} (${res.status}) ===`);
    console.log(await res.text());
  }
}

async function main(): Promise<void> {
  console.log(`Looking up ${targetUsername} on ${apiBase}...`);

  const user =
    (await findUserViaDb()) ?? (await findUserIdViaApi());
  if (!user) {
    console.log(`User not found (API scan 1-${maxUserId}, DB unavailable or empty).`);
    return;
  }

  console.log("\n=== USER ===");
  console.log(JSON.stringify(user, null, 2));

  await fetchAccess(user);
  await loadDbState(user.id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
