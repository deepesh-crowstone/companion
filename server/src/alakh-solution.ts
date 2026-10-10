import { visibleReply } from "./reply-client.js";
import { parseTextReplySegments } from "./text-response.js";

/** Telegram rich messages accept this much text, including formula source. */
const RICH_MESSAGE_CHAR_LIMIT = 30_000;
const PLAIN_MESSAGE_CHAR_LIMIT = 4_096;

export type AlakhTurn =
  | { kind: "chat"; messages: string[] }
  | { kind: "solution"; markdown: string };

export const ALAKH_TURN_OUTPUT_FORMAT = String.raw`output format:
- Decide first whether this turn is a solution or a chat.
- A solution is a question, numerical, derivation, formula, diagram, or any doubt that needs working. A chat is a greeting, a check-in, motivation, a plan, a language choice, a blurry photo, or a refusal.
- For a chat, output only JSON: {"kind":"chat","messages":["spoken text"]}
- A chat message is one or two spoken sentences, Latin script only, with no markdown and no LaTeX.
- For a solution, do not output JSON. The first line must be exactly SOLUTION. The rest is one Markdown document containing the entire solution.
- That document is sent as one message. Do not split the working across chat bubbles.
- Write it step by step and in full: what is given, the physical idea, numbered steps, and the final answer. Each step says what it is doing, then shows the equation.
- Inline math uses $...$. Put a displayed equation on its own lines, with $$ before it and $$ after it.
- Use raw LaTeX. Do not use \boxed, \ce, \tag, or mhchem. Write a chemical formula as $\mathrm{H_2SO_4}$.
- Words stay Latin-script Hinglish or English, matching the student. An English question is answered in English. A Hindi question is answered in Latin-script Hinglish.
- For a solution, ignore the short-chunk limit and the rules against headings, lists, and markdown. The solution must be complete.`;

function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|math)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function hasMath(text: string): boolean {
  if (/\$\$[\s\S]+?\$\$/.test(text)) return true;
  if (/\\\[[\s\S]+?\\\]/.test(text)) return true;
  if (/\\\([\s\S]+?\\\)/.test(text)) return true;
  if (
    /\\(?:frac|sum|int|sqrt|mathrm|vec|cdot|partial|Delta|alpha|beta|theta|omega|pi|infty|left|right|ce|boxed|begin)\b/.test(
      text,
    )
  ) {
    return true;
  }
  for (const match of text.matchAll(/\$([^$\n]+)\$/g)) {
    if (/[\\^=_]/.test(match[1] ?? "")) return true;
  }
  return false;
}

function matchingBrace(source: string, openIndex: number): number | null {
  if (source[openIndex] !== "{") return null;
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function subscriptDigits(formula: string): string {
  return formula.replace(/([A-Za-z)])(\d+)/g, "$1_$2");
}

function rewriteLatexCommands(source: string): string {
  const commands = ["boxed", "ce", "tag"] as const;
  let out = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "\\") {
      out += source[index];
      index += 1;
      continue;
    }
    const command = commands.find((name) => {
      if (!source.startsWith(`\\${name}`, index)) return false;
      const next = source[index + name.length + 1] ?? "";
      return !/[A-Za-z]/.test(next);
    });
    if (!command) {
      out += source[index];
      index += 1;
      continue;
    }
    let cursor = index + command.length + 1;
    while (source[cursor] === " ") cursor += 1;
    if (source[cursor] !== "{") {
      out += source[index];
      index += 1;
      continue;
    }
    const end = matchingBrace(source, cursor);
    if (end == null) {
      out += source.slice(index);
      break;
    }
    const inner = rewriteLatexCommands(source.slice(cursor + 1, end));
    if (command === "boxed") out += inner;
    else if (command === "ce") out += `\\mathrm{${subscriptDigits(inner)}}`;
    index = end + 1;
  }
  return out;
}

/** Makes model LaTeX render in a Telegram rich message. */
export function prepareSolutionMarkdown(markdown: string): string {
  let text = rewriteLatexCommands(markdown.trim());
  text = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, expression: string) => `\n$$\n${expression.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, expression: string) => `$${expression.trim()}$`)
    .replace(/\\begin\{equation\*?\}/g, "$$")
    .replace(/\\end\{equation\*?\}/g, "$$")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= RICH_MESSAGE_CHAR_LIMIT) return text;
  const cut = text.slice(0, RICH_MESSAGE_CHAR_LIMIT);
  const boundary = cut.lastIndexOf("\n");
  return `${(boundary > 1000 ? cut.slice(0, boundary) : cut).trimEnd()}\n\n...`;
}

function finishSolution(markdown: string): AlakhTurn {
  const prepared = prepareSolutionMarkdown(markdown);
  if (!prepared) return { kind: "chat", messages: ["hmm"] };
  return { kind: "solution", markdown: prepared };
}

function chatMessages(messages: unknown[]): AlakhTurn | null {
  const texts = messages.filter(
    (message): message is string => typeof message === "string" && message.trim().length > 0,
  );
  if (texts.length === 0) return null;
  const joined = texts.join("\n\n");
  if (hasMath(joined)) return finishSolution(joined);
  return {
    kind: "chat",
    messages: parseTextReplySegments(JSON.stringify({ messages: texts }), "mentor"),
  };
}

function turnFromJson(value: unknown): AlakhTurn | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { kind?: unknown; markdown?: unknown; messages?: unknown };
  if (record.kind === "solution" && typeof record.markdown === "string") {
    return finishSolution(record.markdown);
  }
  if (Array.isArray(record.messages)) return chatMessages(record.messages);
  return null;
}

/** Reads a model reply as either short chat bubbles or one full solution. */
export function parseAlakhTurn(raw: string): AlakhTurn {
  const unfenced = stripFence(visibleReply(raw));
  const solution = unfenced.match(/^SOLUTION[ \t]*\r?\n([\s\S]*)$/i);
  if (solution) return finishSolution(solution[1] ?? "");

  try {
    const parsed = turnFromJson(JSON.parse(unfenced));
    if (parsed) return parsed;
  } catch {
    // A solution is plain Markdown, so invalid JSON is expected.
  }

  if (hasMath(unfenced)) return finishSolution(unfenced);
  const messages = parseTextReplySegments(unfenced, "mentor");
  return { kind: "chat", messages };
}

export function alakhRichMessage(
  chatId: number,
  markdown: string,
): { chat_id: number; rich_message: { markdown: string; skip_entity_detection: true } } {
  return {
    chat_id: chatId,
    rich_message: {
      markdown: prepareSolutionMarkdown(markdown),
      skip_entity_detection: true,
    },
  };
}

/** One plain message when the rich renderer rejects the solution. */
export function plainSolutionFallback(markdown: string): string {
  const text = prepareSolutionMarkdown(markdown);
  if (text.length <= PLAIN_MESSAGE_CHAR_LIMIT) return text;
  return `${text.slice(0, PLAIN_MESSAGE_CHAR_LIMIT - 1).trimEnd()}…`;
}
