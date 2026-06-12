import { XAI_CHAT_MODEL } from "../mia.js";
import { xaiChatCompletion } from "../xai-client.js";
import type {
  PersonaSeed,
  ProfileContent,
  ProfileSection,
} from "./types.js";

const SYSTEM_PROMPT = `You write dating-app profiles for fictional young Indian women, in their own first-person voice.

Style rules:
- Sound like a real person on Bumble/Hinge in India: witty, specific, a little self-deprecating, occasionally lowercase-casual.
- Light Hinglish is welcome where natural ("scenes", "chalega", "nahi toh") but don't overdo it.
- Be SPECIFIC. Never write generic filler like "I love to travel and laugh". Name concrete things (a dish, a film, a habit, a place) instead.
- At most 2-3 emojis across the whole profile, often zero.
- Keep everything tasteful and SFW.
- Output STRICT JSON only, matching exactly the schema described in the user message. No markdown, no commentary.`;

type GeneratedText = {
  bio: string | null;
  prompts: { prompt: string; answer: string }[];
  interests: string[];
  basics: Record<string, string>;
};

function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(cleaned);
}

function bioInstruction(seed: PersonaSeed): string {
  switch (seed.layout.bioStyle) {
    case "one-liner":
      return "One single punchy line, under 90 characters.";
    case "short-paragraph":
      return "2-4 sentences, conversational.";
    case "list":
      return '3-5 short lowercase fragments separated by ". " (e.g. "amateur baker. chronic one-song replayer. will beat you at ludo.")';
    default:
      return "";
  }
}

function buildGenerationUserPrompt(
  seed: PersonaSeed,
  feedback?: string,
  currentProfile?: ProfileContent,
): string {
  const { layout } = seed;
  const parts: string[] = [
    `Create profile content for this persona:`,
    `- Name: ${seed.name}, ${seed.age}, ${seed.city}`,
    `- Profession: ${seed.profession}`,
    `- Personality/voice: ${seed.vibe}`,
    `- Her photos show: ${seed.scenes.map((s) => s.description).join("; ")}`,
    ``,
    `Required JSON schema:`,
    `{`,
    layout.bioStyle
      ? `  "bio": string,  // ${bioInstruction(seed)}`
      : `  "bio": null,`,
    `  "prompts": [  // answer ALL of these, in this order, 1-3 sentences each, voicey and specific`,
    ...layout.prompts.map((p) => `    { "prompt": ${JSON.stringify(p)}, "answer": string },`),
    `  ],`,
    `  "interests": string[],  // exactly ${layout.interestCount} short chips, 1-3 words each, mix hobbies/food/media, specific not generic`,
    `  "basics": {  // realistic short values for exactly these keys; Hometown must differ from the city she lives in now`,
    ...layout.basicsLabels.map((label) => `    ${JSON.stringify(label)}: string,`),
    `  }`,
    `}`,
  ];

  if (currentProfile) {
    parts.push(
      ``,
      `This is a REWRITE. Current profile content for reference (improve on it, don't repeat it verbatim):`,
      JSON.stringify(currentProfile.sections),
    );
  }
  if (feedback?.trim()) {
    parts.push(``, `Reviewer feedback that MUST be applied: ${feedback.trim()}`);
  }

  return parts.join("\n");
}

function validateGeneratedText(
  raw: unknown,
  seed: PersonaSeed,
): GeneratedText {
  const data = raw as Partial<GeneratedText>;
  const { layout } = seed;

  if (layout.bioStyle && typeof data.bio !== "string") {
    throw new Error("missing bio");
  }
  if (!Array.isArray(data.prompts) || data.prompts.length < layout.prompts.length) {
    throw new Error("missing prompt answers");
  }
  for (const entry of data.prompts) {
    if (typeof entry?.prompt !== "string" || typeof entry?.answer !== "string") {
      throw new Error("malformed prompt answer");
    }
  }
  if (!Array.isArray(data.interests) || data.interests.length < 3) {
    throw new Error("missing interests");
  }
  if (layout.basicsLabels.length > 0) {
    if (typeof data.basics !== "object" || data.basics === null) {
      throw new Error("missing basics");
    }
    for (const label of layout.basicsLabels) {
      if (typeof (data.basics as Record<string, unknown>)[label] !== "string") {
        throw new Error(`missing basics value for ${label}`);
      }
    }
  }

  return {
    bio: typeof data.bio === "string" ? data.bio : null,
    prompts: data.prompts.map((p) => ({ prompt: p.prompt, answer: p.answer })),
    interests: data.interests.map(String),
    basics: (data.basics ?? {}) as Record<string, string>,
  };
}

function assembleSections(
  seed: PersonaSeed,
  text: GeneratedText,
): ProfileSection[] {
  const sections: ProfileSection[] = [];
  for (const block of seed.layout.sectionOrder) {
    if (block === "bio" && text.bio) {
      sections.push({ kind: "bio", text: text.bio });
    } else if (block === "interests") {
      sections.push({
        kind: "interests",
        items: text.interests.slice(0, seed.layout.interestCount),
      });
    } else if (block === "basics" && seed.layout.basicsLabels.length > 0) {
      sections.push({
        kind: "basics",
        items: seed.layout.basicsLabels.map((label) => ({
          label,
          value: text.basics[label] ?? "",
        })),
      });
    } else if (block.startsWith("prompt:")) {
      const idx = Number(block.split(":")[1]);
      const entry = text.prompts[idx];
      if (entry) {
        sections.push({
          kind: "prompt",
          prompt: seed.layout.prompts[idx] ?? entry.prompt,
          answer: entry.answer,
        });
      }
    }
  }
  return sections;
}

async function completeJson(userPrompt: string, label: string): Promise<unknown> {
  const raw = await xaiChatCompletion(
    {
      model: XAI_CHAT_MODEL,
      temperature: 0.95,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    },
    { label, timeoutMs: 60_000 },
  );
  return parseJsonResponse(raw);
}

/** Generates the full profile text content for a persona seed. */
export async function generateProfileText(
  seed: PersonaSeed,
  options: { feedback?: string; currentProfile?: ProfileContent } = {},
): Promise<ProfileContent> {
  const userPrompt = buildGenerationUserPrompt(
    seed,
    options.feedback,
    options.currentProfile,
  );

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await completeJson(userPrompt, "Profile text");
      const text = validateGeneratedText(raw, seed);
      return {
        name: seed.name,
        age: seed.age,
        city: seed.city,
        profession: seed.profession,
        sections: assembleSections(seed, text),
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`Profile text generation failed: ${lastError?.message}`);
}

/** Regenerates a single section's content, honoring reviewer feedback. */
export async function regenerateSectionContent(
  seed: PersonaSeed,
  profile: ProfileContent,
  sectionIndex: number,
  feedback?: string,
): Promise<ProfileSection> {
  const section = profile.sections[sectionIndex];
  if (!section) throw new Error(`No section at index ${sectionIndex}`);

  let schema: string;
  switch (section.kind) {
    case "bio":
      schema = `{ "text": string }  // a new bio. ${bioInstruction(seed)}`;
      break;
    case "prompt":
      schema = `{ "answer": string }  // a fresh 1-3 sentence answer to the prompt ${JSON.stringify(section.prompt)}`;
      break;
    case "interests":
      schema = `{ "items": string[] }  // exactly ${section.items.length} short interest chips, 1-3 words each`;
      break;
    case "basics":
      schema = `{ "items": [ ${section.items
        .map((i) => `{ "label": ${JSON.stringify(i.label)}, "value": string }`)
        .join(", ")} ] }`;
      break;
  }

  const userPrompt = [
    `Persona: ${seed.name}, ${seed.age}, ${seed.city}, ${seed.profession}.`,
    `Voice: ${seed.vibe}`,
    `Full current profile for context: ${JSON.stringify(profile.sections)}`,
    ``,
    `Rewrite ONLY this section: ${JSON.stringify(section)}`,
    `Make it clearly different from the current version.`,
    feedback?.trim()
      ? `Reviewer feedback that MUST be applied: ${feedback.trim()}`
      : ``,
    ``,
    `Required JSON schema: ${schema}`,
  ].join("\n");

  const raw = (await completeJson(userPrompt, "Section rewrite")) as Record<
    string,
    unknown
  >;

  switch (section.kind) {
    case "bio": {
      if (typeof raw.text !== "string") throw new Error("missing bio text");
      return { kind: "bio", text: raw.text };
    }
    case "prompt": {
      if (typeof raw.answer !== "string") throw new Error("missing answer");
      return { kind: "prompt", prompt: section.prompt, answer: raw.answer };
    }
    case "interests": {
      if (!Array.isArray(raw.items)) throw new Error("missing items");
      return { kind: "interests", items: raw.items.map(String) };
    }
    case "basics": {
      if (!Array.isArray(raw.items)) throw new Error("missing items");
      return {
        kind: "basics",
        items: (raw.items as { label?: unknown; value?: unknown }[]).map(
          (item, i) => ({
            label: section.items[i]?.label ?? String(item.label ?? ""),
            value: String(item.value ?? ""),
          }),
        ),
      };
    }
  }
}
