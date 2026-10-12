const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_REPLY_API_BASE = "http://103.48.50.181:6006/v1";

/** Open-source chat model for the Riva Telegram bot. */
export const QWEN_REPLY_MODEL = "nvidia/Qwen3.6-35B-A3B-NVFP4";

export type ReplyProvider = "xai" | "qwen";

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

function xaiApiKey(): string {
  const key = envValue("XAI_API_KEY");
  if (!key) {
    throw new Error("XAI_API_KEY is not set");
  }
  return key;
}

function replyApiBase(): string {
  return (envValue("REPLY_API_BASE_URL") ?? DEFAULT_REPLY_API_BASE).replace(
    /\/+$/,
    "",
  );
}

export function isQwenReplyConfigured(): boolean {
  return Boolean(envValue("REPLY_API_KEY"));
}

/** Model id sent on a Riva Telegram reply. */
export function qwenReplyModel(): string {
  return envValue("REPLY_MODEL") ?? QWEN_REPLY_MODEL;
}

/**
 * TEMPORARY. Remove once Riva's Qwen wiring is confirmed.
 * A direct "which model" question gets the model this server will call,
 * instead of letting the persona answer.
 */
const RIVA_MODEL_ASK_PATTERNS = [
  /\b(?:what|which|kaunsa|konsa|kaun sa|kon sa|kis)\b[\s\S]{0,48}\b(?:llm|model)\b/i,
  /\b(?:llm|model)\b[\s\S]{0,40}\b(?:using|use|powered|running|chal(?:a|ati|a rahi)?)\b/i,
  /\b(?:are you|tum|tu)\b[\s\S]{0,32}\b(?:qwen|grok|gpt|chatgpt|claude|gemini)\b/i,
  /\b(?:qwen|grok)\b[\s\S]{0,24}\b(?:use|using|ho|hai|pe|par)\b/i,
];

export function rivaModelAskReply(text: string): string | null {
  const asked = text.trim();
  if (!asked || !RIVA_MODEL_ASK_PATTERNS.some((pattern) => pattern.test(asked))) {
    return null;
  }
  return `i'm on ${qwenReplyModel()}`;
}

/** Warns when the Riva reply server is plain HTTP on a public host. */
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

export type ReplyContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ReplyChatMessage = {
  role: string;
  content: string | ReplyContentPart[];
};

export type ReplyChatOptions = {
  timeoutMs?: number;
  retries?: number;
  label?: string;
  /** Overrides the default completion budget. Solution write-ups need more than a chat bubble. */
  maxTokens?: number;
  temperature?: number;
  /**
   * xAI always reasons: high by default, low when this is false.
   * Qwen thinking stays on unless this is false.
   */
  thinking?: boolean;
  /** xAI is the default. The Riva Telegram bot asks for Qwen. */
  provider?: ReplyProvider;
};

/**
 * Drops Qwen thinking traces so the chat shows only the answer.
 * Covers a closed <think> block, a truncated unclosed block, and the
 * common case where the chat template prefills <think> so the completion
 * starts inside the trace and only includes </think>.
 * A length-capped completion with no close tag is still that prefilled
 * trace, so it is dropped instead of shown as the reply.
 * reasoning / reasoning_content are never read; they must not be appended.
 */
export function visibleReply(
  content: string,
  finishReason?: string | null,
): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<think>[\s\S]*$/gi, "");
  const close = text.search(/<\/think>/i);
  if (close !== -1) {
    text = text.slice(close).replace(/<\/think>/i, "");
    return text.trim();
  }
  if (finishReason === "length") return "";
  return text.trim();
}

/**
 * This Qwen server accepts only one system message, and it must be first.
 * Later system turns (conversation metadata) are folded into that message.
 */
export function collapseLeadingSystemMessages(
  messages: ReplyChatMessage[],
): ReplyChatMessage[] {
  let end = 0;
  while (end < messages.length && messages[end]?.role === "system") end += 1;
  if (end <= 1) return messages;
  const content = messages
    .slice(0, end)
    .map((message) => (typeof message.content === "string" ? message.content.trim() : ""))
    .filter((part) => part.length > 0)
    .join("\n\n");
  return [{ role: "system", content }, ...messages.slice(end)];
}

/** Default completion budget for a chat reply. Long lessons pass their own. */
export const REPLY_MAX_TOKENS = 4096;

/** Generates a reply. xAI is the default; Qwen is only for the Riva Telegram bot. */
export async function replyChatCompletion(
  messages: ReplyChatMessage[],
  options: ReplyChatOptions = {},
): Promise<string> {
  const timeoutMs =
    options.timeoutMs ?? numberEnv("REPLY_CHAT_TIMEOUT_MS", 40_000);
  const retries = options.retries ?? 1;
  const label = options.label ?? "Chat";
  const provider = options.provider ?? "xai";
  const collapsed = collapseLeadingSystemMessages(messages);
  const body =
    provider === "qwen"
      ? {
          model: qwenReplyModel(),
          messages: collapsed,
          stream: false,
          max_tokens: options.maxTokens ?? REPLY_MAX_TOKENS,
          temperature: options.temperature ?? 0.7,
          top_p: 0.8,
          chat_template_kwargs: { enable_thinking: options.thinking !== false },
        }
      : {
          model: envValue("XAI_CHAT_MODEL") ?? "grok-4.7",
          messages: collapsed,
          stream: false,
          max_tokens: options.maxTokens ?? REPLY_MAX_TOKENS,
          temperature: options.temperature ?? 0.7,
          reasoning_effort: options.thinking === false ? "low" : "high",
        };
  const url =
    provider === "qwen" ? `${replyApiBase()}/chat/completions` : XAI_CHAT_URL;
  const apiKey = provider === "qwen" ? replyApiKey() : xaiApiKey();

  let lastError: Error = new Error(`${label} failed`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
          finish_reason?: string | null;
          message?: {
            content?: string | null;
            reasoning?: string | null;
            reasoning_content?: string | null;
          };
        }[];
      };
      const choice = data.choices?.[0];
      const content = visibleReply(
        choice?.message?.content ?? "",
        choice?.finish_reason,
      );
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
