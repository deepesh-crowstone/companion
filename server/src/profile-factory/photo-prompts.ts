import type { PersonaSeed, PhotoScene } from "./types.js";

/**
 * Shared aesthetic — stunning dating-app beauty: gorgeous and magnetic, still a
 * believable smartphone photo (not studio / not plastic AI).
 */
const PHOTO_STYLE =
  "Stunning Bumble/Hinge main-photo quality from a flagship smartphone portrait mode: " +
  "she is breathtakingly beautiful — gorgeous symmetrical face, luminous clear skin with a healthy glow, " +
  "large bright eyes, perfect bone structure, soft full lips, and a magnetic smile that stops the scroll. " +
  "The kind of girl who would get hundreds of right-swipes — effortlessly beautiful, not just pretty. " +
  "Dreamy flattering light only: golden-hour glow, soft window backlight, or open-shade portrait light " +
  "that makes her skin radiant and eyes sparkle — never flat overhead or harsh fluorescent. " +
  "Slight portrait-mode background blur. She looks incredible — confident, feminine, glowing. " +
  "Still a real person's photo, not a fashion campaign — but undeniably beautiful. " +
  "Adult woman in her twenties. Fully clothed, tasteful.";

export function anchorPrompt(seed: PersonaSeed, feedback?: string): string {
  const scene = seed.scenes[0];
  let prompt =
    `Gorgeous dating-app portrait of ${seed.appearance}, ${scene.description}. ` +
    `Her #1 main photo — stunning, irresistible, the most beautiful girl on the app. ` +
    PHOTO_STYLE;
  if (feedback?.trim()) {
    prompt += ` Reviewer feedback that MUST be applied: ${feedback.trim()}`;
  }
  return prompt;
}

export function scenePrompt(scene: PhotoScene, feedback?: string): string {
  let prompt =
    "Keep the exact same stunningly beautiful woman from the reference image with an identical face " +
    "(same gorgeous features, same skin tone, same identity — she must stay breathtakingly pretty). " +
    `Now she is ${scene.description}, looking absolutely gorgeous in a natural candid moment. ` +
    PHOTO_STYLE;
  if (feedback?.trim()) {
    prompt += ` Reviewer feedback that MUST be applied: ${feedback.trim()}`;
  }
  return prompt;
}
