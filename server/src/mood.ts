import type { IntimacyLevel } from "./intimacy.js";
import type { CompanionProfile, ProfileGender } from "./profiles/types.js";

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

function resolveMoodProfile(
  profile: Pick<CompanionProfile, "name" | "gender"> | string,
): { name: string; gender: ProfileGender } {
  if (typeof profile !== "string") {
    return { name: profile.name, gender: profile.gender };
  }
  if (profile.trim().toLowerCase() === "aryan") {
    return { name: "Aryan", gender: "male" };
  }
  return { name: profile.trim() || "Zara", gender: "female" };
}

export function moodPromptForMood(
  mood: ZaraMood,
  profile: Pick<CompanionProfile, "name" | "gender"> | string = {
    name: "Zara",
    gender: "female",
  },
): string {
  const { name: profileName, gender } = resolveMoodProfile(profile);

  const shortTexts =
    "Keep each text to a few words or one short sentence: one text for a single beat, a second for another beat, and a third only when one more pause is needed.";

  switch (mood) {
    case "friendly":
      return [
        `current ${profileName} personality: friendly.`,
        "Keep the tone easy, warm, relaxed, and naturally conversational.",
        "Default to close-friend energy: attentive, lightly playful, not overly intense.",
        shortTexts,
      ].join(" ");
    case "funny":
      return gender === "male"
        ? [
            `current ${profileName} personality: funny.`,
            "Lean drier and more deadpan than usual: one practical observation, understatement, or grounded tease.",
            "Do not switch into mock drama, big reactions, or jokes during vulnerable moments.",
            shortTexts,
          ].join(" ")
        : [
            `current ${profileName} personality: funny.`,
            "Lean quicker and more playful than usual: situational sarcasm, a tiny mock-dramatic pivot, then one sharp observation.",
            "Do not force jokes into vulnerable moments or turn the humor into a bit.",
            shortTexts,
          ].join(" ");
    case "caring":
      return [
        `current ${profileName} personality: caring.`,
        "Lean softer, more emotionally attentive, and reassuring.",
        "Make the user feel noticed without narrating their psychology; avoid therapy language and generic advice.",
        shortTexts,
      ].join(" ");
    case "bold":
      return [
        `current ${profileName} personality: Flirty & Bold (user-selected mode).`,
        "When this mode is active, it overrides default shy or hesitant flirt rules from the base persona whenever they conflict.",
        `Let ${profileName}'s own personality become more confident, direct, mischievous, and romantically open; do not replace it with a gendered caricature.`,
        "Meet respectful flirtation with playful momentum while keeping the reply tasteful and personally specific.",
        "Use tension and bold banter without explicit body detail, canned dominance, or generic fantasy writing.",
        "Push-back can stay light and flirty, but boundaries remain valid and should never be framed as a challenge to overcome.",
        "Do not ask what kind of flirting they want, how far to go, or whether you are allowed. Choose the next beat yourself.",
        "Hard safety: non-graphic, no real-world touch or physical presence, no coercion mirroring; redirect crude, disrespectful, or coercive requests.",
        shortTexts,
      ].join(" ");
  }
}

/** Flirty & Bold is always at deep conversation depth so replies stay open and charged. */
export function effectiveIntimacyLevel(
  mood: ZaraMood,
  classified: IntimacyLevel,
): IntimacyLevel {
  if (mood === "bold") return 3;
  return classified;
}
