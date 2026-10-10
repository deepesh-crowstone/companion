import assert from "node:assert/strict";
import test from "node:test";
import {
  alakhRichMessage,
  parseAlakhTurn,
  plainSolutionFallback,
  prepareSolutionMarkdown,
} from "../src/alakh-solution.ts";

test("a worked solution stays one document", () => {
  const raw = `SOLUTION
## Given
The strip has $l = 0.1\\,\\mathrm{m}$ and $k = 0.5\\,\\mathrm{N\\,m^{-1}}$.

## Steps
1. The magnetic drag is $b = B^2 l^2 / R = 10^{-5}$.
$$
t = \\frac{2m}{b} = 10000\\,\\mathrm{s}
$$
2. The period stays $T = 2\\pi\\sqrt{m/k}$.

## Answer
$$
N \\approx 5000
$$`;

  const turn = parseAlakhTurn(raw);
  assert.equal(turn.kind, "solution");
  if (turn.kind !== "solution") return;
  assert.match(turn.markdown, /## Given/);
  assert.match(turn.markdown, /## Steps/);
  assert.match(turn.markdown, /N \\approx 5000/);
  assert.equal(turn.markdown.includes("SOLUTION"), false);
  assert.equal(turn.markdown.split("$$").length > 2, true);
});

test("a greeting stays chat bubbles", () => {
  const turn = parseAlakhTurn(
    '{"kind":"chat","messages":["Hello beta, kaise ho?","Padhai kaisi chal rahi hai?"]}',
  );
  assert.equal(turn.kind, "chat");
  if (turn.kind !== "chat") return;
  const joined = turn.messages.join(" ");
  assert.match(joined, /Hello beta/);
  assert.match(joined, /Padhai/);
});

test("equations inside chat JSON are sent as one solution", () => {
  const turn = parseAlakhTurn(
    '{"kind":"chat","messages":["Force is $F = ma$.","$$a = F/m$$"]}',
  );
  assert.equal(turn.kind, "solution");
  if (turn.kind !== "solution") return;
  assert.match(turn.markdown, /F = ma/);
  assert.match(turn.markdown, /a = F\/m/);
});

test("Telegram LaTeX is normalized", () => {
  const markdown = prepareSolutionMarkdown(
    String.raw`\[ E = mc^2 \] and \boxed{\frac{1}{2}} with \ce{H2SO4} and \(F = ma\).`,
  );
  assert.match(markdown, /\$\$\s*E = mc\^2\s*\$\$/);
  assert.match(markdown, /\\frac\{1\}\{2\}/);
  assert.equal(markdown.includes("\\boxed"), false);
  assert.match(markdown, /\\mathrm\{H_2SO_4\}/);
  assert.equal(markdown.includes("\\ce"), false);
  assert.match(markdown, /\$F = ma\$/);
});

test("a rich solution is one message with math enabled", () => {
  const body = alakhRichMessage(42, "SOLUTION\n$$\nE = mc^2\n$$");
  assert.equal(body.chat_id, 42);
  assert.equal(body.rich_message.skip_entity_detection, true);
  assert.match(body.rich_message.markdown, /E = mc\^2/);
  assert.equal(plainSolutionFallback("x".repeat(5000)).length <= 4096, true);
});
