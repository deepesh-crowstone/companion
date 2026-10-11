import { visibleReply } from "./reply-client.js";
import { parseTextReplySegments } from "./text-response.js";

/** Telegram rich messages accept this much text, including formula source. */
const RICH_MESSAGE_CHAR_LIMIT = 30_000;
const PLAIN_MESSAGE_CHAR_LIMIT = 4_096;

export type AlakhTurn =
  | { kind: "chat"; messages: string[] }
  | { kind: "solution"; markdown: string };

export const ALAKH_TURN_OUTPUT_FORMAT = String.raw`output format:
- Decide first whether this turn is academic or a chat.
- Academic: they sent a question to solve, or they asked to understand a concept, or they still have a doubt about an explanation already given. One complete reply. Not a series of short texts.
- Chat: a greeting, a check-in, motivation, encouragement, a plan, family pressure, general guidance, a language choice, a blurry photo, or a refusal. This should feel like talking, not like a lesson.
- For a chat, output only JSON: {"kind":"chat","messages":["spoken text"]}
- A chat message is one or two spoken sentences, Latin script only, with no markdown and no LaTeX. A hello is one message. Guidance can be two or three short messages. Do not write an essay.
- For an academic turn, do not output JSON. The first line must be exactly SOLUTION. The rest is one Markdown document, sent as one message.
- A new question or a new concept is explained in full in that one document: what it is, why it works, a familiar picture, the working or the idea, and the result. Do not stop halfway and do not say "shall I continue".
- A follow-up doubt is only the part they did not get. Do not repeat the whole solution or the whole concept. If they say they did not understand and do not name the part, ask which part in one chat message instead of teaching it all again.
- End every academic document with one short question asking if they understood. Do not add a second question.
- Inline math uses $...$. Put a displayed equation on its own lines, with $$ before it and $$ after it.
- Use raw LaTeX. Do not use \boxed, \ce, \tag, or mhchem. Write a chemical formula as $\mathrm{H_2SO_4}$.
- Words stay Latin-script Hinglish or English, matching the student. An English question is answered in English. A Hindi question is answered in Latin-script Hinglish.
- For an academic turn, ignore the short-chunk limit and the rules against headings, lists, and markdown. The explanation must be complete.`;

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
