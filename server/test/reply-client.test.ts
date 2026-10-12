import assert from "node:assert/strict";
import test from "node:test";
import {
  QWEN_REPLY_MODEL,
  insecureReplyEndpointWarning,
  replyChatCompletion,
} from "../src/reply-client.ts";

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous == null) delete process.env[name];
  else process.env[name] = previous;
}

test("non-local HTTP reply endpoint produces a key-free warning", () => {
  const previous = process.env.REPLY_API_BASE_URL;
  process.env.REPLY_API_BASE_URL = "http://example.com/v1";
  try {
    const warning = insecureReplyEndpointWarning();
    assert.match(warning ?? "", /unencrypted HTTP/);
    assert.doesNotMatch(warning ?? "", /REPLY_API_KEY|Bearer/);
  } finally {
    restoreEnv("REPLY_API_BASE_URL", previous);
  }
});

test("Riva asks Qwen while every other reply stays on xAI", async () => {
  const previous = {
    base: process.env.REPLY_API_BASE_URL,
    key: process.env.REPLY_API_KEY,
    model: process.env.REPLY_MODEL,
    xai: process.env.XAI_API_KEY,
    xaiModel: process.env.XAI_CHAT_MODEL,
  };
  process.env.REPLY_API_BASE_URL = "http://qwen.test/v1";
  process.env.REPLY_API_KEY = "reply-key";
  delete process.env.REPLY_MODEL;
  process.env.XAI_API_KEY = "xai-key";
  process.env.XAI_CHAT_MODEL = "grok-4.7";

  const seen: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    const headers = init?.headers as Record<string, string>;
    seen.push({
      url: String(url),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      auth: headers.Authorization,
    });
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "hey" } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const qwen = await replyChatCompletion(
      [
        { role: "system", content: "persona" },
        { role: "system", content: "context" },
        { role: "user", content: "hi" },
      ],
      { provider: "qwen", retries: 0 },
    );
    assert.equal(qwen, "hey");
    assert.equal(seen[0]?.url, "http://qwen.test/v1/chat/completions");
    assert.equal(seen[0]?.auth, "Bearer reply-key");
    assert.equal(seen[0]?.body.model, QWEN_REPLY_MODEL);
    assert.equal(seen[0]?.body.top_p, 0.8);
    assert.deepEqual(seen[0]?.body.chat_template_kwargs, { enable_thinking: true });
    assert.equal(seen[0]?.body.reasoning_effort, undefined);
    const qwenMessages = seen[0]?.body.messages as { role: string }[];
    assert.equal(qwenMessages.filter((message) => message.role === "system").length, 1);

    const xai = await replyChatCompletion([{ role: "user", content: "hi" }], {
      retries: 0,
    });
    assert.equal(xai, "hey");
    assert.equal(seen[1]?.url, "https://api.x.ai/v1/chat/completions");
    assert.equal(seen[1]?.auth, "Bearer xai-key");
    assert.equal(seen[1]?.body.model, "grok-4.7");
    assert.equal(seen[1]?.body.reasoning_effort, "high");
    assert.equal(seen[1]?.body.chat_template_kwargs, undefined);
  } finally {
    globalThis.fetch = original;
    restoreEnv("REPLY_API_BASE_URL", previous.base);
    restoreEnv("REPLY_API_KEY", previous.key);
    restoreEnv("REPLY_MODEL", previous.model);
    restoreEnv("XAI_API_KEY", previous.xai);
    restoreEnv("XAI_CHAT_MODEL", previous.xaiModel);
  }
});
