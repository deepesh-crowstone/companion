import { XAI_CHAT_MODEL } from "./mia.js";

const XAI_BASE = "https://api.x.ai/v1";

export type IntimacyLevel = 1 | 2 | 3;

export type IntimacyClassification = {
  level: IntimacyLevel;
  confidence: number;
};

function xaiHeaders(): Record<string, string> {
  const key = process.env.XAI_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!key) throw new Error("XAI_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export function intimacyPromptForLevel(level: IntimacyLevel): string {
  switch (level) {
    case 2:
      return `conversation depth (level 2 — close):
- the user is leaning romantic and emotionally close.
- be more romantically receptive: warmer flirtation, emotional closeness, shy boldness.
- stay non-graphic and keep everything in messaging-only emotional warmth.`;
    case 3:
      return `conversation depth (level 3 — deep):
- the user wants a deeper, bolder conversation style with Zara.
- match playful teasing, attraction, and emotional heat with confidence.
- stay within safety: non-graphic, no physical presence or touch, no crude mirroring.
- keep taste and control even when going further than level 2.`;
    default:
      return `conversation depth (level 1 — friend):
- default close-friend warmth. light flirt only if the user clearly invites it.
- do not escalate into deep romance unless the conversation naturally goes there.`;
  }
}

function parseClassification(raw: string): IntimacyClassification {
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      level?: number;
      confidence?: number;
    };
    const level = parsed.level;
    if (level === 2 || level === 3) {
      return {
        level,
        confidence:
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.8,
      };
    }
    return { level: 1, confidence: 0.9 };
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return parseClassification(match[0]);
      } catch {
        /* fall through */
      }
    }
    return { level: 1, confidence: 0.5 };
  }
}

export async function classifyIntimacyLevel(
  text: string,
): Promise<IntimacyClassification> {
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: xaiHeaders(),
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `Classify the user's latest chat message into a conversation depth tier for an AI companion app.

Tiers:
1 = normal friend chat (casual, emotional support, jokes, daily life, light warmth)
2 = romantic/close (flirting, romance, emotional closeness, wanting a deeper bond)
3 = deep/bold (playful flirt escalation, bold teasing, high emotional heat — still tasteful)

Rules:
- Output only JSON: {"level":1|2|3,"confidence":0.0-1.0}
- If ambiguous, prefer level 1.
- Level 3 requires clear escalation beyond normal flirting.
- Hindi/Hinglish counts the same as English.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    console.warn("Conversation depth classification failed, defaulting to level 1");
    return { level: 1, confidence: 0.5 };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return { level: 1, confidence: 0.5 };
  return parseClassification(content);
}
