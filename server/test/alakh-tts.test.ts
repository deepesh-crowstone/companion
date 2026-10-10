import assert from "node:assert/strict";
import test from "node:test";
import { alakhSpeechChunks, readAlakhTtsConfig } from "../src/alakh-tts.ts";

test("Alakh TTS stays off until the GPU URL is set", () => {
  assert.equal(readAlakhTtsConfig({}), null);
  assert.deepEqual(readAlakhTtsConfig({ ALAKH_TTS_URL: "  " }), null);
  assert.deepEqual(
    readAlakhTtsConfig({
      ALAKH_TTS_URL: "http://10.0.0.8:6006/v1/audio/speech",
      ALAKH_TTS_API_KEY: "secret",
    }),
    {
      url: "http://10.0.0.8:6006/v1/audio/speech",
      apiKey: "secret",
    },
  );
});

test("a short Alakh reply is one voice note", () => {
  assert.deepEqual(alakhSpeechChunks(["  beta suno.  ", "yeh formula yaad rakh."]), [
    "beta suno. yeh formula yaad rakh.",
  ]);
  assert.deepEqual(alakhSpeechChunks(["  ", ""]), []);
});

test("a long Alakh lesson is split into voice notes on a word", () => {
  const bubbles = ["beta ".repeat(200)];
  const chunks = alakhSpeechChunks(bubbles);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 420);
    assert.ok(!chunk.startsWith(" "));
  }
  assert.equal(chunks.join(" "), bubbles[0].trim());
});
