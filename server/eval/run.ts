import "./model.js";
import path from "path";
import { loadEvalCases, DEFAULT_CASE_DIR } from "./cases.js";
import { runHardChecks } from "./checks.js";
import { generatePromptReview } from "./evolver.js";
import { loadFeedbackSummary, DEFAULT_FEEDBACK_DIR } from "./feedback.js";
import { toDbHistory } from "./history.js";
import { judgeReply } from "./judge.js";
import {
  chatModel,
  generateReply,
  loadPromptVariant,
} from "./model.js";
import {
  createEvalReport,
  DEFAULT_RUNS_DIR,
  writeEvalReport,
} from "./report.js";
import type { EvalCase, EvalSampleResult } from "./types.js";

type Args = {
  casesDir: string;
  feedbackDir: string;
  runsDir: string;
  caseIds: Set<string>;
  channels: Set<string>;
  repeats?: number;
  judge: boolean;
  dryRun: boolean;
  evolve: boolean;
  comparePrompt?: string;
};

function printHelp(): void {
  console.log(`Zara eval runner

Usage:
  npm run eval -- [options]

Options:
  --case <id>                 Run one case id. Repeat for multiple cases.
  --channel <text|voice|text_tagged_voice>
                              Run one channel. Repeat for multiple channels.
  --repeats <n>               Override per-case repeat count.
  --no-judge                  Skip LLM-as-judge scoring.
  --evolve                    Generate a human-review prompt evolution report.
  --compare-prompt <file>     Tournament mode against a candidate prompt file.
                              Plain text files are used for both text and voice.
                              JSON files may contain textSystemPrompt and voiceSystemPrompt.
  --cases <dir>               Case directory. Defaults to eval/cases.
  --feedback <dir>            Feedback directory. Defaults to eval/feedback.
  --out <dir>                 Run output directory. Defaults to eval/runs.
  --dry-run                   Validate fixture loading only; no xAI calls.
  --help                      Show this help.
`);
}

function readNext(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    casesDir: DEFAULT_CASE_DIR,
    feedbackDir: DEFAULT_FEEDBACK_DIR,
    runsDir: DEFAULT_RUNS_DIR,
    caseIds: new Set(),
    channels: new Set(),
    judge: true,
    dryRun: false,
    evolve: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
        printHelp();
        process.exit(0);
      case "--case":
        out.caseIds.add(readNext(argv, i, arg));
        i += 1;
        break;
      case "--channel":
        out.channels.add(readNext(argv, i, arg));
        i += 1;
        break;
      case "--repeats": {
        const repeats = Number(readNext(argv, i, arg));
        if (!Number.isInteger(repeats) || repeats < 1) {
          throw new Error("--repeats must be a positive integer");
        }
        out.repeats = repeats;
        i += 1;
        break;
      }
      case "--no-judge":
        out.judge = false;
        break;
      case "--evolve":
        out.evolve = true;
        break;
      case "--compare-prompt":
        out.comparePrompt = path.resolve(readNext(argv, i, arg));
        i += 1;
        break;
      case "--cases":
        out.casesDir = path.resolve(readNext(argv, i, arg));
        i += 1;
        break;
      case "--feedback":
        out.feedbackDir = path.resolve(readNext(argv, i, arg));
        i += 1;
        break;
      case "--out":
        out.runsDir = path.resolve(readNext(argv, i, arg));
        i += 1;
        break;
      case "--dry-run":
        out.dryRun = true;
        out.judge = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return out;
}

function filterCases(cases: EvalCase[], args: Args): EvalCase[] {
  return cases.filter((evalCase) => {
    if (args.caseIds.size > 0 && !args.caseIds.has(evalCase.id)) return false;
    if (args.channels.size > 0 && !args.channels.has(evalCase.channel)) {
      return false;
    }
    return true;
  });
}

function repeatsFor(evalCase: EvalCase, args: Args): number {
  return args.repeats ?? evalCase.repeats ?? 3;
}

function runId(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = filterCases(await loadEvalCases(args.casesDir), args);
  const feedback = await loadFeedbackSummary(args.feedbackDir);

  if (cases.length === 0) {
    throw new Error("No eval cases matched the selected filters");
  }

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          cases: cases.map((evalCase) => ({
            id: evalCase.id,
            title: evalCase.title,
            channel: evalCase.channel,
            tags: evalCase.tags,
            turns: evalCase.history.length,
          })),
          feedback,
        },
        null,
        2,
      ),
    );
    return;
  }

  const candidate = args.comparePrompt
    ? await loadPromptVariant(args.comparePrompt)
    : null;
  const variants = [
    { name: "current", candidate: null },
    ...(candidate ? [{ name: candidate.name, candidate }] : []),
  ];
  const results: EvalSampleResult[] = [];

  for (const evalCase of cases) {
    const repeats = repeatsFor(evalCase, args);
    const history = toDbHistory(evalCase.history);

    for (const variant of variants) {
      for (let sampleIndex = 1; sampleIndex <= repeats; sampleIndex += 1) {
        console.log(
          `[eval] ${evalCase.id} ${variant.name} sample ${sampleIndex}/${repeats}`,
        );
        const output = await generateReply(
          evalCase,
          history,
          variant.candidate ?? undefined,
        );
        const hardChecks = await runHardChecks(evalCase, output);
        const judge = args.judge ? await judgeReply(evalCase, output) : undefined;

        results.push({
          caseId: evalCase.id,
          caseTitle: evalCase.title,
          channel: evalCase.channel,
          tags: evalCase.tags,
          goals: evalCase.goals,
          promptVariant: variant.name,
          sampleIndex,
          input: evalCase.history,
          output,
          hardChecks,
          judge,
        });
      }
    }
  }

  const report = createEvalReport({
    runId: runId(),
    model: chatModel(),
    judgeEnabled: args.judge,
    repeats: repeatsFor(cases[0], args),
    results,
    feedback,
  });
  const paths = await writeEvalReport(report, args.runsDir);

  console.log(
    JSON.stringify(
      {
        report: paths,
        summary: report.summary,
        comparison: report.comparison,
      },
      null,
      2,
    ),
  );

  if (args.evolve) {
    const reviewPath = await generatePromptReview(report, args.runsDir);
    console.log(`[eval] prompt review written to ${reviewPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
