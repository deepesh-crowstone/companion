import assert from "node:assert/strict";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import {
  boardImagePrompt,
  checkBoard,
  findBoardLines,
  fitBoard,
  paperColour,
  parseBoardCheck,
  renderBoardFrame,
  renderBoardMotion,
  withoutDiagram,
  writtenBoard,
} from "../src/alakh-board.ts";
import {
  applyScriptReview,
  BOARD_LIMIT,
  BOARD_LINE_LIMIT,
  diagramFixRequest,
  equationsNotInSolution,
  parseBoardScript,
  parseDiagramFix,
  parseScriptReview,
  plainDiagram,
  SCRIPT_REVIEW_PROMPT,
  scriptReviewRequest,
  vagueDiagram,
} from "../src/alakh-board-script.ts";
import { solutionVideoUsesBoards } from "../src/alakh-video.ts";

const SCRIPT = `EXPLAIN
The strip hangs from a spring inside a field. Damping comes from the field.

BOARD
Diagram: a metal strip hanging from a spring, B shown as crosses into the page, l is an arrow along the length of the strip
Say: Dekho, strip spring se latki hai aur field andar ja raha hai.
Line: चुंबकीय अवमंदन
Say: Yeh damping field se aati hai.
Line: $b = \\frac{B^{2} l^{2}}{R}$
Say: Damping constant B square l square upon R hai.
BOARD
Diagram: -
Line: $A(t) = A_0 e^{-bt/2m}$
Say: Amplitude exponentially ghatta hai.`;

test("a board script keeps the picture, the lines, and what is said while each line is written", () => {
  const { explain, boards } = parseBoardScript(SCRIPT);
  assert.match(explain, /Damping comes from the field/);
  assert.equal(boards.length, 2);
  const first = boards[0];
  assert.ok(first);
  assert.match(first.diagram, /along the length of the strip/);
  assert.deepEqual(first.lines, ["चुंबकीय अवमंदन", "$b = \\frac{B^{2} l^{2}}{R}$"]);
  assert.deepEqual(
    first.steps.map((step) => step.line),
    [null, 0, 1],
  );
  assert.equal(boards[1]?.diagram, "");
  assert.deepEqual(boards[1]?.steps.map((step) => step.line), [0]);
});

const SOLUTION = String.raw`**दिया है:** $f = +20\,\text{cm}$, $u = -30\,\text{cm}$

$$\frac{1}{v} - \frac{1}{u} = \frac{1}{f}$$

$$\frac{1}{v} = \frac{1}{20} + \frac{1}{-30} = \frac{3 - 2}{60} = \frac{1}{60}$$

$$v = +60\,\text{cm}$$

$$m = \frac{v}{u} = \frac{60}{-30} = -2$$`;

test("a copied equation passes, and a rearrangement or a re-derived step does not", () => {
  assert.deepEqual(
    equationsNotInSolution(
      ["$f = +20\\,\\text{cm}$", "1/v - 1/u = 1/f", "Given: f = +20 cm, u = -30 cm", "m = 60 / -30", "m = -2", "चुंबकीय अवमंदन"],
      SOLUTION,
    ),
    [],
  );
  const invented = equationsNotInSolution(
    ["1/v = 1/f + 1/u", String.raw`$\frac{1}{v} = \frac{1}{20} - \frac{1}{-30}$`],
    SOLUTION,
  );
  assert.equal(invented.length, 2);
  assert.deepEqual(equationsNotInSolution(["Real and Inverted", "Size is 0.4 times object"], SOLUTION), ["0.4"]);
  assert.deepEqual(equationsNotInSolution(["m = v/u = -2", "1/v = 1/60"], SOLUTION), []);
  assert.deepEqual(equationsNotInSolution(["v = 1/60"], SOLUTION), ["v = 1/60"]);
  assert.deepEqual(equationsNotInSolution(["1/v = 1/6"], SOLUTION), ["1/v = 1/6", "6"]);

  const incline = String.raw`$$ma = mg\sin\theta$$

$$a = g\sin\theta = 10 \times \sin 30^\circ = 10 \times 0.5 = 5\,\text{m/s}^2$$`;
  assert.deepEqual(
    equationsNotInSolution(["ma = mg sin θ", "a = g sin θ", "a = 10 × sin 30°", "a = 5 m/s²"], incline),
    [],
  );
  assert.deepEqual(equationsNotInSolution(["a = g cos θ"], incline), ["a = g cos θ"]);
});

test("percent, inequality, and set signs count as the same step in either notation", () => {
  const sets = String.raw`$n(A) = 63\%$, $n(B) = 76\%$, $n(A \cap B) = x$

$$n(A \cup B) = n(A) + n(B) - n(A \cap B) = 139 - x$$

$$39 \leq x \leq 63$$`;
  assert.deepEqual(
    equationsNotInSolution(
      [
        "n(A) = 63",
        "n(A intersect B) = x",
        "n(A U B) = n(A) + n(B) - n(A intersect B)",
        "n(A union B) = 139 - x",
        "39 <= x <= 63",
        "x ≤ 63",
      ],
      sets,
    ),
    [],
  );
});

const REVIEW_SCRIPT = `BOARD
Diagram: a lens
Say: Look at the lens.
Line: $f = +20\\,\\text{cm}$
Say: Focal length is twenty.
Line: $1/v = 1/f + 1/u$
Say: Rearranged.
Line: $m = -2$
Say: Magnification is minus two.
BOARD
Diagram: -
Line: $v = +60\\,\\text{cm}$
Say: Image sixty centimetres away.`;

test("the script review lists every board and flags lines only as hints", () => {
  const { boards } = parseBoardScript(REVIEW_SCRIPT);
  const request = scriptReviewRequest(boards, SOLUTION, ["1/v = 1/f + 1/u", "1/v = 1/f + 1/u"]);
  assert.match(request, /BOARD 1\nDiagram: a lens\nSay: Look at the lens\.\n1\. Line: \$f = \+20/);
  assert.match(request, /2\. Line: \$1\/v = 1\/f \+ 1\/u\$\n {3}Say: Rearranged\./);
  assert.match(request, /BOARD 2\nDiagram: -\n1\. Line: \$v = \+60/);
  assert.match(request, /may be a different notation of a right step, or wrong:\n1\/v = 1\/f \+ 1\/u$/);
  assert.match(SCRIPT_REVIEW_PROMPT, /63 and 63%/);
});

test("an OK review keeps the script, and a fix, drop or add lands where it was asked", () => {
  const { boards } = parseBoardScript(REVIEW_SCRIPT);
  assert.deepEqual(parseScriptReview("OK"), []);
  assert.deepEqual(parseScriptReview("<think>checking</think>\nOK"), []);
  assert.deepEqual(applyScriptReview(boards, []), boards);

  const changes = parseScriptReview(`FIX 1.2
Line: $\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}$
Say: The lens formula.

DROP 1.3

ADD 2.1
Line: $m = \\frac{v}{u} = -2$
Say: Magnification is minus two.

ADD 2.0
Line: Image distance`);
  assert.deepEqual(
    changes.map((change) => [change.action, change.board, change.line]),
    [
      ["fix", 0, 1],
      ["drop", 0, 2],
      ["add", 1, 0],
      ["add", 1, -1],
    ],
  );
  const applied = applyScriptReview(boards, changes);
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[0]?.lines, ["$f = +20\\,\\text{cm}$", "$\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}$"]);
  assert.deepEqual(
    applied[0]?.steps.map((step) => [step.line, step.narration]),
    [
      [null, "Look at the lens."],
      [0, "Focal length is twenty."],
      [1, "The lens formula."],
    ],
  );
  assert.deepEqual(applied[1]?.lines, ["Image distance", "$v = +60\\,\\text{cm}$", "$m = \\frac{v}{u} = -2$"]);
  assert.equal(applied[1]?.steps[0]?.narration, "Image distance");
});

test("a fix to the speech keeps the line, and a board past five lines continues on the next", () => {
  const { boards } = parseBoardScript(REVIEW_SCRIPT);
  const spoken = applyScriptReview(boards, parseScriptReview("FIX 1.3\nSay: Magnification is minus two, so the image is inverted."));
  assert.equal(spoken[0]?.lines[2], "$m = -2$");
  assert.equal(spoken[0]?.steps[3]?.narration, "Magnification is minus two, so the image is inverted.");

  const adds = Array.from({ length: 4 }, (_, index) => `ADD 1.3\nLine: step ${index}\nSay: said ${index}`).join("\n");
  const grown = applyScriptReview(boards, parseScriptReview(adds));
  assert.equal(grown.length, 3);
  assert.equal(grown[0]?.lines.length, BOARD_LINE_LIMIT);
  assert.equal(grown[1]?.diagram, "a lens");
  assert.deepEqual(grown[1]?.lines, ["step 2", "step 3"]);
  assert.deepEqual(grown[1]?.steps.map((step) => step.line), [0, 1]);
  assert.deepEqual(grown[2]?.lines, ["$v = +60\\,\\text{cm}$"]);
});

test("diagrams that point at another board or are boxes of text are rewritten", () => {
  for (const vague of [
    "Same lens setup as before. A ray passes through F2.",
    "Same incline and block. An arrow points down the slope.",
    'Summary box. Text: "Image Distance: 60 cm"',
    "A simple equation block.",
    "A calculation block showing the substitution.",
    "The equation ma = mg sin θ is written clearly. An arrow shows m cancelling.",
  ]) {
    assert.equal(vagueDiagram(vague), true, vague);
  }
  for (const drawable of [
    "A convex lens at the centre of a horizontal axis; object 30 cm left, between F (20 cm) and 2F (40 cm).",
    "A square block on a 30 degree frictionless incline, mg straight down, N perpendicular to the slope.",
    "",
  ]) {
    assert.equal(vagueDiagram(drawable), false, drawable);
  }

  const boards = parseBoardScript(`BOARD
Diagram: a lens with the object 30 cm left
Line: $f = +20\\,\\text{cm}$
Say: Twenty.
BOARD
Diagram: Same lens setup.
Line: $v = +60\\,\\text{cm}$
Say: Sixty.`).boards;
  assert.match(diagramFixRequest(boards, [1], SOLUTION), /BOARD 1\nDiagram: Same lens setup\.\nLines: \$v = \+60/);
  assert.match(diagramFixRequest(boards, [1], SOLUTION), /Rewrite the Diagram of boards: 1$/);

  const fixed = parseDiagramFix(`BOARD 1
Diagram: A convex lens, image 60 cm right, beyond 2F, inverted.
BOARD 3
Diagram: -`);
  assert.equal(fixed.get(1), "A convex lens, image 60 cm right, beyond 2F, inverted.");
  assert.equal(fixed.get(3), "");
});

test("diagram labels lose their dollar signs and LaTeX", () => {
  assert.equal(
    plainDiagram(String.raw`Incline at angle $\theta = 30^\circ$; arrows $mg\sin\theta$ and $N$, mass $2\,\text{kg}$.`),
    "Incline at angle θ = 30°; arrows mg sin θ and N, mass 2 kg.",
  );
});

test("a board keeps at most five lines and a lesson keeps at most eight boards with the last one", () => {
  const lines = Array.from({ length: 7 }, (_, index) => `Line: step ${index}\nSay: say ${index}`).join("\n");
  const board = parseBoardScript(`BOARD\nDiagram: a ball\n${lines}`).boards[0];
  assert.equal(board?.lines.length, BOARD_LINE_LIMIT);
  assert.equal(board?.steps.length, 7);
  assert.equal(board?.steps[6]?.line, null);

  const many = Array.from({ length: 11 }, (_, index) => `BOARD\nLine: board ${index}\nSay: said ${index}`).join("\n");
  const boards = parseBoardScript(many).boards;
  assert.equal(boards.length, BOARD_LIMIT);
  assert.equal(boards[boards.length - 1]?.lines[0], "board 10");
});

test("the image prompt asks for exactly the scripted lines and keeps the diagram on the left", () => {
  const board = parseBoardScript(SCRIPT).boards[0];
  assert.ok(board);
  const prompt = boardImagePrompt(board);
  assert.match(prompt, /Left 40% of the board: a metal strip/);
  assert.match(prompt, /Line 1: चुंबकीय अवमंदन/);
  assert.match(prompt, /Line 2: \$b = \\frac/);
  assert.match(prompt, /Never write line numbers/);
  assert.match(prompt, /Never show dollar signs/);
  assert.match(prompt, /Write nothing else/);
});

test("the board check reads the vision reply, and an unreadable reply is not a pass", () => {
  assert.deepEqual(parseBoardCheck('{"ok": true}'), { ok: true, linesOk: true, problems: [] });
  assert.deepEqual(
    parseBoardCheck('Here: {"ok": false, "lines_ok": true, "problems": ["l marks the thickness, not the length"]}'),
    { ok: false, linesOk: true, problems: ["l marks the thickness, not the length"] },
  );
  assert.equal(parseBoardCheck('{"ok": false, "problems": ["line 2 has the wrong sign"]}').linesOk, false);
  for (const unreadable of ["looks fine", "", '{"problems": []}', "{ok: true"]) {
    const check = parseBoardCheck(unreadable);
    assert.equal(check.ok, false, unreadable);
    assert.equal(check.unknown, true, unreadable);
  }
});

test("a board check with no verdict on either read is not trusted", async () => {
  const previousKey = process.env.REPLY_API_KEY;
  process.env.REPLY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  const thinking: boolean[] = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { chat_template_kwargs?: { enable_thinking?: boolean } };
    thinking.push(body.chat_template_kwargs?.enable_thinking === true);
    return new Response(JSON.stringify({ choices: [{ message: { content: "The board looks fine to me." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const check = await checkBoard({ diagram: "", lines: ["$v = 60$"], steps: [] }, Buffer.from("x"), "v = 60");
    assert.equal(check.unknown, true);
    assert.deepEqual(thinking, [true, false]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.REPLY_API_KEY;
    else process.env.REPLY_API_KEY = previousKey;
  }
});

function boardPng(): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#FFFFFF"/>
  <rect x="80" y="120" width="360" height="12" fill="#000000"/>
  <rect x="250" y="40" width="6" height="500" fill="#000000"/>
  <rect x="640" y="60" width="420" height="40" fill="#000000"/>
  <rect x="660" y="160" width="300" height="30" fill="#000000"/>
  <rect x="660" y="196" width="320" height="4" fill="#000000"/>
  <rect x="700" y="206" width="200" height="30" fill="#000000"/>
  <rect x="640" y="300" width="380" height="40" fill="#000000"/>
</svg>`;
  return new Resvg(svg, { background: "#FFFFFF" }).render().asPng();
}

test("lines are found beside the diagram, and a fraction counts as one line", () => {
  const bands = findBoardLines(fitBoard(boardPng()), 3, true);
  assert.ok(bands);
  assert.equal(bands.length, 3);
  assert.ok(Math.abs((bands[0]?.top ?? 0) - 60) <= 2);
  assert.ok(Math.abs((bands[1]?.top ?? 0) - 160) <= 2);
  assert.ok(Math.abs((bands[1]?.bottom ?? 0) - 235) <= 2);
  assert.ok(Math.abs((bands[2]?.left ?? 0) - 640) <= 2);
  assert.equal(findBoardLines(fitBoard(boardPng()), 5, true), null);
});

function inkAt(png: Buffer, x: number, y: number): boolean {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="data:image/png;base64,${png.toString("base64")}" width="1280" height="720"/></svg>`;
  const pixels = new Resvg(svg).render().pixels;
  const at = (y * 1280 + x) * 4;
  return (pixels[at] ?? 255) < 128;
}

test("the diagram is on the board from the start and each line is wiped on in order", () => {
  const fitted = fitBoard(boardPng());
  const bands = findBoardLines(fitted, 3, true);
  assert.ok(bands);
  const prepared = {
    board: {
      diagram: "a stand",
      lines: ["a", "b", "c"],
      steps: [
        { narration: "look", line: null },
        { narration: "one", line: 0 },
        { narration: "two", line: 1 },
        { narration: "three", line: 2 },
      ],
    },
    pixels: fitted.pixels,
    paper: [255, 255, 255] as [number, number, number],
    bands,
  };
  const render = (written: number, progress: number) => renderBoardFrame(prepared, written, progress);

  const start = render(0, 0);
  assert.ok(inkAt(start, 252, 300));
  assert.ok(!inkAt(start, 700, 80));
  assert.ok(!inkAt(start, 700, 320));

  const half = render(0, 0.5);
  assert.ok(inkAt(half, 700, 80));
  assert.ok(!inkAt(half, 1040, 80));

  const later = render(2, 0);
  assert.ok(inkAt(later, 1040, 80));
  assert.ok(inkAt(later, 700, 220));
  assert.ok(!inkAt(later, 700, 320));

  const sequences = renderBoardMotion([prepared]);
  assert.deepEqual(
    sequences.map((frames) => frames.length),
    [1, 12, 12, 12],
  );
  assert.ok(inkAt(sequences[3]?.[11] ?? Buffer.alloc(0), 700, 320));
});

test("a wrong diagram is painted out while the writing stays", () => {
  const fitted = fitBoard(boardPng());
  const pixels = withoutDiagram(fitted);
  const at = (x: number, y: number) => pixels[(y * 1280 + x) * 4] ?? 255;
  assert.equal(at(252, 300), 255);
  assert.equal(at(200, 125), 255);
  assert.ok(at(700, 80) < 128);
  assert.ok(at(700, 320) < 128);
});

test("an off-white board is covered in its own paper colour", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="1280" height="720" fill="#FAFAF7"/>
  <rect x="640" y="60" width="420" height="40" fill="#000000"/>
</svg>`;
  const fitted = fitBoard(new Resvg(svg).render().asPng());
  assert.deepEqual(paperColour(fitted), [250, 250, 247]);
  const bands = findBoardLines(fitted, 1, false);
  assert.ok(bands);
  const frame = renderBoardFrame(
    { board: { diagram: "", lines: ["a"], steps: [] }, pixels: fitted.pixels, paper: paperColour(fitted), bands },
    0,
    0,
  );
  const decoded = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="data:image/png;base64,${frame.toString("base64")}" width="1280" height="720"/></svg>`,
  ).render().pixels;
  const at = (80 * 1280 + 700) * 4;
  assert.deepEqual([decoded[at], decoded[at + 1], decoded[at + 2]], [250, 250, 247]);
});

test("a board that cannot be trusted is written without a diagram, one band per line", async () => {
  const board = parseBoardScript(SCRIPT).boards[0];
  assert.ok(board);
  const prepared = await writtenBoard(board);
  assert.equal(prepared.bands.length, 2);
  assert.ok((prepared.bands[0]?.bottom ?? 0) < (prepared.bands[1]?.top ?? 0));
  assert.ok((prepared.bands[0]?.left ?? 0) < 120);
});

test("a board check asks Qwen to think before it accepts the drawing", async () => {
  const previousKey = process.env.REPLY_API_KEY;
  process.env.REPLY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let body: {
    max_tokens?: number;
    chat_template_kwargs?: { enable_thinking?: boolean };
    messages?: Array<{ role?: string; content?: string | Array<{ type?: string }> }>;
  } = {};
  globalThis.fetch = (async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok": false, "lines_ok": true, "problems": ["ray misses"]}' } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const board = { diagram: "a lens", lines: ["$v = 60$"], steps: [] };
    const check = await checkBoard(board, Buffer.from("not-a-png"), "v = 60 cm");
    assert.equal(check.ok, false);
    assert.equal(check.linesOk, true);
    assert.deepEqual(check.problems, ["ray misses"]);
    assert.equal(body.chat_template_kwargs?.enable_thinking, true);
    assert.equal(body.max_tokens, 8192);
    const system = body.messages?.find((message) => message.role === "system");
    assert.match(String(system?.content), /Never report a solution step that this script does not list/);
    const user = body.messages?.find((message) => message.role === "user");
    assert.equal(Array.isArray(user?.content), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.REPLY_API_KEY;
    else process.env.REPLY_API_KEY = previousKey;
  }
});

test("a board check retries without thinking when the first read fails", async () => {
  const previousKey = process.env.REPLY_API_KEY;
  process.env.REPLY_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  const thinking: boolean[] = [];
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      chat_template_kwargs?: { enable_thinking?: boolean };
    };
    thinking.push(body.chat_template_kwargs?.enable_thinking === true);
    if (thinking.length === 1) return new Response("busy", { status: 500 });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const board = { diagram: "a lens", lines: ["$v = 60$"], steps: [] };
    const check = await checkBoard(board, Buffer.from("not-a-png"), "v = 60 cm");
    assert.equal(check.ok, true);
    assert.deepEqual(thinking, [true, false]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.REPLY_API_KEY;
    else process.env.REPLY_API_KEY = previousKey;
  }
});

test("boards run only when the flag is 1", () => {
  const before = process.env.ALAKH_VIDEO_BOARD;
  delete process.env.ALAKH_VIDEO_BOARD;
  assert.equal(solutionVideoUsesBoards(), false);
  process.env.ALAKH_VIDEO_BOARD = "1";
  assert.equal(solutionVideoUsesBoards(), true);
  if (before === undefined) delete process.env.ALAKH_VIDEO_BOARD;
  else process.env.ALAKH_VIDEO_BOARD = before;
});
