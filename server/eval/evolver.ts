import { readFile, writeFile } from "fs/promises";
import path from "path";
import { xaiChatCompletion } from "./model.js";
import type { EvalReport } from "./types.js";

function compactReport(report: EvalReport): unknown {
  const weakSamples = report.results
    .filter(
      (result) =>
        result.hardChecks.some((check) => !check.passed) ||
        (result.judge?.overall ?? 5) <= 3,
    )
    .slice(0, 20)
    .map((result) => ({
      caseId: result.caseId,
      channel: result.channel,
      tags: result.tags,
      goals: result.goals,
      promptVariant: result.promptVariant,
      reply: result.output.messages,
      hardIssues: result.hardChecks
        .filter((check) => !check.passed)
        .map((check) => ({
          id: check.id,
          severity: check.severity,
          details: check.details,
        })),
      judge: result.judge
        ? {
            overall: result.judge.overall,
            scores: result.judge.scores,
            reasons: result.judge.reasons,
            failureModes: result.judge.failureModes,
            suggestedPromptChanges: result.judge.suggestedPromptChanges,
          }
        : null,
    }));

  return {
    runId: report.runId,
    summary: report.summary,
    feedback: report.feedback,
    weakSamples,
  };
}

export async function generatePromptReview(
  report: EvalReport,
  runsDir: string,
): Promise<string> {
  const miaPrompt = await readFile(path.join(process.cwd(), "src", "mia.ts"), "utf8");
  const ttsPrompt = await readFile(
    path.join(process.cwd(), "src", "tts-speech.ts"),
    "utf8",
  );

  const review = await xaiChatCompletion(
    [
      {
        role: "system",
        content: `You are a prompt evaluation lead for Zara, a human-feeling AI companion.

Read the eval report and current prompt files. Produce a human-reviewable prompt evolution report.

Hard constraints:
- Do not claim that production was changed.
- Do not output an automatically applied patch.
- Propose changes as a markdown review with candidate diff blocks only.
- Optimize for naturalness, specificity, empathy, tasteful humor, healthy boundaries, and non-scripted originality.
- Avoid adding more sample reply lines that the model could copy.

Return markdown with these sections:
1. Summary
2. Highest-Risk Failures
3. Recommended Prompt Changes
4. Candidate Diff
5. Regression Risks
6. Manual Test Suggestions`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            compactReport: compactReport(report),
            currentPromptFiles: {
              "src/mia.ts": miaPrompt.slice(0, 25000),
              "src/tts-speech.ts": ttsPrompt.slice(0, 12000),
            },
          },
          null,
          2,
        ),
      },
    ],
    0.2,
  );

  const reviewPath = path.join(runsDir, `${report.runId}-prompt-review.md`);
  await writeFile(reviewPath, `${review.trim()}\n`);
  return reviewPath;
}
