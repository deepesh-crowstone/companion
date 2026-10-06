import { XAI_REALTIME_MODEL, buildRealtimeInstructions, profileVoiceId } from "./mia.js";
import { resolveProfileSlug } from "./profiles/catalog.js";

/** Session fields for session.update / client secret binding (no model here). */
export function buildRealtimeSessionConfig(profileSlug = "zara") {
  const resolvedSlug = resolveProfileSlug(profileSlug);
  return {
    voice: profileVoiceId(resolvedSlug),
    instructions: buildRealtimeInstructions(resolvedSlug),
    turn_detection: {
      type: "server_vad",
      // Higher threshold = less sensitive, so residual speaker echo and
      // background noise are less likely to be misread as the user barging in
      // (which would cut the companion off mid-sentence).
      threshold: 0.6,
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
export function buildClientSecretRequest(profileSlug = "zara") {
  return {
    expires_after: { seconds: 600 },
    model: XAI_REALTIME_MODEL,
    session: buildRealtimeSessionConfig(profileSlug),
  };
}
