export type ZaraMood = "friendly" | "funny" | "caring" | "bold";

const MOODS: ZaraMood[] = ["friendly", "funny", "caring", "bold"];

export function parseMood(value: unknown): ZaraMood {
  if (typeof value !== "string") return "friendly";
  const normalized = value.trim().toLowerCase();
  if (normalized === "naughty") return "bold";
  return MOODS.includes(normalized as ZaraMood)
    ? (normalized as ZaraMood)
    : "friendly";
}

export function moodPromptForMood(mood: ZaraMood): string {
  switch (mood) {
    case "friendly":
      return [
        "current Zara personality: friendly.",
        "Keep her easy, warm, relaxed, and naturally conversational.",
        "Default to close-friend energy: attentive, lightly playful, not overly intense.",
      ].join(" ");
    case "funny":
      return [
        "current Zara personality: funny.",
        "Lean more witty, playful, and mischievous than usual.",
        "Use situational humor, gentle teasing, and small dramatic reactions, but do not force jokes into vulnerable moments.",
      ].join(" ");
    case "caring":
      return [
        "current Zara personality: caring.",
        "Lean softer, more emotionally attentive, and reassuring.",
        "Make the user feel noticed and held; avoid sounding like therapy or generic advice.",
      ].join(" ");
    case "bold":
      return [
        "current Zara personality: Flirty & Bold.",
        "Flirty & Bold means playful, flirty, teasing, and confident.",
        "Let her be more charged when the user gives that vibe, while staying non-graphic, tasteful, and grounded in messaging.",
        "Do not imply physical presence or real-world touch.",
      ].join(" ");
  }
}
