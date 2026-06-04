import { XAI_CHAT_MODEL } from "./mia.js";
import { xaiChatCompletion } from "./xai-client.js";
import { userLikelyWantsPhoto } from "./zara-photos.js";

export type PhotoRequestClassification = {
  wantsPhoto: boolean;
  emotion: string | null;
  clothingLevel: string | null;
};

function parsePhotoClassification(raw: string): PhotoRequestClassification {
  const fallback: PhotoRequestClassification = {
    wantsPhoto: false,
    emotion: null,
    clothingLevel: null,
  };
  try {
    const parsed = JSON.parse(raw.trim()) as {
      wantsPhoto?: boolean;
      emotion?: string;
      clothingLevel?: string;
    };
    return {
      wantsPhoto: Boolean(parsed.wantsPhoto),
      emotion:
        typeof parsed.emotion === "string" ? parsed.emotion.trim() : null,
      clothingLevel:
        typeof parsed.clothingLevel === "string"
          ? parsed.clothingLevel.trim()
          : null,
    };
  } catch {
    const match = raw.trim().match(/\{[\s\S]*\}/);
    if (match) return parsePhotoClassification(match[0]);
    return fallback;
  }
}

export async function classifyPhotoRequest(
  text: string,
): Promise<PhotoRequestClassification> {
  if (!userLikelyWantsPhoto(text)) {
    return { wantsPhoto: false, emotion: null, clothingLevel: null };
  }

  const content = await xaiChatCompletion(
    {
      model: XAI_CHAT_MODEL,
      reasoning_effort: "none",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `The user may be asking Zara (romantic AI companion) for a photo/selfie/picture.

Output only JSON:
{"wantsPhoto":true|false,"emotion":"happy|romantic|flirty|shy|playful|bold|soft|null","clothingLevel":"casual|modest|romantic|bold|null"}

Rules:
- wantsPhoto true only if they clearly want an image now.
- Pick emotion/clothingLevel hints from their wording (e.g. cute selfie -> shy/modest, bold pic -> bold).
- If ambiguous, wantsPhoto false.`,
        },
        { role: "user", content: text },
      ],
    },
    { timeoutMs: 10_000, retries: 0, label: "Photo request classification" },
  ).catch(() => null);

  if (!content) {
    return { wantsPhoto: true, emotion: null, clothingLevel: "romantic" };
  }
  return parsePhotoClassification(content);
}
