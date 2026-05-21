import {
  MIA_REALTIME_INSTRUCTIONS,
  MIA_VOICE_ID,
  XAI_REALTIME_MODEL,
} from "./mia.js";

/** Session fields for session.update / client secret binding (no model here). */
export function buildRealtimeSessionConfig() {
  return {
    voice: MIA_VOICE_ID,
    instructions: MIA_REALTIME_INSTRUCTIONS,
    turn_detection: {
      type: "server_vad",
      threshold: 0.45,
      silence_duration_ms: 900,
      prefix_padding_ms: 300,
    },
    audio: {
      input: { format: { type: "audio/pcm", rate: 24000 } },
      output: { format: { type: "audio/pcm", rate: 24000 } },
    },
  };
}

/** Body for POST /v1/realtime/client_secrets */
export function buildClientSecretRequest() {
  return {
    expires_after: { seconds: 600 },
    model: XAI_REALTIME_MODEL,
    session: buildRealtimeSessionConfig(),
  };
}
