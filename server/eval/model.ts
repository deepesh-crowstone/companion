import "../src/load-env.js";
import { readFile } from "fs/promises";
import {
  MIA_TEXT_SYSTEM_PROMPT,
  MIA_VOICE_SYSTEM_PROMPT,
  XAI_CHAT_MODEL,
} from "../src/mia.js";
import {
  chatWithMia,
  chatWithMiaText,
  chatWithMiaTextAsVoice,
} from "../src/xai.js";
import type { DbMessage } from "../src/db.js";
import type { EvalCase, EvalChannel, ReplyOutput } from "./types.js";

const XAI_BASE = "https://api.x.ai/v1";

type PromptVariant = {
  name: string;
  textSystemPrompt?: string;
  voiceSystemPrompt?: string;
};

function envValue(name: string): string | null {
  const value = process.env[name]?.trim().replace(/^['"]|['"]$/g, "");
  return value && value.length > 0 ? value : null;
}

function apiKey(): string {
  const key = envValue("XAI_API_KEY");
  if (!key) {
    throw new Error("XAI_API_KEY is required to run Zara evals");
  }
  return key;
}

export function chatModel(): string {
  return envValue("XAI_CHAT_MODEL") ?? XAI_CHAT_MODEL;
}

export async function xaiChatCompletion(
  messages: { role: string; content: string }[],
  temperature: number,
): Promise<string> {
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: chatModel(),
      reasoning_effort: "none",
      messages,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`xAI eval call failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty xAI eval response");
  }
  return content;
}

function currentIndiaTimeContext(): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: "Asia/Kolkata",
  }).format(now);
  const date = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(now);
  return `current India time context: ${day}, ${date}, ${time}. Use this subtly for time-of-day vibe when relevant; do not overstate it.`;
}

function cleanTextSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseTextReplySegments(raw: string): string[] {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [withoutFence];
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = withoutFence.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const values =
        Array.isArray(parsed)
          ? parsed
          : parsed &&
              typeof parsed === "object" &&
              "messages" in parsed &&
              Array.isArray((parsed as { messages?: unknown }).messages)
            ? (parsed as { messages: unknown[] }).messages
            : null;
      const segments = values
        ?.map((value) => cleanTextSegment(value))
        .filter((value): value is string => value != null)
        .slice(0, 3);
      if (segments && segments.length > 0) return segments;
    } catch {
      // Fall through to plain-text parsing.
    }
  }

  const lineSegments = withoutFence
    .split(/\r?\n+/)
    .map((value) => cleanTextSegment(value))
    .filter((value): value is string => value != null);
  if (lineSegments.length > 1) return lineSegments.slice(0, 3);

  const oneLine = cleanTextSegment(withoutFence);
  if (!oneLine) return ["hmm"];
  return [oneLine];
}

function outputFromMessages(messages: string[]): ReplyOutput {
  return {
    messages,
    text: messages.join("\n"),
    displayText: messages.join("\n"),
  };
}

function stripSpeechTagsForDisplay(text: string): string {
  return text
    .replace(/<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/gi, "$2")
    .replace(/\[[^\]]+\]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function messagesForPrompt(
  systemPrompt: string,
  history: DbMessage[],
): { role: string; content: string }[] {
  return [
    { role: "system", content: systemPrompt },
    ...history.map((msg) => ({ role: msg.role, content: msg.content })),
  ];
}

function textSystemPrompt(prompt = MIA_TEXT_SYSTEM_PROMPT): string {
  return `${prompt}

${currentIndiaTimeContext()}

output format:
- Output only valid JSON.
- Shape: {"messages":["first small text","second small text"]}
- Use 1 to 3 messages total.
- Each message must be Latin-script Hinglish/English only.
- Do not include Devanagari, markdown, explanations, labels, numbering, or separators.`;
}

function voiceSystemPrompt(prompt = MIA_VOICE_SYSTEM_PROMPT): string {
  return `${prompt}

${currentIndiaTimeContext()}`;
}

async function generateWithOverride(
  evalCase: EvalCase,
  history: DbMessage[],
  variant: PromptVariant,
): Promise<ReplyOutput> {
  if (evalCase.channel === "text") {
    const raw = await xaiChatCompletion(
      messagesForPrompt(textSystemPrompt(variant.textSystemPrompt), history),
      0.78,
    );
    return outputFromMessages(parseTextReplySegments(raw));
  }

  const raw = await xaiChatCompletion(
    messagesForPrompt(voiceSystemPrompt(variant.voiceSystemPrompt), history),
    0.78,
  );
  return {
    messages: [raw],
    text: raw,
    displayText: stripSpeechTagsForDisplay(raw),
  };
}

async function generateWithProductionPath(
  channel: EvalChannel,
  history: DbMessage[],
): Promise<ReplyOutput> {
  if (channel === "text") {
    return outputFromMessages(await chatWithMiaText(history));
  }
  if (channel === "text_tagged_voice") {
    const text = await chatWithMiaTextAsVoice(history);
    return {
      messages: [text],
      text,
      displayText: stripSpeechTagsForDisplay(text),
    };
  }
  const text = await chatWithMia(history, { expressiveTts: true });
  return {
    messages: [text],
    text,
    displayText: stripSpeechTagsForDisplay(text),
  };
}

export async function loadPromptVariant(file: string): Promise<PromptVariant> {
  const content = await readFile(file, "utf8");
  const name = file.split(/[\\/]/).pop() ?? "candidate";

  if (file.endsWith(".json")) {
    const parsed = JSON.parse(content) as {
      name?: string;
      textSystemPrompt?: string;
      voiceSystemPrompt?: string;
    };
    return {
      name: parsed.name ?? name,
      textSystemPrompt: parsed.textSystemPrompt,
      voiceSystemPrompt: parsed.voiceSystemPrompt,
    };
  }

  return {
    name,
    textSystemPrompt: content,
    voiceSystemPrompt: content,
  };
}

export async function generateReply(
  evalCase: EvalCase,
  history: DbMessage[],
  variant?: PromptVariant,
): Promise<ReplyOutput> {
  if (variant) {
    return generateWithOverride(evalCase, history, variant);
  }
  return generateWithProductionPath(evalCase.channel, history);
}
