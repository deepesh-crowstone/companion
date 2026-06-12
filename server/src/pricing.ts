/** Pass pricing — tunable via Railway / .env without an app update. */

export type PassPricing = {
  priceInr: number;
  strikePriceInr: number;
  passDays: number;
};

const DEFAULT_PRIVATE_MODE_PASS_PRICE_INR = 99;
const DEFAULT_PRIVATE_MODE_PASS_STRIKE_PRICE_INR = 1499;
const DEFAULT_PRIVATE_MODE_PASS_DAYS = 30;

const DEFAULT_PERSONALITY_PASS_PRICE_INR = 49;
const DEFAULT_PERSONALITY_PASS_STRIKE_PRICE_INR = 299;
const DEFAULT_PERSONALITY_PASS_DAYS = 30;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

export function getPrivateModePassPricing(): PassPricing {
  const priceInr = parsePositiveInt(
    process.env.PRIVATE_MODE_PASS_PRICE_INR,
    DEFAULT_PRIVATE_MODE_PASS_PRICE_INR,
  );
  const strikePriceInr = parsePositiveInt(
    process.env.PRIVATE_MODE_PASS_STRIKE_PRICE_INR,
    DEFAULT_PRIVATE_MODE_PASS_STRIKE_PRICE_INR,
  );
  return {
    priceInr,
    strikePriceInr: Math.max(strikePriceInr, priceInr),
    passDays: DEFAULT_PRIVATE_MODE_PASS_DAYS,
  };
}

export function getPersonalityPassPricing(): PassPricing {
  const priceInr = parsePositiveInt(
    process.env.PERSONALITY_PASS_PRICE_INR,
    DEFAULT_PERSONALITY_PASS_PRICE_INR,
  );
  const strikePriceInr = parsePositiveInt(
    process.env.PERSONALITY_PASS_STRIKE_PRICE_INR,
    DEFAULT_PERSONALITY_PASS_STRIKE_PRICE_INR,
  );
  return {
    priceInr,
    strikePriceInr: Math.max(strikePriceInr, priceInr),
    passDays: DEFAULT_PERSONALITY_PASS_DAYS,
  };
}
