export type ProfileGender = "female" | "male";

/** Companion chats are social. Mentor chats are study guidance. */
export type ProfileRole = "companion" | "mentor";

export type CompanionProfile = {
  slug: string;
  name: string;
  tagline: string;
  gender: ProfileGender;
  /** Study mentors skip romantic private mode and may explain at teaching length. */
  role?: ProfileRole;
  /** One-line personality hook after "you are {name}:" */
  openingTraits: string;
  /** Backstory, canon, tastes — unique per companion */
  identityPrompt: string;
  voiceId?: string;
};
