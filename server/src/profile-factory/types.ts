export type BioStyle = "one-liner" | "short-paragraph" | "list";

export type PhotoScene = {
  id: string;
  /** Scene text injected into the image prompt (outfit, setting, action). */
  description: string;
};

export type ProfileLayout = {
  /** Total photos including the anchor portrait (slot 0). */
  photoCount: number;
  /** Bumble-style prompts this profile answers (text, not ids). */
  prompts: string[];
  /** Which basics badges this profile shows (e.g. Height, Zodiac). */
  basicsLabels: string[];
  bioStyle: BioStyle | null;
  interestCount: number;
  /**
   * Render order, e.g. ["bio", "prompt:0", "interests", "prompt:1", "basics"].
   * "prompt:N" indexes into `prompts`. "bio" is absent for no-bio profiles.
   */
  sectionOrder: string[];
};

export type PersonaSeed = {
  name: string;
  age: number;
  city: string;
  archetype: string;
  profession: string;
  /** Writing-voice hint for the text generator. */
  vibe: string;
  /** Detailed physical description used by every image prompt. */
  appearance: string;
  layout: ProfileLayout;
  /** One scene per photo slot; index 0 is the anchor portrait scene. */
  scenes: PhotoScene[];
};

export type ProfileSection =
  | { kind: "bio"; text: string }
  | { kind: "prompt"; prompt: string; answer: string }
  | { kind: "interests"; items: string[] }
  | { kind: "basics"; items: { label: string; value: string }[] };

export type ProfileContent = {
  name: string;
  age: number;
  city: string;
  profession: string;
  sections: ProfileSection[];
};

export type AiProfileStatus =
  | "generating"
  | "anchor_review"
  | "draft"
  | "published"
  | "rejected"
  | "failed";

export type DbAiProfile = {
  id: number;
  slug: string;
  status: AiProfileStatus;
  generation_step: string | null;
  error: string | null;
  persona_seed: PersonaSeed;
  profile: ProfileContent | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export type DbAiProfilePhoto = {
  id: number;
  profile_id: number;
  slot: number;
  object_key: string;
  prompt: string;
  is_anchor: boolean;
  created_at: Date;
};

export type DbAiProfileReview = {
  id: number;
  profile_id: number;
  target: string;
  comment: string;
  created_at: Date;
};
