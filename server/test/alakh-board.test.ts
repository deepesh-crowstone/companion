import assert from "node:assert/strict";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import {
  BOARD_FRAMES,
  checkPicture,
  composeBoard,
  composeFrame,
  fitPicture,
  handSpacing,
  handwrittenMath,
  layoutBoard,
  layRows,
  lineChunks,
  lineTokens,
  markPath,
  parsePictureCheck,
  PICTURE_BOX,
  picturePrompt,
  prepareBoards,
  renderBoardMotion,
  splitEquation,
  withoutBlankIntros,
} from "../src/alakh-board.ts";
import {
  applyScriptReview,
  BOARD_LIMIT,
  BOARD_LINE_LIMIT,
  diagramFixRequest,
  equationsNotInSolution,
  parseBoardScript,
  parseDiagramFix,
  parseMark,
  parseScriptReview,
  plainDiagram,
  SCRIPT_REVIEW_PROMPT,
  scriptReviewRequest,
  vagueDiagram,
  type LessonBoard,
} from "../src/alakh-board-script.ts";
import { cameraFilter, cameraTimes, CAMERA_PUSH, solutionVideoUsesBoards } from "../src/alakh-video.ts";

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
  assert.match(request, /BOARD 1\nTitle: -\nPicture: a lens\nSay: Look at the lens\.\n1\. Line: \$f = \+20/);
  assert.match(request, /2\. Line: \$1\/v = 1\/f \+ 1\/u\$\n {3}Say: Rearranged\./);
  assert.match(request, /BOARD 2\nTitle: -\nPicture: -\n1\. Line: \$v = \+60/);
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

test("a board keeps at most five lines and a lesson keeps at most ten boards with the last one", () => {
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

const DIRECTED = `EXPLAIN
A lens problem.

BOARD
Title: Question
Picture: a convex lens on an axis, object u left of the lens, F marked on both sides
Say: Ek convex lens hai.
Line: Image kahan banegi?
Say: Hume image ki position chahiye.
BOARD
Title: Given
Picture: same
Line: $f = +20\\,\\text{cm}$
Show: circle F
Say: Focal length 20 hai.
Line: $u = -30\\,\\text{cm}$
Say: Object 30 cm left hai.
Show: underline 1
Say: Pehle f use karenge.
Show: underline 7
Say: Yeh line hai hi nahi.
BOARD
Title: Answer
Picture: -
Line: $v = +60\\,\\text{cm}$
Show: box
Say: Image 60 cm right banegi.
Show: circle F
Say: No picture here.`;

test("a directed script keeps titles, reuses the picture, and points at lines and labels", () => {
  const { boards } = parseBoardScript(DIRECTED);
  assert.deepEqual(
    boards.map((board) => board.title),
    ["Question", "Given", "Answer"],
  );
  assert.equal(boards[1]?.diagram, boards[0]?.diagram);
  assert.equal(boards[2]?.diagram, "");
  assert.deepEqual(
    boards[1]?.steps.map((step) => step.mark ?? null),
    [{ kind: "circle", label: "F" }, null, { kind: "underline", line: 0 }, null],
  );
  assert.deepEqual(boards[2]?.steps.map((step) => step.mark ?? null), [{ kind: "box", line: 0 }, null]);

  assert.deepEqual(parseMark("box 2", null), { kind: "box", line: 1 });
  assert.deepEqual(parseMark("underline line 3", 0), { kind: "underline", line: 2 });
  assert.deepEqual(parseMark('circle "2F"', null), { kind: "circle", label: "2F" });
  assert.equal(parseMark("box", null), null);
  assert.equal(parseMark("zoom on lens", 1), null);
});

test("a reviewed script keeps each mark on its line and drops a mark whose line is gone", () => {
  const { boards } = parseBoardScript(DIRECTED);
  const changes = parseScriptReview(`ADD 2.0
Line: Sign convention
Say: Pehle sign convention.`);
  const applied = applyScriptReview(boards, changes);
  assert.equal(applied[1]?.title, "Given");
  assert.deepEqual(applied[1]?.lines[0], "Sign convention");
  assert.deepEqual(applied[1]?.steps[3]?.mark, { kind: "underline", line: 1 });
  assert.deepEqual(applied[1]?.steps[1]?.mark, { kind: "circle", label: "F" });

  const dropped = applyScriptReview(boards, parseScriptReview("DROP 2.1"));
  assert.deepEqual(dropped[1]?.lines, ["$u = -30\\,\\text{cm}$"]);
  assert.equal(dropped[1]?.steps.some((step) => step.mark?.kind === "underline"), false);
});

test("plain mathematics is handwritten and the rest is typeset", () => {
  assert.equal(handwrittenMath("x \\ge 39"), "x ≥ 39");
  assert.equal(handwrittenMath("f = +20\\,\\text{cm}"), "f = +20 cm");
  assert.equal(handwrittenMath("x \\ge 63+76-100"), "x ≥ 63 + 76 - 100");
  assert.equal(handwrittenMath("3 \\times 10^2"), "3 × 10²");
  assert.equal(handwrittenMath("\\frac{1}{v}"), null);
  assert.equal(handwrittenMath("A \\cap B"), null);
  assert.equal(handwrittenMath("\\theta = 30^\\circ"), null);
  assert.equal(handSpacing("दूसरी तरफ, सभी लोग"), "दूसरी  तरफ, सभी  लोग");
  assert.equal(handSpacing("lens के पास"), "lens के पास");
  assert.deepEqual(lineTokens("Lower bound: $x \\ge 39$"), [{ kind: "text", text: "Lower bound: x ≥ 39" }]);
  assert.deepEqual(lineTokens("So $\\frac{1}{v} = \\frac{1}{60}$ hai"), [
    { kind: "text", text: "So " },
    { kind: "math", tex: "\\frac{1}{v} = \\frac{1}{60}" },
    { kind: "text", text: " hai" },
  ]);
});

const board = (lines: string[], diagram = "", title = "Working"): LessonBoard => ({
  title,
  diagram,
  lines,
  steps: lines.map((_line, index) => ({ narration: `say ${index}`, line: index })),
});

test("lines are laid top to bottom in their column and never overlap", async () => {
  const lines = ["Image kahan banegi?", "$\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}$", "$39 \\le x \\le 63$", "चुंबकीय अवमंदन"];
  for (const hasPicture of [false, true]) {
    const layout = await layoutBoard(board(lines), hasPicture);
    assert.equal(layout.lines.length, 4);
    const rows = layout.lines.flatMap((line) => line.rows);
    for (let index = 1; index < rows.length; index += 1) {
      const above = rows[index - 1]!;
      assert.ok(rows[index]!.y >= above.y + above.h, `row ${index} overlaps`);
    }
    const left = rows[0]!.x;
    assert.ok(hasPicture ? left > PICTURE_BOX.x + PICTURE_BOX.w : left > 96);
    assert.ok(rows.every((row) => row.x + row.w <= 1240));
    assert.ok(layout.title && layout.title.box.y + layout.title.box.h <= rows[0]!.y);
  }
});

test("a long line wraps after a comma or before a relation, and each row is written in turn", async () => {
  assert.deepEqual(splitEquation("n(A \\cup B) = n(A) + n(B) - n(A \\cap B) = 139 - x"), [
    "n(A \\cup B)",
    "= n(A) + n(B) - n(A \\cap B)",
    "= 139 - x",
  ]);
  assert.deepEqual(splitEquation("139 - x \\le 100 \\Rightarrow x \\ge 39"), ["139 - x \\le 100", "\\Rightarrow x \\ge 39"]);
  assert.deepEqual(splitEquation("\\left(\\frac{a=b}{c}\\right) = 2"), ["\\left(\\frac{a=b}{c}\\right)", "= 2"]);
  assert.deepEqual(
    lineChunks("Given: $u = -30$ cm").map((chunk) => (chunk.kind === "text" ? chunk.text : chunk.tex)),
    ["Given:", "u", "=", "-30", "cm"],
  );

  const givens = "$n(A) = 63\\%$, $n(B) = 76\\%$, $n(A \\cap B) = x$";
  const rows = await layRows(givens, 44, 628);
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((row) => row.width <= 628));
  assert.doesNotMatch(rows[1]!.markup, /^<text[^>]*>=/);

  const prepared = await composeBoard(board([givens], "a lens"), { image: picturePng(), labels: new Map() }, false);
  const [first, second] = prepared.lines[0]!;
  assert.ok(first && second);
  const half = composeFrame(prepared, { title: 1, picture: 1, lines: [first.w / (first.w + second.w)], marks: [] });
  assert.equal(inkCount(half, first), inkCount(prepared.final, first));
  assert.equal(inkCount(half, second), 0);
});

function inkCount(pixels: Buffer, box: { x: number; y: number; w: number; h: number }): number {
  let ink = 0;
  for (let y = Math.max(0, box.y); y < Math.min(720, box.y + box.h); y += 1) {
    for (let x = Math.max(0, box.x); x < Math.min(1280, box.x + box.w); x += 1) {
      const at = (y * 1280 + x) * 4;
      if (0.299 * pixels[at]! + 0.587 * pixels[at + 1]! + 0.114 * pixels[at + 2]! < 170) ink += 1;
    }
  }
  return ink;
}

const WHOLE = { x: 0, y: 0, w: 1280, h: 720 };

test("nothing of a line shows before it is written, including the bar under ≤ and ≥", async () => {
  const prepared = await composeBoard(board(["$x \\le 76$", "$x \\ge 63 + 76 - 100$", "$39 \\le x \\le 63$"]), null, false);
  const blank = composeFrame(prepared, { title: 0, picture: 0, lines: [0, 0, 0], marks: [] });
  assert.equal(inkCount(blank, WHOLE), 0);

  assert.ok(prepared.lines.every((rows) => rows.length === 1));
  const [line0, line1, line2] = prepared.lines.map((rows) => rows[0]!);
  const first = composeFrame(prepared, { title: 1, picture: 0, lines: [1, 0, 0], marks: [] });
  const titleInk = inkCount(prepared.final, prepared.title!);
  assert.ok(titleInk > 0);
  assert.equal(inkCount(first, WHOLE), titleInk + inkCount(prepared.final, line0!));
  assert.equal(inkCount(first, line1!), 0);
  assert.equal(inkCount(first, line2!), 0);

  const all = composeFrame(prepared, { title: 1, picture: 0, lines: [1, 1, 1], marks: [] });
  assert.equal(inkCount(all, WHOLE), inkCount(prepared.final, WHOLE));

  const half = composeFrame(prepared, { title: 1, picture: 0, lines: [1, 0.5, 0], marks: [] });
  const line = line1!;
  const leftHalf = { ...line, w: Math.floor(line.w * 0.4) };
  const rightEnd = { ...line, x: line.x + Math.ceil(line.w * 0.6), w: Math.ceil(line.w * 0.4) };
  assert.ok(inkCount(half, leftHalf) > 0);
  assert.equal(inkCount(half, rightEnd), 0);
});

function picturePng(): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#F6F5F0"/>
  <rect x="100" y="500" width="824" height="8" fill="#111111"/>
  <rect x="480" y="200" width="12" height="600" fill="#111111"/>
  <rect x="700" y="520" width="40" height="40" fill="#111111"/>
</svg>`;
  return new Resvg(svg, { background: "#FFFFFF", font: { loadSystemFonts: false } }).render().asPng();
}

test("the picture sits in its panel on white paper and its labels map onto the canvas", async () => {
  const fitted = fitPicture(picturePng());
  assert.deepEqual(fitted.place, { x: 0, y: 0, w: PICTURE_BOX.w, h: PICTURE_BOX.h });
  assert.deepEqual([...fitted.pixels.subarray(0, 3)], [255, 255, 255]);

  const labels = new Map([["f", [683, 507, 723, 547] as [number, number, number, number]]]);
  const prepared = await composeBoard(board(["$v = 60$"], "a lens"), { image: picturePng(), labels }, true);
  assert.ok(inkCount(prepared.final, PICTURE_BOX) > 1000);
  const label = prepared.labels.get("f");
  assert.ok(label);
  assert.ok(Math.abs(label.x - (PICTURE_BOX.x + 0.683 * PICTURE_BOX.w)) < 1);
  assert.ok(Math.abs(label.y - (PICTURE_BOX.y + 0.507 * PICTURE_BOX.h)) < 1);

  const start = composeFrame(prepared, { title: 1, picture: 0, lines: [0], marks: [] });
  const sketching = composeFrame(prepared, { title: 1, picture: 0.3, lines: [0], marks: [] });
  const drawn = composeFrame(prepared, { title: 1, picture: 1, lines: [0], marks: [] });
  assert.equal(inkCount(start, PICTURE_BOX), 0);
  assert.ok(inkCount(sketching, PICTURE_BOX) > 0);
  assert.ok(inkCount(sketching, PICTURE_BOX) < inkCount(drawn, PICTURE_BOX));
  assert.equal(inkCount(drawn, PICTURE_BOX), inkCount(prepared.final, PICTURE_BOX));

  const circled = composeFrame(prepared, {
    title: 1,
    picture: 1,
    lines: [0],
    marks: [{ mark: { kind: "circle", label: "F" }, progress: 1 }],
  });
  const ring = markPath({ kind: "circle", label: "F" }, prepared)![0]!;
  const [rx, ry] = ring[10]!;
  const at = (Math.round(ry) * 1280 + Math.round(rx)) * 4;
  assert.ok(circled[at]! > 180 && circled[at + 1]! < 120, "the circle is drawn in red");
  assert.equal(markPath({ kind: "circle", label: "2F" }, prepared), null);
});

test("every step has something new: the picture draws in, lines write, a box stays and an underline goes", async () => {
  const lesson: LessonBoard[] = [
    {
      title: "Given",
      diagram: "a lens",
      lines: ["$f = 20$", "$u = -30$"],
      steps: [
        { narration: "look", line: null },
        { narration: "f", line: 0 },
        { narration: "u", line: 1, mark: { kind: "box", line: 1 } },
        { narration: "back to f", line: null, mark: { kind: "underline", line: 0 } },
        { narration: "so", line: null },
      ],
    },
    { title: "Answer", diagram: "", lines: ["$v = 60$"], steps: [{ narration: "v", line: 0 }] },
  ];
  const labels = new Map<string, [number, number, number, number]>();
  const prepared = [
    await composeBoard(lesson[0]!, { image: picturePng(), labels }, true),
    await composeBoard(lesson[1]!, null, true),
  ];
  const motion = renderBoardMotion(prepared);
  assert.deepEqual(
    motion.sequences.map((frames) => frames.length),
    [BOARD_FRAMES, BOARD_FRAMES, BOARD_FRAMES, BOARD_FRAMES, 1, BOARD_FRAMES],
  );
  assert.deepEqual(motion.boards, [0, 0, 0, 0, 0, 1]);
  assert.deepEqual(motion.pauses, [0, 0, 0.8, 0, 0.35, 0.35]);
  assert.equal(motion.focus.length, 2);
  assert.ok(motion.focus.every((point) => point.x >= 0.3 && point.x <= 0.7 && point.y >= 0.3 && point.y <= 0.7));

  const decode = (png: Buffer) =>
    Buffer.from(
      new Resvg(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><image href="data:image/png;base64,${png.toString("base64")}" width="1280" height="720"/></svg>`,
        { font: { loadSystemFonts: false } },
      ).render().pixels,
    );
  const red = (pixels: Buffer) => {
    let count = 0;
    for (let at = 0; at < pixels.length; at += 4) if (pixels[at]! > 180 && pixels[at + 1]! < 140 && pixels[at + 2]! < 120) count += 1;
    return count;
  };
  const opening = decode(motion.sequences[0]![0]!);
  assert.equal(inkCount(opening, PICTURE_BOX), 0);
  assert.ok(inkCount(decode(motion.sequences[0]![BOARD_FRAMES - 1]!), PICTURE_BOX) > 1000);
  const boxed = red(decode(motion.sequences[2]![BOARD_FRAMES - 1]!));
  assert.ok(boxed > 200);
  const underlined = red(decode(motion.sequences[3]![BOARD_FRAMES - 1]!));
  assert.ok(underlined > boxed);
  assert.ok(Math.abs(red(decode(motion.sequences[4]![0]!)) - boxed) < 20);
});

test("a board without a picture speaks its introduction while the first line is written", async () => {
  const intro: LessonBoard = {
    title: "Lens formula",
    diagram: "a lens",
    lines: ["$1/v - 1/u = 1/f$", "$v = 60$"],
    steps: [
      { narration: "Ab formula lagate hain.", line: null },
      { narration: "Yeh lens formula hai.", line: 0 },
      { narration: "Isse v nikalta hai.", line: 1 },
    ],
  };
  const plain = await composeBoard(intro, null, true);
  const pictured = await composeBoard(intro, { image: picturePng(), labels: new Map() }, true);
  const { boards, groups } = withoutBlankIntros([pictured, plain]);
  assert.deepEqual(groups, [[0], [1], [2], [3, 4], [5]]);
  assert.equal(boards[0]?.board.steps.length, 3);
  assert.deepEqual(boards[1]?.board.steps, [
    { narration: "Ab formula lagate hain. Yeh lens formula hai.", line: 0 },
    { narration: "Isse v nikalta hai.", line: 1 },
  ]);
  assert.equal(plain.board.steps.length, 3);
});

test("the camera pushes in across one board and starts again on the next", () => {
  const times = cameraTimes([2, 3, 5, 4], [0, 0, 0, 1]);
  assert.deepEqual(times, [
    { start: 0, length: 10 },
    { start: 2, length: 10 },
    { start: 5, length: 10 },
    { start: 0, length: 4 },
  ]);
  const filter = cameraFilter(5, 10, { x: 0.6, y: 0.45 });
  assert.match(filter, new RegExp(`zoompan=z='${(1 + CAMERA_PUSH / 2).toFixed(5)}\\+`));
  assert.match(filter, /x='\(iw-iw\/zoom\)\*0\.600'/);
  assert.match(filter, /s=1280x720:fps=24/);
  const back = cameraFilter(0, 10, { x: 0.5, y: 0.5 }, true);
  assert.match(back, new RegExp(`zoompan=z='${(1 + CAMERA_PUSH).toFixed(5)}-`));
});

test("the picture prompt asks for labels only, and a redraw lists what was wrong", () => {
  const prompt = picturePrompt("a convex lens, F marked on both sides");
  assert.match(prompt, /Draw: a convex lens, F marked on both sides/);
  assert.match(prompt, /No equations, no sentences, no working, no answer/);
  assert.doesNotMatch(prompt, /earlier drawing/);
  assert.match(picturePrompt("a lens", ["F is on the wrong side"]), /Avoid them:\n- F is on the wrong side/);
});

test("the picture check reads a verdict and label boxes, and an unreadable reply is not a pass", () => {
  const ok = parsePictureCheck('{"ok": true, "labels": {"F": [100, 200, 140, 240], "2F": [10, 10, 5, 5], "u": "left"}}');
  assert.equal(ok.ok, true);
  assert.deepEqual([...ok.labels], [["f", [100, 200, 140, 240]]]);
  const wrong = parsePictureCheck('Result: {"ok": false, "problems": ["F is on the wrong side"]}');
  assert.deepEqual(wrong.problems, ["F is on the wrong side"]);
  for (const unreadable of ["looks fine", "", '{"problems": []}', "{ok: true"]) {
    const check = parsePictureCheck(unreadable);
    assert.equal(check.ok, false, unreadable);
    assert.equal(check.unknown, true, unreadable);
  }
});

function withReplies(reply: (body: Record<string, unknown>, url: string) => Response) {
  const previousKey = process.env.REPLY_API_KEY;
  const previousImageKey = process.env.OPENROUTER_API_KEY;
  process.env.REPLY_API_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-image-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => reply(JSON.parse(String(init?.body)), String(url))) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
    if (previousKey == null) delete process.env.REPLY_API_KEY;
    else process.env.REPLY_API_KEY = previousKey;
    if (previousImageKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousImageKey;
  };
}

const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });

test("a picture check thinks first, asks for the circled labels, and two reads without a verdict are not trusted", async () => {
  const bodies: Record<string, unknown>[] = [];
  const restore = withReplies((body) => {
    bodies.push(body);
    return json({ choices: [{ message: { content: "Looks fine to me." } }] });
  });
  try {
    const check = await checkPicture("a lens", picturePng(), "v = 60 cm", ["F", "2F"]);
    assert.equal(check.unknown, true);
    const thinking = bodies.map(
      (body) => (body.chat_template_kwargs as { enable_thinking?: boolean } | undefined)?.enable_thinking === true,
    );
    assert.deepEqual(thinking, [true, false]);
    assert.equal(bodies[0]?.max_tokens, 8192);
    const messages = bodies[0]?.messages as Array<{ role: string; content: unknown }>;
    const user = messages.find((message) => message.role === "user")?.content as Array<{ type: string; text?: string }>;
    assert.match(user[0]?.text ?? "", /Labels to find: F, 2F/);
    assert.equal(user[1]?.type, "image_url");
  } finally {
    restore();
  }
});

test("boards that say same share one drawing, and a picture still wrong after a redraw is left out", async () => {
  const image = picturePng().toString("base64");
  const prompts: string[] = [];
  let checks = 0;
  const restore = withReplies((body, url) => {
    if (url.includes("/images")) {
      prompts.push(String(body.prompt));
      assert.equal(body.aspect_ratio, "1:1");
      return json({ data: [{ b64_json: image }] });
    }
    checks += 1;
    const text = JSON.stringify(body.messages);
    if (text.includes("a ball")) return json({ choices: [{ message: { content: '{"ok": false, "problems": ["no ball"]}' } }] });
    return json({ choices: [{ message: { content: '{"ok": true, "labels": {"F": [683, 507, 723, 547]}}' } }] });
  });
  try {
    const lesson: LessonBoard[] = [
      { title: "Question", diagram: "a lens", lines: ["Where?"], steps: [{ narration: "look", line: null }, { narration: "where", line: 0 }] },
      {
        title: "Given",
        diagram: "a lens",
        lines: ["$f = 20$"],
        steps: [{ narration: "f", line: 0, mark: { kind: "circle", label: "F" } }],
      },
      { title: "Ball", diagram: "a ball", lines: ["$h = 5$"], steps: [{ narration: "h", line: 0 }] },
    ];
    const prepared = await prepareBoards(lesson, "v = 60 cm");
    assert.equal(prompts.filter((prompt) => prompt.includes("Draw: a lens")).length, 1);
    const ball = prompts.filter((prompt) => prompt.includes("Draw: a ball"));
    assert.equal(ball.length, 3);
    assert.match(ball[1] ?? "", /Avoid them:\n- no ball/);
    assert.doesNotMatch(ball[1] ?? "", /Write no labels/);
    assert.match(ball[2] ?? "", /Write no labels, letters, numbers or text of any kind/);
    assert.equal(checks, 4);
    assert.equal(prepared[0]?.pictureIsNew, true);
    assert.equal(prepared[1]?.pictureIsNew, false);
    assert.ok(prepared[1]?.labels.get("f"));
    assert.equal(prepared[2]?.picture, null);
    const row = prepared[2]?.lines[0]?.[0];
    assert.ok(row && Math.abs(row.x + row.w / 2 - 640) < 30, "a board without a picture writes in the middle");
  } finally {
    restore();
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
