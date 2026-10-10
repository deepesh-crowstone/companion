import assert from "node:assert/strict";
import test from "node:test";
import {
  LatencyAccount,
  formatLatencyLine,
  telegramMessageAgeSeconds,
} from "../src/telegram-latency.ts";

test("message age is whole seconds from Telegram's date", () => {
  assert.equal(
    telegramMessageAgeSeconds({ message: { date: 1_700_000_000 } }, 1_700_000_002_400),
    2,
  );
  assert.equal(telegramMessageAgeSeconds({ message: {} }), null);
  assert.equal(
    telegramMessageAgeSeconds({ message: { date: 1_700_000_010 } }, 1_700_000_000_000),
    0,
  );
});

test("latency line lists each step, the first send, and the unaccounted gap", () => {
  const line = formatLatencyLine({
    username: "alakhpandeysir1Bot",
    kind: "voice",
    updateId: 12,
    ageSeconds: 1,
    notes: [
      { name: "bytes", value: "48000" },
      { name: "chars", value: "22" },
      { name: "bubbles", value: "2" },
    ],
    spans: [
      { name: "claim", ms: 8 },
      { name: "queue", ms: 0 },
      { name: "download", ms: 420 },
      { name: "stt", ms: 900 },
      { name: "model", ms: 2400 },
      { name: "send", ms: 880 },
    ],
    firstMs: 3810,
    totalMs: 4620,
    outcome: "ok",
  });
  assert.equal(
    line,
    "telegram @alakhpandeysir1Bot voice update=12 age=1s bytes=48000 chars=22 bubbles=2 claim=8ms queue=0ms download=420ms stt=900ms model=2400ms send=880ms first=3810ms other=12ms total=4620ms ok",
  );
});

test("account records steps in order and logs once", async () => {
  let now = 1000;
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    const account = new LatencyAccount(() => now);
    await account.time("claim", async () => {
      now = 1012;
    });
    now = 1100;
    account.wait("queue");
    await account.time("model", async () => {
      now = 3000;
    });
    account.markFirstSend();
    account.note("bubbles", 1);
    account.log({
      username: "alakhpandeysir1Bot",
      kind: "text",
      updateId: 4,
      ageSeconds: null,
      outcome: "ok",
    });
    account.log({
      username: "alakhpandeysir1Bot",
      kind: "text",
      updateId: 4,
      ageSeconds: null,
      outcome: "error",
    });
  } finally {
    console.log = original;
  }

  assert.equal(lines.length, 1);
  assert.equal(
    lines[0],
    "telegram @alakhpandeysir1Bot text update=4 bubbles=1 claim=12ms queue=88ms model=1900ms first=2000ms total=2000ms ok",
  );
});
