import { MIA_SYSTEM_PROMPT, MIA_VOICE_ID, XAI_CHAT_MODEL } from "./mia.js";
import { MIA_VOICE_TTS_INSTRUCTIONS } from "./tts-speech.js";
import { buildRealtimeSession } from "./realtime-session.js";
import type { DbMessage } from "./db.js";

const XAI_BASE = "https://api.x.ai/v1";

function apiKey(): string {
  const raw = process.env.XAI_API_KEY;
  if (!raw?.trim()) {
    throw new Error(
      "XAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key from https://console.x.ai/",
    );
  }
  // Strip whitespace and accidental surrounding quotes from .env
  const key = raw.trim().replace(/^['"]|['"]$/g, "");
  if (key.length < 20 || key.includes("your_xai") || key === "test") {
    throw new Error(
      "XAI_API_KEY looks invalid. Use a real key from https://console.x.ai/team/default/api-keys",
    );
  }
  return key;
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function verifyXaiConnection(): Promise<void> {
  const res = await fetch(`${XAI_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`xAI rejected API key (${res.status}): ${err.slice(0, 200)}`);
  }
}

export async function createRealtimeClientSecret(): Promise<{
  value: string;
  expires_at: number;
}> {
  const res = await fetch(`${XAI_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      expires_after: { seconds: 600 },
      session: buildRealtimeSession(),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create realtime token: ${res.status} ${err}`);
  }

  return res.json() as Promise<{ value: string; expires_at: number }>;
}

export async function transcribeAudio(
  filePath: string,
  mimeType: string,
): Promise<string> {
  const { readFileSync } = await import("fs");
  const buffer = readFileSync(filePath);
  const form = new FormData();
  const filename = filePath.split("/").pop() ?? "audio.m4a";
  form.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    filename,
  );

  const res = await fetch(`${XAI_BASE}/stt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  const res = await fetch(`${XAI_BASE}/tts`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text,
      voice_id: MIA_VOICE_ID,
      language: "en",
      output_format: { codec: "mp3", sample_rate: 24000 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS failed: ${res.status} ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export type ChatWithMiaOptions = {
  /** Voice notes: model may embed xAI TTS speech tags in the reply. */
  expressiveTts?: boolean;
};

export async function chatWithMia(
  history: DbMessage[],
  options?: ChatWithMiaOptions,
): Promise<string> {
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    throw new Error("Chat history must end with a user message");
  }

  const systemPrompt = options?.expressiveTts
    ? `${MIA_SYSTEM_PROMPT}\n${MIA_VOICE_TTS_INSTRUCTIONS}`
    : MIA_SYSTEM_PROMPT;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      messages,
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Empty response from xAI");
  }

  return reply;
}
