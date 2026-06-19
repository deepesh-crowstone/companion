export type ProfileGender = "female" | "male";

export type CompanionProfile = {
  slug: string;
  name: string;
  tagline: string;
  gender: ProfileGender;
  /** One-line personality hook after "you are {name}:" */
  openingTraits: string;
  /** Backstory, canon, tastes — unique per companion */
  identityPrompt: string;
  voiceId?: string;
};
