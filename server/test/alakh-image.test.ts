import assert from "node:assert/strict";
import test from "node:test";
import {
  ALAKH_IMAGE_REASONING_EFFORT,
  ALAKH_IMAGE_TIMEOUT_MS,
  chatWithAlakhImage,
} from "../src/xai.ts";

test("a student photo is solved with high-detail vision and enough time to finish", async () => {
  const previousKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let sawTimeoutSignal = false;
  let body: {
    reasoning_effort?: string;
    messages?: Array<{
      role?: string;
      content?: string | Array<{ type?: string; image_url?: { detail?: string }; text?: string }>;
    }>;
  } = {};

  globalThis.fetch = (async (_url, init) => {
    sawTimeoutSignal = init?.signal instanceof AbortSignal;
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"messages":["N is close to 5000."]}' } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const segments = await chatWithAlakhImage({
      history: [],
      image: Buffer.from("question-photo"),
      mimeType: "image/jpeg",
      caption: "",
    });
    assert.deepEqual(segments, ["N is close to 5000."]);
    assert.equal(body.reasoning_effort, ALAKH_IMAGE_REASONING_EFFORT);
    assert.equal(ALAKH_IMAGE_REASONING_EFFORT, "high");
    assert.ok(ALAKH_IMAGE_TIMEOUT_MS >= 240_000);
    const user = body.messages?.find((message) => message.role === "user");
    const image = Array.isArray(user?.content)
      ? user.content.find((part) => part.type === "image_url")
      : undefined;
    assert.equal(image?.image_url?.detail, "high");
    const system = body.messages?.find((message) => message.role === "system");
    assert.match(String(system?.content), /solve it in this reply/);
    assert.equal(sawTimeoutSignal, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
  }
});
