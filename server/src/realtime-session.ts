import { MIA_SYSTEM_PROMPT, MIA_VOICE_ID } from "./mia.js";

export function buildRealtimeSession() {
  return {
    model: "grok-voice-latest",
    voice: MIA_VOICE_ID,
    instructions: MIA_SYSTEM_PROMPT,
    turn_detection: {
      type: "server_vad",
      silence_duration_ms: 600,
      prefix_padding_ms: 300,
    },
    audio: {
      input: { format: { type: "audio/pcm", rate: 24000 } },
      output: { format: { type: "audio/pcm", rate: 24000 } },
    },
  };
}
