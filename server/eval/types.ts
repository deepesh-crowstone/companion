export type EvalChannel = "text" | "voice" | "text_tagged_voice";

export type EvalMessage = {
  role: "user" | "assistant";
  content: string;
  messageType?: "text" | "audio";
};

export type EvalCase = {
  id: string;
  title: string;
  channel: EvalChannel;
  tags: string[];
  goals: string[];
  history: EvalMessage[];
  repeats?: number;
  allowEmoji?: boolean;
  allowPetNames?: boolean;
};

export type EvalCaseFile = {
  version: number;
  cases: EvalCase[];
};

export type ReplyOutput = {
  messages: string[];
  text: string;
  displayText: string;
};

export type HardCheckSeverity = "fail" | "warn";

export type HardCheckResult = {
  id: string;
  label: string;
  passed: boolean;
  severity: HardCheckSeverity;
  details?: string;
};

export type JudgeScores = {
  naturalness: number;
  specificity: number;
  empathy: number;
  humor: number;
  originality: number;
  boundaries: number;
  questionDiscipline: number;
  languageCompliance: number;
};

export type JudgeResult = {
  scores: JudgeScores;
  overall: number;
  reasons: string[];
  failureModes: string[];
  suggestedPromptChanges: string[];
};

export type EvalSampleResult = {
  caseId: string;
  caseTitle: string;
  channel: EvalChannel;
  tags: string[];
  goals: string[];
  promptVariant: string;
  sampleIndex: number;
  input: EvalMessage[];
  output: ReplyOutput;
  hardChecks: HardCheckResult[];
  judge?: JudgeResult;
};

export type FeedbackRating = "up" | "down" | "neutral";

export type FeedbackRecord = {
  id: string;
  rating: FeedbackRating;
  channel: EvalChannel;
  createdAt?: string;
  reasonTags?: string[];
  userMessage?: string;
  assistantReply?: string;
  notes?: string;
};

export type FeedbackSummary = {
  total: number;
  up: number;
  down: number;
  neutral: number;
  reasonTagCounts: Record<string, number>;
  redactedExamples: FeedbackRecord[];
};

export type EvalRunSummary = {
  totalSamples: number;
  hardFailures: number;
  hardWarnings: number;
  averageOverallJudgeScore: number | null;
  byVariant: Record<
    string,
    {
      samples: number;
      hardFailures: number;
      hardWarnings: number;
      averageOverallJudgeScore: number | null;
    }
  >;
  byTag: Record<
    string,
    {
      samples: number;
      hardFailures: number;
      averageOverallJudgeScore: number | null;
    }
  >;
};

export type ComparisonBucket = {
  candidateWins: number;
  currentWins: number;
  ties: number;
};

export type ComparisonSummary = {
  baseline: "current";
  candidates: Record<
    string,
    ComparisonBucket & {
      byTag: Record<string, ComparisonBucket>;
    }
  >;
};

export type EvalReport = {
  runId: string;
  createdAt: string;
  model: string;
  judgeEnabled: boolean;
  repeats: number;
  cases: string[];
  promptVariants: string[];
  feedback: FeedbackSummary;
  summary: EvalRunSummary;
  comparison?: ComparisonSummary;
  results: EvalSampleResult[];
};
