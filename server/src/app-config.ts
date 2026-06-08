/** Client-tunable app config sourced from Railway (or .env) env vars. */

/** Free text messages a non-paying user gets per day before the unlock wall. */
export const DEFAULT_FREE_DAILY_MESSAGE_LIMIT = 5;

/**
 * Daily free-message limit, configurable via `FREE_DAILY_MESSAGE_LIMIT` on
 * Railway (no app update needed). Falls back to the default for a missing or
 * invalid value. `0` is honored (every free user is gated immediately).
 */
export function getFreeDailyMessageLimit(): number {
  const raw = process.env.FREE_DAILY_MESSAGE_LIMIT?.trim();
  if (!raw) return DEFAULT_FREE_DAILY_MESSAGE_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return DEFAULT_FREE_DAILY_MESSAGE_LIMIT;
  return n;
}

export type AppConfig = {
  freeDailyMessageLimit: number;
};

/** Non-sensitive config the client reads on launch. */
export function getAppConfig(): AppConfig {
  return {
    freeDailyMessageLimit: getFreeDailyMessageLimit(),
  };
}
