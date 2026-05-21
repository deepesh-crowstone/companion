/**
 * xAI TTS speech tags — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#speech-tags
 * Inline: [pause], [long-pause], [laugh], [chuckle], [giggle], [sigh], [breath], etc.
 * Wrapping: <whisper>…</whisper> and similar paired tags.
 */

export const INLINE_SPEECH_TAGS = [
  "pause",
  "long-pause",
  "hum-tune",
  "laugh",
  "chuckle",
  "giggle",
  "cry",
  "tsk",
  "tongue-click",
  "lip-smack",
  "breath",
  "inhale",
  "exhale",
  "sigh",
] as const;

/** Appended to Mia's system prompt only for voice-note replies (fed to TTS). */
export const MIA_VOICE_TTS_INSTRUCTIONS = `
voice note reply mode: your message will be spoken aloud via xAI TTS with inline speech tags. the user will NOT see the tags in chat — only hear them.

use tags sparingly (about 1–3 per short reply) where they feel natural for a flirty, warm voice note:
- inline: [pause], [long-pause], [laugh], [chuckle], [giggle], [sigh], [breath], [exhale]
- wrapping (opening + closing tag around a phrase): <whisper>secret aside</whisper>, <excited>that's wild</excited>, <soft>hey you</soft>

rules:
- reply in romanized Hinglish (hindi + english mix) so TTS uses a natural hindi accent — e.g. "arre [pause] tum bhi na [laugh]"
- keep lowercase whatsapp style and stay short
- combine tags with punctuation (e.g. "sach me? [laugh] you're impossible yaar")
- use [pause] or [long-pause] for a beat before a punchline or vulnerable line
- never explain the tags or mention TTS
- still follow all mia persona rules above`;

const inlineTagPattern = new RegExp(
  `\\[(?:${INLINE_SPEECH_TAGS.join("|")})\\]\\s*`,
  "gi",
);

const wrappingTagPattern = /<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/gi;

/** Plain text for DB / chat bubbles (tags removed, meaning kept). */
export function stripSpeechTagsForDisplay(text: string): string {
  let out = text.replace(wrappingTagPattern, "$2");
  out = out.replace(inlineTagPattern, "");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}
