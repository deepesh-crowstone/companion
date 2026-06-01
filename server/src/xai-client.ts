const XAI_BASE = "https://api.x.ai/v1";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function xaiApiKey(): string {
  const key = process.env.XAI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!key) {
    throw new Error("XAI_API_KEY is not set");
  }
  return key;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function isTimeoutError(err: Error): boolean {
  return err.name === "TimeoutError" || err.name === "AbortError";
}

export type XaiChatCompletionOptions = {
  /** Hard per-attempt timeout. Defaults to XAI_CHAT_TIMEOUT_MS env or 40s. */
  timeoutMs?: number;
  /** Extra attempts after the first, only for transient (429/5xx) responses. */
  retries?: number;
  /** Error prefix matched by route handlers (e.g. "Chat" -> "Chat failed"). */
  label?: string;
};

/**
 * POSTs to xAI `/chat/completions` with a hard timeout and a limited retry on
 * transient upstream errors, returning the assistant message content.
 *
 * The timeout is the important part: Node's `fetch` will otherwise keep a slow
 * or hung xAI request open for minutes, so the only thing that ever "gives up"
 * is the mobile/web client — which then shows a misleading "can't reach
 * server". Failing fast here surfaces a real 502 instead.
 */
export async function xaiChatCompletion(
  body: Record<string, unknown>,
  options: XaiChatCompletionOptions = {},
): Promise<string> {
  const timeoutMs =
    options.timeoutMs ?? numberEnv("XAI_CHAT_TIMEOUT_MS", 40_000);
  const retries = options.retries ?? 1;
  const label = options.label ?? "Chat";

  let lastError: Error = new Error(`${label} failed`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${XAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${xaiApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Timeouts and network drops are not retried: a hung upstream would just
      // burn another full timeout window and push the client over its limit.
      const err = e instanceof Error ? e : new Error(String(e));
      lastError = new Error(
        isTimeoutError(err)
          ? `${label} failed: timed out after ${timeoutMs}ms`
          : `${label} failed: ${err.message}`,
      );
      break;
    }

    if (res.ok) {
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error(`${label} failed: empty response from xAI`);
      }
      return content;
    }

    const errText = await res.text().catch(() => "");
    lastError = new Error(
      `${label} failed: ${res.status} ${errText.slice(0, 200)}`,
    );
    if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }

  throw lastError;
}
