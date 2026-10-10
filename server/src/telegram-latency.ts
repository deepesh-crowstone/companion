export type LatencySpan = { name: string; ms: number };
export type LatencyNote = { name: string; value: string };

type Clock = () => number;

export class LatencyAccount {
  private readonly start: number;
  private cursor: number;
  private readonly spans: LatencySpan[] = [];
  private readonly notes: LatencyNote[] = [];
  private firstMs: number | null = null;
  private logged = false;

  constructor(private readonly now: Clock = () => performance.now()) {
    this.start = this.now();
    this.cursor = this.start;
  }

  /** Times one step. Steps must run one after another, not nested. */
  async time<T>(name: string, work: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await work();
    } finally {
      const ended = this.now();
      this.spans.push({ name, ms: Math.max(0, Math.round(ended - started)) });
      this.cursor = ended;
    }
  }

  /** Records the gap since the previous step, such as waiting behind an earlier message. */
  wait(name: string): void {
    const ended = this.now();
    this.spans.push({ name, ms: Math.max(0, Math.round(ended - this.cursor)) });
    this.cursor = ended;
  }

  note(name: string, value: string | number): void {
    this.notes.push({ name, value: String(value) });
  }

  markFirstSend(): void {
    if (this.firstMs == null) {
      this.firstMs = Math.max(0, Math.round(this.now() - this.start));
    }
  }

  log(input: {
    username: string;
    kind: string;
    updateId: number;
    ageSeconds: number | null;
    outcome: "ok" | "error";
  }): void {
    if (this.logged) return;
    this.logged = true;
    const totalMs = Math.max(0, Math.round(this.now() - this.start));
    console.log(
      formatLatencyLine({
        ...input,
        spans: this.spans,
        notes: this.notes,
        firstMs: this.firstMs,
        totalMs,
      }),
    );
  }
}

/** How many seconds Telegram has already held the message, from message.date. */
export function telegramMessageAgeSeconds(
  body: unknown,
  nowMs = Date.now(),
): number | null {
  if (!body || typeof body !== "object") return null;
  const date = (body as { message?: { date?: unknown } }).message?.date;
  if (typeof date !== "number" || !Number.isFinite(date)) return null;
  return Math.max(0, Math.round(nowMs / 1000 - date));
}

export function formatLatencyLine(input: {
  username: string;
  kind: string;
  updateId: number;
  ageSeconds: number | null;
  spans: readonly LatencySpan[];
  notes: readonly LatencyNote[];
  firstMs: number | null;
  totalMs: number;
  outcome: "ok" | "error";
}): string {
  const parts = [
    "telegram",
    `@${input.username}`,
    input.kind,
    `update=${input.updateId}`,
  ];
  if (input.ageSeconds != null) parts.push(`age=${input.ageSeconds}s`);
  for (const note of input.notes) parts.push(`${note.name}=${note.value}`);
  for (const span of input.spans) parts.push(`${span.name}=${span.ms}ms`);
  if (input.firstMs != null) parts.push(`first=${input.firstMs}ms`);
  const accounted = input.spans.reduce((sum, span) => sum + span.ms, 0);
  const other = input.totalMs - accounted;
  if (other >= 2) parts.push(`other=${other}ms`);
  parts.push(`total=${input.totalMs}ms`);
  parts.push(input.outcome);
  return parts.join(" ");
}
