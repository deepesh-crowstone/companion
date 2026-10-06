const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const DEFAULT_REPLY_API_BASE = "http://103.48.50.181:6006/v1";
const DEFAULT_REPLY_MODEL = "nvidia/Qwen3.6-35B-A3B-NVFP4";

function envValue(name: string): string | undefined {
  const raw = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  return raw || undefined;
}

function numberEnv(name: string, fallback: number): number {
  const raw = envValue(name);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function replyApiBase(): string {
  return (envValue("REPLY_API_BASE_URL") ?? DEFAULT_REPLY_API_BASE).replace(
    /\/+$/,
    "",
  );
}

function replyApiKey(): string {
  const key = envValue("REPLY_API_KEY");
  if (!key) {
    throw new Error("REPLY_API_KEY is not set");
  }
  return key;
}

function isTimeoutError(err: Error): boolean {
  return err.name === "TimeoutError" || err.name === "AbortError";
}

export type ReplyChatMessage = { role: string; content: string };

export type ReplyChatOptions = {
  timeoutMs?: number;
  retries?: number;
  label?: string;
};

/** Drops Qwen thinking traces if the server still wraps them in the reply. */
function visibleReply(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Generates a reply from the OpenAI-compatible chat server.
 * Request shape matches the Qwen endpoint: thinking disabled, short output.
 */
export async function replyChatCompletion(
  messages: ReplyChatMessage[],
  options: ReplyChatOptions = {},
): Promise<string> {
  const timeoutMs =
    options.timeoutMs ?? numberEnv("REPLY_CHAT_TIMEOUT_MS", 40_000);
  const retries = options.retries ?? 1;
  const label = options.label ?? "Chat";

  const body = {
    model: envValue("REPLY_MODEL") ?? DEFAULT_REPLY_MODEL,
    messages,
    stream: false,
    max_tokens: 256,
    temperature: 0.7,
    top_p: 0.8,
    chat_template_kwargs: { enable_thinking: false },
  };

  let lastError: Error = new Error(`${label} failed`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${replyApiBase()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${replyApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
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
        choices?: { message?: { content?: string | null } }[];
      };
      const content = visibleReply(data.choices?.[0]?.message?.content ?? "");
      if (!content) {
        throw new Error(`${label} failed: empty response`);
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
