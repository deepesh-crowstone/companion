import assert from "node:assert/strict";
import test from "node:test";
import {
  readTelegramSttConfig,
  sttUploadName,
  transcriptFromSttPayload,
  transcribeVoiceNote,
} from "../src/telegram-stt.ts";

test("voice transcript is the trimmed text field", () => {
  assert.equal(transcriptFromSttPayload({ text: "  inertia kya hai  " }), "inertia kya hai");
  assert.equal(transcriptFromSttPayload({}), "");
  assert.equal(transcriptFromSttPayload(null), "");
});

test("telegram ogg voice notes upload as opus", () => {
  assert.equal(sttUploadName("file_123.oga", "audio/ogg"), "speech.opus");
  assert.equal(sttUploadName("clip.mp3", "audio/mpeg"), "clip.mp3");
});

test("STT config is absent until the endpoint and key are set", () => {
  const previousUrl = process.env.TELEGRAM_STT_URL;
  const previousKey = process.env.TELEGRAM_STT_API_KEY;
  const previousModel = process.env.TELEGRAM_STT_MODEL;
  const previousLanguage = process.env.TELEGRAM_STT_LANGUAGE;
  delete process.env.TELEGRAM_STT_URL;
  delete process.env.TELEGRAM_STT_API_KEY;
  delete process.env.TELEGRAM_STT_MODEL;
  delete process.env.TELEGRAM_STT_LANGUAGE;
  assert.equal(readTelegramSttConfig(), null);
  process.env.TELEGRAM_STT_URL = "http://stt.example/v1/audio/transcriptions/";
  process.env.TELEGRAM_STT_API_KEY = "test-key";
  assert.deepEqual(readTelegramSttConfig(), {
    url: "http://stt.example/v1/audio/transcriptions",
    apiKey: "test-key",
    model: "Qwen/Qwen3-ASR-1.7B",
    language: "Auto",
  });
  if (previousUrl == null) delete process.env.TELEGRAM_STT_URL;
  else process.env.TELEGRAM_STT_URL = previousUrl;
  if (previousKey == null) delete process.env.TELEGRAM_STT_API_KEY;
  else process.env.TELEGRAM_STT_API_KEY = previousKey;
  if (previousModel == null) delete process.env.TELEGRAM_STT_MODEL;
  else process.env.TELEGRAM_STT_MODEL = previousModel;
  if (previousLanguage == null) delete process.env.TELEGRAM_STT_LANGUAGE;
  else process.env.TELEGRAM_STT_LANGUAGE = previousLanguage;
});

test("transcribeVoiceNote posts the audio and reads the transcript", async () => {
  const previous = globalThis.fetch;
  let seen: { url?: string; auth?: string; model?: string; language?: string; filename?: string } =
    {};
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const form = init?.body as FormData;
    const headers = init?.headers as { Authorization?: string };
    seen = {
      url: String(url),
      auth: headers.Authorization,
      model: String(form.get("model")),
      language: String(form.get("language")),
      filename: (form.get("file") as File).name,
    };
    return new Response(JSON.stringify({ text: "newton ka law samjha do" }), { status: 200 });
  }) as typeof fetch;
  try {
    const text = await transcribeVoiceNote(
      {
        url: "http://stt.example/v1/audio/transcriptions",
        apiKey: "test-key",
        model: "Qwen/Qwen3-ASR-1.7B",
        language: "Auto",
      },
      { bytes: Buffer.from("opus-bytes"), filename: "file.oga", mimeType: "audio/ogg" },
    );
    assert.equal(text, "newton ka law samjha do");
    assert.equal(seen.url, "http://stt.example/v1/audio/transcriptions");
    assert.equal(seen.auth, "Bearer test-key");
    assert.equal(seen.model, "Qwen/Qwen3-ASR-1.7B");
    assert.equal(seen.language, "Auto");
    assert.equal(seen.filename, "speech.opus");
  } finally {
    globalThis.fetch = previous;
  }
});
