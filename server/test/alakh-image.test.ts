import assert from "node:assert/strict";
import test from "node:test";
import { ALAKH_IMAGE_TIMEOUT_MS, chatWithAlakhImage, isXaiConfigured } from "../src/xai.ts";

test("a student photo is solved by Qwen with thinking off", async () => {
  const previousKey = process.env.REPLY_API_KEY;
  process.env.REPLY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let sawTimeoutSignal = false;
  let body: {
    max_tokens?: number;
    temperature?: number;
    reasoning_effort?: string;
    chat_template_kwargs?: { enable_thinking?: boolean };
    messages?: Array<{
      role?: string;
      content?: string | Array<{ type?: string; image_url?: { url?: string }; text?: string }>;
    }>;
  } = {};

  globalThis.fetch = (async (_url, init) => {
    sawTimeoutSignal = init?.signal instanceof AbortSignal;
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "SOLUTION\n## Answer\n$$\nN \\approx 5000\n$$\nThe amplitude, not the energy, falls by a factor of e.",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const turn = await chatWithAlakhImage({
      history: [],
      image: Buffer.from("question-photo"),
      mimeType: "image/jpeg",
      caption: "",
    });
    assert.equal(turn.kind, "solution");
    if (turn.kind === "solution") {
      assert.match(turn.markdown, /N \\approx 5000/);
      assert.match(turn.markdown, /## Answer/);
      assert.equal(turn.markdown.includes("SOLUTION"), false);
    }
    assert.equal(body.chat_template_kwargs?.enable_thinking, false);
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.max_tokens, 8192);
    assert.equal(body.temperature, 0.4);
    assert.ok(ALAKH_IMAGE_TIMEOUT_MS >= 240_000);
    const user = body.messages?.find((message) => message.role === "user");
    const image = Array.isArray(user?.content)
      ? user.content.find((part) => part.type === "image_url")
      : undefined;
    assert.match(image?.image_url?.url ?? "", /^data:image\/jpeg;base64,/);
    const system = body.messages?.filter((message) => message.role === "system") ?? [];
    assert.equal(system.length, 1);
    assert.match(String(system[0]?.content), /first line must be exactly SOLUTION/);
    assert.match(String(system[0]?.content), /one message/);
    assert.doesNotMatch(String(system[0]?.content), /cannot render LaTeX/);
    assert.equal(sawTimeoutSignal, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.REPLY_API_KEY;
    else process.env.REPLY_API_KEY = previousKey;
  }
});

test("a missing or placeholder xAI key does not count as configured", () => {
  const previous = process.env.XAI_API_KEY;
  try {
    delete process.env.XAI_API_KEY;
    assert.equal(isXaiConfigured(), false);
    process.env.XAI_API_KEY = "test";
    assert.equal(isXaiConfigured(), false);
    process.env.XAI_API_KEY = "xai-your_xai_key_here_placeholder";
    assert.equal(isXaiConfigured(), false);
    process.env.XAI_API_KEY = "xai-real-key-value-1234567890";
    assert.equal(isXaiConfigured(), true);
  } finally {
    if (previous == null) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
  }
});
