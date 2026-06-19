import {
  buildRealtimeInstructions,
  buildTextSystemPrompt,
  buildVoiceSystemPrompt,
  profileVoiceId,
} from "./profiles/prompts.js";
import { DEFAULT_PROFILE_SLUG } from "./profiles/catalog.js";

/** @deprecated Use buildTextSystemPrompt(profileSlug) for multi-profile chat. */
export const MIA_TEXT_SYSTEM_PROMPT = buildTextSystemPrompt(DEFAULT_PROFILE_SLUG);

/** @deprecated Use buildVoiceSystemPrompt(profileSlug) for multi-profile chat. */
export const MIA_VOICE_SYSTEM_PROMPT = buildVoiceSystemPrompt(DEFAULT_PROFILE_SLUG);

/** @deprecated Use buildRealtimeInstructions(profileSlug) for multi-profile calls. */
export const MIA_REALTIME_INSTRUCTIONS = buildRealtimeInstructions(DEFAULT_PROFILE_SLUG);

/** xAI built-in voice used for TTS and realtime calls. */
export const MIA_VOICE_ID = process.env.MIA_VOICE_ID?.trim() || "eve";
/** xAI TTS BCP-47 code — Hindi voice for Devanagari replies. */
export const MIA_TTS_LANGUAGE = process.env.MIA_TTS_LANGUAGE?.trim() || "hi";
/** xAI STT language hint for Hindi / Hindi-English voice notes. */
export const MIA_STT_LANGUAGE = process.env.MIA_STT_LANGUAGE?.trim() || "hi";
export const XAI_CHAT_MODEL = process.env.XAI_CHAT_MODEL ?? "grok-4.3";
export const XAI_REALTIME_MODEL = "grok-voice-latest";

export {
  buildRealtimeInstructions,
  buildTextSystemPrompt,
  buildVoiceSystemPrompt,
  profileVoiceId,
};
