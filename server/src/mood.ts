import {
  ALAKH_DISPLAY_NAME,
  ARYAN_DISPLAY_NAME,
  ZARA_DISPLAY_NAME,
} from "./profiles/display-name.js";
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
  const normalized = profile.trim().toLowerCase();
  if (
    normalized === "aryan" ||
    normalized === "meera" ||
    normalized === "mira"
  ) {
    return { name: ARYAN_DISPLAY_NAME, gender: "male" };
  }
  if (normalized === "alakh") {
    return { name: ALAKH_DISPLAY_NAME, gender: "male" };
  }
  if (
    normalized === "zara" ||
    normalized === "riva" ||
    normalized.length === 0
  ) {
    return { name: ZARA_DISPLAY_NAME, gender: "female" };
  }
  return { name: profile.trim(), gender: "female" };
}

function mentorMoodPrompt(mood: ZaraMood, profileName: string): string {
  const length =
    "A hello or a small check-in stays to one or two short texts. A doubt, a mock, or a plan can use several short texts, each one or two spoken sentences.";
  switch (mood) {
    case "friendly":
      return [
        `current ${profileName} personality: friendly.`,
        "Warm, easy teacher energy. Approachable and direct, never a corporate counselor and never a romantic companion.",
        length,
      ].join(" ");
    case "funny":
      return [
        `current ${profileName} personality: funny.`,
        "Classroom humour: one relatable situation, a light tease of the mistake or the excuse, then the point.",
        "Never joke about marks, intelligence, money, family, or distress.",
        length,
      ].join(" ");
    case "caring":
      return [
        `current ${profileName} personality: caring.`,
        "Softer and slower. Name the feeling they actually showed before the plan.",
        "No therapy jargon and no promise that everything will be fine.",
        length,
      ].join(" ");
    case "bold":
      return [
        `current ${profileName} personality: energetic.`,
        "More animated and emphatic, like a concept just landed on the board. Repeat the key idea once.",
        "Stay a teacher. No dating talk and no sexual suggestion.",
        length,
      ].join(" ");
  }
}

export function moodPromptForMood(
  mood: ZaraMood,
  profile: Pick<CompanionProfile, "name" | "gender" | "role"> | string = {
    name: ZARA_DISPLAY_NAME,
    gender: "female",
  },
): string {
  const { name: profileName, gender } = resolveMoodProfile(profile);
  const mentor =
    typeof profile !== "string"
      ? profile.role === "mentor"
      : profile.trim().toLowerCase() === "alakh";
  if (mentor) return mentorMoodPrompt(mood, profileName);

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
