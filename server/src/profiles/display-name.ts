/** Spoken name for the companion stored under profile slug `zara`. */
export const ZARA_DISPLAY_NAME = "Riva";

/** Spoken name for the companion stored under profile slug `aryan`. */
export const ARYAN_DISPLAY_NAME = "Aryan";

/**
 * Name to speak or show for a profile slug.
 * Slug `zara` (and the default companion) is Riva. The raw slug is never used as a name.
 */
export function displayNameForSlug(slug: string | null | undefined): string {
  const normalized = slug?.trim().toLowerCase() ?? "";
  if (
    normalized === "aryan" ||
    normalized === "meera" ||
    normalized === "mira"
  ) {
    return ARYAN_DISPLAY_NAME;
  }
  return ZARA_DISPLAY_NAME;
}
