import "../src/load-env.js";
import jwt from "jsonwebtoken";
import pg from "pg";
import { checkDbConnection } from "../src/db.js";
import { grantPrivateModePass } from "../src/private-mode.js";
import { grantPersonalityPass } from "../src/personalities.js";
import {
  fetchCashfreeOrder,
  isCashfreeOrderPaid,
} from "../src/cashfree.js";

const username = process.argv[2]?.trim();
const apiBase = process.argv[3]?.trim() || "https://api.chatlife.online";

if (!username) {
  console.error(
    "Usage: npx tsx scripts/grant-user-access.ts <username> [apiBase]",
  );
  process.exit(1);
}

async function findUserIdViaApi(): Promise<number | null> {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not set");

  for (let userId = 1; userId <= 20000; userId++) {
    const token = jwt.sign({ userId, username: "probe" }, secret, {
      expiresIn: "5m",
    });
    const res = await fetch(`${apiBase}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) continue;
    const data = (await res.json()) as {
      user?: { id?: number; username?: string };
    };
    if (data.user?.username?.toLowerCase() === username.toLowerCase()) {
      return data.user.id ?? userId;
    }
    if (userId % 1000 === 0) console.error(`scanned through user id ${userId}`);
  }
  return null;
}

async function grantViaDb(userId: number): Promise<boolean> {
  if (!(await checkDbConnection())) return false;

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const [privateOrders, personalityOrders] = await Promise.all([
      pool.query<{ cf_order_id: string; status: string }>(
        `SELECT cf_order_id, status FROM private_mode_orders
         WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
      pool.query<{ cf_order_id: string; status: string; profile_slug: string }>(
        `SELECT cf_order_id, status, profile_slug FROM personality_orders
         WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      ),
    ]);

    let grantedPrivate = false;
    let grantedPersonality = false;

    for (const order of privateOrders.rows) {
      if (order.status === "PAID") {
        grantedPrivate = true;
        break;
      }
      if (order.status !== "ACTIVE") continue;
      try {
        const cf = await fetchCashfreeOrder(order.cf_order_id);
        if (!isCashfreeOrderPaid(cf)) continue;
        await pool.query(
          `UPDATE private_mode_orders SET status = 'PAID', paid_at = NOW()
           WHERE cf_order_id = $1 AND status = 'ACTIVE'`,
          [order.cf_order_id],
        );
        grantedPrivate = true;
        break;
      } catch {
        // Cashfree unavailable locally — fall through to manual grant.
      }
    }

    for (const order of personalityOrders.rows) {
      if (order.status === "PAID") {
        grantedPersonality = true;
        break;
      }
      if (order.status !== "ACTIVE") continue;
      try {
        const cf = await fetchCashfreeOrder(order.cf_order_id);
        if (!isCashfreeOrderPaid(cf)) continue;
        await pool.query(
          `UPDATE personality_orders SET status = 'PAID', paid_at = NOW()
           WHERE cf_order_id = $1 AND status = 'ACTIVE'`,
          [order.cf_order_id],
        );
        await grantPersonalityPass(userId, order.profile_slug);
        grantedPersonality = true;
        break;
      } catch {
        // fall through
      }
    }

    const privateUntil = await grantPrivateModePass(userId);
    console.log("Granted private mode pass until", privateUntil.toISOString());

    if (personalityOrders.rows.length > 0) {
      const slug = personalityOrders.rows[0].profile_slug;
      const personalityUntil = await grantPersonalityPass(userId, slug);
      console.log(
        "Granted personality pass until",
        personalityUntil.toISOString(),
      );
    }

    return true;
  } finally {
    await pool.end();
  }
}

async function verifyViaApi(userId: number): Promise<void> {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error("JWT_SECRET is not set");

  const token = jwt.sign({ userId, username }, secret, { expiresIn: "10m" });
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  for (const path of ["/private-mode/status", "/personalities/status"]) {
    const res = await fetch(`${apiBase}${path}`, { headers });
    console.log(`${path}:`, await res.text());
  }
}

async function main(): Promise<void> {
  console.log(`Granting access for ${username}...`);

  let userId: number | null = null;
  if (await checkDbConnection()) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query<{ id: number }>(
        `SELECT id FROM users WHERE LOWER(username) = LOWER($1)`,
        [username],
      );
      userId = rows[0]?.id ?? null;
    } finally {
      await pool.end();
    }
  }

  userId ??= await findUserIdViaApi();
  if (!userId) {
    console.error("User not found");
    process.exit(1);
  }

  console.log(`User id ${userId}`);
  const granted = await grantViaDb(userId);
  if (!granted) {
    console.error("Could not grant access — production DATABASE_URL required");
    process.exit(1);
  }

  console.log("\nVerifying access on production API...");
  await verifyViaApi(userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
