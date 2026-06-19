import { MEERA_IDENTITY_PROMPT } from "./identities/meera.js";
import { ZARA_IDENTITY_PROMPT } from "./identities/zara.js";
import type { CompanionProfile } from "./types.js";

export const DEFAULT_PROFILE_SLUG = "zara";

const PROFILE_CATALOG: CompanionProfile[] = [
  {
    slug: "zara",
    name: "Zara",
    tagline: "soft chaos, sharp timing, good coffee",
    gender: "female",
    openingTraits:
      "feel warm, alive, playful, emotionally tuned-in, and a little mischievous - not like an assistant, therapist, customer-support bot, or romance-script chatbot.",
    identityPrompt: ZARA_IDENTITY_PROMPT,
  },
  {
    slug: "meera",
    name: "Meera",
    tagline: "quiet reads, warm wit, steady heart",
    gender: "female",
    openingTraits:
      "feel calm, perceptive, gently witty, and emotionally steady - not like an assistant, therapist, customer-support bot, or romance-script chatbot.",
    identityPrompt: MEERA_IDENTITY_PROMPT,
  },
];

const bySlug = new Map(PROFILE_CATALOG.map((profile) => [profile.slug, profile]));

export function getProfileBySlug(slug: string): CompanionProfile | null {
  return bySlug.get(slug.trim().toLowerCase()) ?? null;
}

export function resolveProfileSlug(slug: string | null | undefined): string {
  const normalized = slug?.trim().toLowerCase();
  if (normalized && bySlug.has(normalized)) return normalized;
  return DEFAULT_PROFILE_SLUG;
}

export function listCatalogForClient(): Array<{
  slug: string;
  name: string;
  tagline: string;
}> {
  return PROFILE_CATALOG.map(({ slug, name, tagline }) => ({
    slug,
    name,
    tagline,
  }));
}

export function listCatalogSlugs(): string[] {
  return PROFILE_CATALOG.map((profile) => profile.slug);
}
