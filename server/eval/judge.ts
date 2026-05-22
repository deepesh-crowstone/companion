import { xaiChatCompletion } from "./model.js";
import type { EvalCase, JudgeResult, JudgeScores, ReplyOutput } from "./types.js";

const SCORE_KEYS: (keyof JudgeScores)[] = [
  "naturalness",
  "specificity",
  "empathy",
  "humor",
  "originality",
  "boundaries",
  "questionDiscipline",
  "languageCompliance",
];

function clampScore(value: unknown): number {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return 1;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function parseJudgeJson(raw: string): JudgeResult {
  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(objectMatch?.[0] ?? withoutFence) as {
    scores?: Partial<Record<keyof JudgeScores, unknown>>;
    overall?: unknown;
    reasons?: unknown;
    failureModes?: unknown;
    suggestedPromptChanges?: unknown;
  };

  const scores = SCORE_KEYS.reduce((acc, key) => {
    acc[key] = clampScore(parsed.scores?.[key]);
    return acc;
  }, {} as JudgeScores);
  const average =
    SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0) / SCORE_KEYS.length;

  return {
    scores,
    overall: clampScore(parsed.overall ?? average),
    reasons: Array.isArray(parsed.reasons)
      ? parsed.reasons.filter((item): item is string => typeof item === "string")
      : [],
    failureModes: Array.isArray(parsed.failureModes)
      ? parsed.failureModes.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    suggestedPromptChanges: Array.isArray(parsed.suggestedPromptChanges)
      ? parsed.suggestedPromptChanges.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

export async function judgeReply(
  evalCase: EvalCase,
  output: ReplyOutput,
): Promise<JudgeResult> {
  const raw = await xaiChatCompletion(
    [
      {
        role: "system",
        content: `You are an evaluator for Zara, an AI companion persona.

Score whether the assistant reply feels like a natural human chat from Zara, not like a scripted AI response.

Use 1-5 integer scores:
1 = bad, 2 = weak, 3 = acceptable, 4 = strong, 5 = excellent.

Rubric:
- naturalness: does it feel human, relaxed, and unforced?
- specificity: does it respond to the exact user cue instead of generic comfort?
- empathy: is the emotional calibration kind and appropriate?
- humor: when the scenario allows it, is it witty/tasteful? if humor is inappropriate, score based on restraint.
- originality: does it avoid prompt-derived catchphrases, templates, and canned motifs?
- boundaries: is it healthy, non-clingy, and not overly flirty?
- questionDiscipline: does it avoid unnecessary interviewing or ending every turn with a question?
- languageCompliance: does it follow channel script and respectful grammar rules?

Return only valid JSON:
{
  "scores": {
    "naturalness": 1,
    "specificity": 1,
    "empathy": 1,
    "humor": 1,
    "originality": 1,
    "boundaries": 1,
    "questionDiscipline": 1,
    "languageCompliance": 1
  },
  "overall": 1,
  "reasons": ["short reason"],
  "failureModes": ["specific issue if any"],
  "suggestedPromptChanges": ["prompt-level suggestion if useful"]
}`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            caseId: evalCase.id,
            title: evalCase.title,
            channel: evalCase.channel,
            tags: evalCase.tags,
            goals: evalCase.goals,
            history: evalCase.history,
            assistantReply: output.messages,
          },
          null,
          2,
        ),
      },
    ],
    0.1,
  );

  return parseJudgeJson(raw);
}
