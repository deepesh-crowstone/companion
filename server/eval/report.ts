import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type {
  ComparisonBucket,
  ComparisonSummary,
  EvalReport,
  EvalRunSummary,
  EvalSampleResult,
  FeedbackSummary,
} from "./types.js";

export const DEFAULT_RUNS_DIR = path.join(process.cwd(), "eval", "runs");

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

export function summarizeResults(results: EvalSampleResult[]): EvalRunSummary {
  const summary: EvalRunSummary = {
    totalSamples: results.length,
    hardFailures: 0,
    hardWarnings: 0,
    averageOverallJudgeScore: average(
      results
        .map((result) => result.judge?.overall)
        .filter((score): score is number => typeof score === "number"),
    ),
    byVariant: {},
    byTag: {},
  };

  for (const result of results) {
    const hardFailures = result.hardChecks.filter(
      (check) => !check.passed && check.severity === "fail",
    ).length;
    const hardWarnings = result.hardChecks.filter(
      (check) => !check.passed && check.severity === "warn",
    ).length;
    summary.hardFailures += hardFailures;
    summary.hardWarnings += hardWarnings;

    const variant = (summary.byVariant[result.promptVariant] ??= {
      samples: 0,
      hardFailures: 0,
      hardWarnings: 0,
      averageOverallJudgeScore: null,
    });
    variant.samples += 1;
    variant.hardFailures += hardFailures;
    variant.hardWarnings += hardWarnings;

    for (const tag of result.tags) {
      const tagSummary = (summary.byTag[tag] ??= {
        samples: 0,
        hardFailures: 0,
        averageOverallJudgeScore: null,
      });
      tagSummary.samples += 1;
      tagSummary.hardFailures += hardFailures;
    }
  }

  for (const [variantName, variant] of Object.entries(summary.byVariant)) {
    variant.averageOverallJudgeScore = average(
      results
        .filter((result) => result.promptVariant === variantName)
        .map((result) => result.judge?.overall)
        .filter((score): score is number => typeof score === "number"),
    );
  }

  for (const [tag, tagSummary] of Object.entries(summary.byTag)) {
    tagSummary.averageOverallJudgeScore = average(
      results
        .filter((result) => result.tags.includes(tag))
        .map((result) => result.judge?.overall)
        .filter((score): score is number => typeof score === "number"),
    );
  }

  return summary;
}

function emptyComparisonBucket(): ComparisonBucket {
  return { candidateWins: 0, currentWins: 0, ties: 0 };
}

function hardIssueCount(result: EvalSampleResult, severity: "fail" | "warn"): number {
  return result.hardChecks.filter(
    (check) => !check.passed && check.severity === severity,
  ).length;
}

function comparePair(
  current: EvalSampleResult,
  candidate: EvalSampleResult,
): "candidate" | "current" | "tie" {
  const currentFailures = hardIssueCount(current, "fail");
  const candidateFailures = hardIssueCount(candidate, "fail");
  if (candidateFailures < currentFailures) return "candidate";
  if (currentFailures < candidateFailures) return "current";

  if (current.judge && candidate.judge) {
    const delta = candidate.judge.overall - current.judge.overall;
    if (delta >= 0.5) return "candidate";
    if (delta <= -0.5) return "current";
  }

  const currentWarnings = hardIssueCount(current, "warn");
  const candidateWarnings = hardIssueCount(candidate, "warn");
  if (candidateWarnings < currentWarnings) return "candidate";
  if (currentWarnings < candidateWarnings) return "current";

  return "tie";
}

function addOutcome(bucket: ComparisonBucket, outcome: "candidate" | "current" | "tie"): void {
  if (outcome === "candidate") bucket.candidateWins += 1;
  if (outcome === "current") bucket.currentWins += 1;
  if (outcome === "tie") bucket.ties += 1;
}

export function summarizeComparison(
  results: EvalSampleResult[],
): ComparisonSummary | undefined {
  const variants = [...new Set(results.map((result) => result.promptVariant))];
  const candidates = variants.filter((variant) => variant !== "current");
  if (candidates.length === 0) return undefined;

  const byKey = new Map<string, EvalSampleResult>();
  for (const result of results) {
    byKey.set(
      `${result.promptVariant}:${result.caseId}:${result.sampleIndex}`,
      result,
    );
  }

  const summary: ComparisonSummary = {
    baseline: "current",
    candidates: {},
  };

  for (const candidateName of candidates) {
    const candidateSummary = {
      ...emptyComparisonBucket(),
      byTag: {} as Record<string, ComparisonBucket>,
    };

    for (const candidate of results.filter(
      (result) => result.promptVariant === candidateName,
    )) {
      const current = byKey.get(`current:${candidate.caseId}:${candidate.sampleIndex}`);
      if (!current) continue;
      const outcome = comparePair(current, candidate);
      addOutcome(candidateSummary, outcome);
      for (const tag of candidate.tags) {
        const tagBucket = (candidateSummary.byTag[tag] ??= emptyComparisonBucket());
        addOutcome(tagBucket, outcome);
      }
    }

    summary.candidates[candidateName] = candidateSummary;
  }

  return summary;
}

export function createEvalReport(params: {
  runId: string;
  model: string;
  judgeEnabled: boolean;
  repeats: number;
  results: EvalSampleResult[];
  feedback: FeedbackSummary;
}): EvalReport {
  return {
    runId: params.runId,
    createdAt: new Date().toISOString(),
    model: params.model,
    judgeEnabled: params.judgeEnabled,
    repeats: params.repeats,
    cases: [...new Set(params.results.map((result) => result.caseId))],
    promptVariants: [
      ...new Set(params.results.map((result) => result.promptVariant)),
    ],
    feedback: params.feedback,
    summary: summarizeResults(params.results),
    comparison: summarizeComparison(params.results),
    results: params.results,
  };
}

function markdownForReport(report: EvalReport): string {
  const lines: string[] = [
    `# Zara Eval Report ${report.runId}`,
    "",
    `- Created: ${report.createdAt}`,
    `- Model: ${report.model}`,
    `- Judge enabled: ${report.judgeEnabled ? "yes" : "no"}`,
    `- Samples: ${report.summary.totalSamples}`,
    `- Hard failures: ${report.summary.hardFailures}`,
    `- Hard warnings: ${report.summary.hardWarnings}`,
    `- Average judge score: ${
      report.summary.averageOverallJudgeScore ?? "n/a"
    }`,
    "",
    "## Variants",
    "",
  ];

  for (const [variant, summary] of Object.entries(report.summary.byVariant)) {
    lines.push(
      `- ${variant}: ${summary.samples} samples, ${summary.hardFailures} hard failures, ${summary.hardWarnings} warnings, avg judge ${summary.averageOverallJudgeScore ?? "n/a"}`,
    );
  }

  lines.push("", "## Tags", "");
  for (const [tag, summary] of Object.entries(report.summary.byTag)) {
    lines.push(
      `- ${tag}: ${summary.samples} samples, ${summary.hardFailures} hard failures, avg judge ${summary.averageOverallJudgeScore ?? "n/a"}`,
    );
  }

  if (report.comparison) {
    lines.push("", "## Tournament Comparison", "");
    for (const [candidate, summary] of Object.entries(
      report.comparison.candidates,
    )) {
      lines.push(
        `- ${candidate}: candidate wins ${summary.candidateWins}, current wins ${summary.currentWins}, ties ${summary.ties}`,
      );
      for (const [tag, tagSummary] of Object.entries(summary.byTag)) {
        lines.push(
          `  - ${tag}: candidate wins ${tagSummary.candidateWins}, current wins ${tagSummary.currentWins}, ties ${tagSummary.ties}`,
        );
      }
    }
  }

  lines.push("", "## Feedback Signal", "");
  lines.push(
    `- Total feedback records: ${report.feedback.total}`,
    `- Up/down/neutral: ${report.feedback.up}/${report.feedback.down}/${report.feedback.neutral}`,
  );
  const feedbackTags = Object.entries(report.feedback.reasonTagCounts)
    .map(([tag, count]) => `${tag}=${count}`)
    .join(", ");
  lines.push(`- Reason tags: ${feedbackTags || "none"}`);

  const weakResults = report.results
    .filter(
      (result) =>
        result.hardChecks.some((check) => !check.passed) ||
        (result.judge?.overall ?? 5) <= 3,
    )
    .slice(0, 12);
  lines.push("", "## Representative Weak Samples", "");
  if (weakResults.length === 0) {
    lines.push("No weak samples found.");
  }
  for (const result of weakResults) {
    const failures = result.hardChecks
      .filter((check) => !check.passed)
      .map((check) => `${check.id}${check.details ? ` (${check.details})` : ""}`)
      .join(", ");
    lines.push(
      `### ${result.caseId} / ${result.promptVariant} / sample ${result.sampleIndex}`,
      "",
      `- Judge overall: ${result.judge?.overall ?? "n/a"}`,
      `- Check issues: ${failures || "none"}`,
      `- Reply: ${JSON.stringify(result.output.messages)}`,
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function writeEvalReport(
  report: EvalReport,
  runsDir = DEFAULT_RUNS_DIR,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(runsDir, { recursive: true });
  const jsonPath = path.join(runsDir, `${report.runId}.json`);
  const markdownPath = path.join(runsDir, `${report.runId}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, markdownForReport(report));
  return { jsonPath, markdownPath };
}
