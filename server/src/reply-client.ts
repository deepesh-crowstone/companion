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

export function insecureReplyEndpointWarning(): string | null {
  const base = replyApiBase();
  try {
    const url = new URL(base);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
      return `Reply API uses unencrypted HTTP (${url.host}). Requests and responses are not protected in transit; keep this only while the configured provider requires HTTP.`;
    }
  } catch {
    return "REPLY_API_BASE_URL is not a valid URL.";
  }
  return null;
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

/**
 * Drops Qwen thinking traces so the chat shows only the answer.
 * Covers a closed <think> block, a truncated unclosed block, and the
 * common case where the chat template prefills <think> so the completion
 * starts inside the trace and only includes </think>.
 * reasoning / reasoning_content are never read; they must not be appended.
 */
function visibleReply(content: string): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/gi, "");
  const close = text.search(/<\/think>/i);
  if (close !== -1) {
    text = text.slice(close).replace(/<\/think>/i, "");
  }
  return text.trim();
}

/**
 * Generates a reply from the OpenAI-compatible chat server.
 * Thinking is on. Those tokens count against max_tokens on this
 * vLLM/Qwen template, so the cap is 1024 to leave room for a short reply.
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
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.8,
    chat_template_kwargs: { enable_thinking: true },
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
        choices?: {
          message?: {
            content?: string | null;
            reasoning?: string | null;
            reasoning_content?: string | null;
          };
        }[];
      };
      const message = data.choices?.[0]?.message;
      const content = visibleReply(message?.content ?? "");
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
