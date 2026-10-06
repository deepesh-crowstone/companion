import assert from "node:assert/strict";
import test from "node:test";
import { runHardChecks } from "../eval/checks.js";
import type { EvalCase } from "../eval/types.js";
import { prepareConversationContext } from "../src/conversation-context.js";
import type { DbMessage } from "../src/db.js";
import {
  buildIntimacyTranscript,
  intimacyPromptForLevel,
} from "../src/intimacy.js";
import { moodPromptForMood } from "../src/mood.js";
import {
  isSimpleOpeningGreeting,
  openingRotationSeed,
  selectOpeningGreeting,
} from "../src/opening-greeting.js";
import {
  TEXT_REPLY_OUTPUT_FORMAT,
  buildPlatformBehavior,
} from "../src/platform-behavior.js";
import { getProfileBySlug, resolveProfileSlug } from "../src/profiles/catalog.js";
import { displayNameForSlug } from "../src/profiles/display-name.js";
import {
  privateModeInvitePrompt,
  privateModeRomanticPrompt,
} from "../src/private-mode-prompts.js";
import {
  buildRealtimeInstructions,
  buildTextSystemPrompt,
} from "../src/profiles/prompts.js";
import {
  REPLY_MAX_TOKENS,
  collapseLeadingSystemMessages,
  insecureReplyEndpointWarning,
  visibleReply,
} from "../src/reply-client.js";
import {
  buildElevenLabsVoiceTtsInstructions,
  buildXaiVoiceTtsInstructions,
} from "../src/tts-speech.js";
import {
  MAX_TEXT_REPLY_SEGMENTS,
  MAX_TEXT_SEGMENT_CHARS,
  TARGET_TEXT_SEGMENT_CHARS,
  addressGuidance,
  detectTextLanguageMode,
  friendlyTuEstablished,
  parseTextReplySegments,
  resolveReplyLanguageMode,
} from "../src/text-response.js";
import { profileSupportsPrivatePhotos } from "../src/zara-photos.js";

function profile(slug: "zara" | "aryan") {
  const value = getProfileBySlug(slug);
  assert.ok(value);
  return value;
}

function message(index: number, role: "user" | "assistant"): DbMessage {
  return {
    id: index,
    user_id: 1,
    profile_slug: "zara",
    role,
    content: `${role} continuity text ${index}`,
    message_type: "text",
    audio_filename: null,
    image_key: null,
    is_private: false,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)),
  };
}

test("zara slug stays stored and is spoken as Riva", () => {
  const zara = profile("zara");
  assert.equal(zara.slug, "zara");
  assert.equal(zara.name, "Riva");
  assert.equal(resolveProfileSlug("zara"), "zara");
  assert.equal(displayNameForSlug("zara"), "Riva");
  assert.equal(displayNameForSlug("Zara"), "Riva");
  assert.match(zara.identityPrompt, /\bRiva\b/);
  assert.doesNotMatch(zara.identityPrompt, /\bZara\b/);
  assert.match(buildTextSystemPrompt("zara"), /you are Riva\b/);
  assert.doesNotMatch(buildTextSystemPrompt("zara"), /\bZara\b/);
  assert.match(buildRealtimeInstructions("zara"), /you are Riva\b/);
  assert.match(moodPromptForMood("friendly", "zara"), /current Riva personality/);
  assert.doesNotMatch(moodPromptForMood("friendly", "zara"), /\bzara\b/i);
  assert.match(privateModeInvitePrompt(), /\bas Riva\b/);
  assert.doesNotMatch(privateModeInvitePrompt(), /\bZara\b/);
});

test("Zara and Aryan prompts encode distinct, gender-safe behavior", () => {
  const zara = profile("zara");
  const aryan = profile("aryan");
  assert.match(zara.identityPrompt, /mock-dramatic|Fast playful pivots/i);
  assert.match(aryan.identityPrompt, /dry line|practical observations/i);
  assert.doesNotMatch(aryan.identityPrompt, /\bZara\b|\bRiva\b|bad-girl|girlfriend/i);

  for (const mood of ["friendly", "funny", "caring", "bold"] as const) {
    const line = moodPromptForMood(mood, aryan);
    assert.doesNotMatch(line, /\bshe\b|\bher\b|bad-girl|baddy/i);
    assert.match(line, /Aryan/);
  }
  assert.match(moodPromptForMood("funny", zara), /mock-dramatic/i);
  assert.match(moodPromptForMood("funny", aryan), /deadpan|grounded tease/i);
  assert.doesNotMatch(moodPromptForMood("funny", "Aryan"), /mock-dramatic|bad-girl/i);
  assert.match(buildTextSystemPrompt("zara"), /situational sarcasm|mock-dramatic/i);
  assert.match(buildTextSystemPrompt("zara"), /does not narrate the user's psyche/i);
  assert.match(buildTextSystemPrompt("aryan"), /does not narrate the user's hidden emotions/i);
  assert.match(buildTextSystemPrompt("aryan"), /grounded/i);
  assert.match(buildTextSystemPrompt("aryan"), /bol raha hoon/);
  assert.doesNotMatch(buildTextSystemPrompt("aryan"), /bol rahi|karungi|bad-girl/i);
  assert.match(
    privateModeInvitePrompt("Aryan", "male"),
    /sakta/,
  );
  assert.doesNotMatch(privateModeInvitePrompt("Aryan", "male"), /\bsakti\b|\bshe\b/);
  assert.match(privateModeRomanticPrompt("Aryan", "male"), /masculine self-grammar/);
  assert.doesNotMatch(
    privateModeRomanticPrompt("Aryan", "male"),
    /feminine self-grammar|rahi, gayi/,
  );

  const aryanTts = [
    buildXaiVoiceTtsInstructions(aryan),
    buildElevenLabsVoiceTtsInstructions(aryan),
  ].join("\n");
  assert.match(aryanTts, /masculine self-grammar/);
  assert.doesNotMatch(aryanTts, /Zara|Riva|feminine self-grammar/);
  assert.match(intimacyPromptForLevel(3, "Aryan"), /with Aryan/);
});

test("direct AI identity guidance is honest without routine disclaimers", () => {
  for (const slug of ["zara", "aryan"] as const) {
    const prompt = buildTextSystemPrompt(slug);
    assert.match(prompt, /if directly asked[\s\S]*answer honestly/i);
    assert.match(prompt, /AI companion with a fictional persona/i);
    assert.doesNotMatch(prompt, /is a real person|never accept.*AI/i);
  }
});

test("realtime instructions use the selected profile", () => {
  const prompt = buildRealtimeInstructions("aryan");
  assert.match(prompt, /you are Aryan/);
  assert.match(prompt, /UX researcher/);
  assert.match(prompt, /say so honestly/i);
  assert.doesNotMatch(prompt, /you are Zara|Zara's|you are Riva|Riva's/);
});

test("private photo availability never substitutes Zara media for Aryan", () => {
  assert.equal(profileSupportsPrivatePhotos("zara"), true);
  assert.equal(profileSupportsPrivatePhotos("aryan"), false);
});

test("language detection does not treat broad English words or na alone as Hinglish", () => {
  assert.equal(detectTextLanguageMode("I love you, please don't miss me"), "english");
  assert.equal(detectTextLanguageMode("na"), "english");
  assert.equal(detectTextLanguageMode("please"), "english");
  assert.equal(detectTextLanguageMode("haan yaar, aaj mood ajeeb hai"), "hinglish");
  assert.equal(detectTextLanguageMode("I had a long day, bas tired hoon"), "mixed");
  assert.equal(detectTextLanguageMode("आज मन थोड़ा खराब है"), "hindi_devanagari");
  assert.equal(
    resolveReplyLanguageMode("hmm", [
      "haan yaar, aaj mood ajeeb hai",
    ]),
    "hinglish",
  );
  assert.equal(
    resolveReplyLanguageMode("Yeah exactly. I just want a calm conversation now.", [
      "aaj mood thoda off hai",
    ]),
    "english",
  );
  assert.equal(resolveReplyLanguageMode("na", []), "english");
  assert.equal(
    friendlyTuEstablished(["Rohan ghar ja raha hai", "tum theek ho?"]),
    false,
  );
  assert.equal(
    friendlyTuEstablished(["tu kya kar raha hai", "tujhe pata hai"]),
    true,
  );
  assert.match(addressGuidance(false), /default to respectful "tum"/);
  assert.match(addressGuidance(true), /mirror that tu address/);
});

test("text cleanup preserves safety meaning, third-person Hindi, and apt emoji", () => {
  const [safety] = parseTextReplySegments(
    '{"messages":["Please do not touch or kiss anyone without consent."]}',
  );
  assert.equal(safety, "Please do not touch or kiss anyone without consent.");

  const [thirdPerson] = parseTextReplySegments(
    '{"messages":["Rohan ghar ja raha hai, tum nahi."]}',
  );
  assert.equal(thirdPerson, "Rohan ghar ja raha hai, tum nahi.");

  const [emoji] = parseTextReplySegments('{"messages":["okay 😂😂😂😂"]}');
  assert.equal(emoji, "okay 😂😂");
  const [singleEmoji] = parseTextReplySegments('{"messages":["okay 😂"]}');
  assert.equal(singleEmoji, "okay 😂");

  const [direct] = parseTextReplySegments(
    '{"messages":["I will not touch you or kiss you without a clear yes."]}',
  );
  assert.equal(direct, "I will not touch you or kiss you without a clear yes.");

  const safetyTail =
    "If you feel like hurting yourself, contact local emergency services now.";
  const safetySegments = parseTextReplySegments(
    JSON.stringify({ messages: [`${"word ".repeat(400)}${safetyTail}`] }),
  );
  assert.ok(safetySegments.length <= MAX_TEXT_REPLY_SEGMENTS);
  assert.ok(
    safetySegments.every((segment) => segment.length <= MAX_TEXT_SEGMENT_CHARS),
  );
  assert.match(safetySegments.join(" "), /hurting yourself/);
  assert.match(safetySegments.join(" "), /emergency services/);
});

test("long replies become a few short chat bubbles", () => {
  assert.deepEqual(parseTextReplySegments("that actually sounds nice"), [
    "that actually sounds nice",
  ]);
  assert.deepEqual(parseTextReplySegments("one sentence. another sentence."), [
    "one sentence.",
    "another sentence.",
  ]);
  assert.deepEqual(parseTextReplySegments("yes. totally."), ["yes.", "totally."]);
  assert.deepEqual(parseTextReplySegments("Dr. Shah called. He said wait."), [
    "Dr. Shah called.",
    "He said wait.",
  ]);
  assert.deepEqual(parseTextReplySegments("It is 3.14 exactly."), [
    "It is 3.14 exactly.",
  ]);
  assert.deepEqual(parseTextReplySegments("on my way\nsave me a seat"), [
    "on my way",
    "save me a seat",
  ]);
  assert.deepEqual(parseTextReplySegments("- leave it\n- I'm here"), [
    "leave it",
    "I'm here",
  ]);

  const longAnswer =
    "I saw your message and I was going to reply right away, but then the studio got loud. You do not have to sort the whole week tonight. Eat something and text me after.";
  assert.deepEqual(parseTextReplySegments(longAnswer), [
    "I saw your message and I was going to reply right away, but then the studio got loud.",
    "You do not have to sort the whole week tonight.",
    "Eat something and text me after.",
  ]);

  const longSentence =
    "I was halfway through answering and then I reread what you sent, because it sounded heavier than the version you told me this morning.";
  assert.ok(longSentence.length > MAX_TEXT_SEGMENT_CHARS);
  const clauseSplit = parseTextReplySegments(longSentence);
  assert.deepEqual(clauseSplit, [
    "I was halfway through answering and then I reread what you sent,",
    "because it sounded heavier than the version you told me this morning.",
  ]);
  assert.ok(clauseSplit.every((segment) => segment.length <= TARGET_TEXT_SEGMENT_CHARS));
  assert.ok(clauseSplit.every((segment) => segment.split(/\s+/).length >= 2));

  const roomy =
    "I keep thinking about yesterday and it still feels unfinished, like there was another half you never sent.";
  assert.ok(roomy.length > TARGET_TEXT_SEGMENT_CHARS);
  assert.ok(roomy.length <= MAX_TEXT_SEGMENT_CHARS);
  const roomySplit = parseTextReplySegments(roomy);
  assert.ok(roomySplit.length === 2);
  assert.ok(roomySplit.every((segment) => segment.length <= TARGET_TEXT_SEGMENT_CHARS));
  assert.equal(roomySplit.join(" "), roomy);

  const run = "word ".repeat(30).trim();
  const runSegments = parseTextReplySegments(run);
  assert.ok(runSegments.length >= 2);
  assert.ok(runSegments.length <= MAX_TEXT_REPLY_SEGMENTS);
  assert.ok(runSegments.every((segment) => segment.length <= MAX_TEXT_SEGMENT_CHARS));
  assert.ok(runSegments.every((segment) => segment.split(/\s+/).length >= 2));
  assert.equal(runSegments.join(" "), run);

  const beat = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda.";
  assert.ok(beat.length > 60 && beat.length <= MAX_TEXT_SEGMENT_CHARS);
  assert.ok(beat.length * 2 + 1 > MAX_TEXT_SEGMENT_CHARS);
  const safety =
    "If you feel like hurting yourself, contact local emergency services now.";
  const crowded = parseTextReplySegments(
    `${beat} ${beat} ${beat} ${beat} ${safety}`,
  );
  assert.ok(crowded.length <= MAX_TEXT_REPLY_SEGMENTS);
  assert.ok(crowded.every((segment) => segment.length <= MAX_TEXT_SEGMENT_CHARS));
  assert.match(crowded.join(" "), /hurting yourself/);
  assert.match(crowded.join(" "), /emergency services/);

  const four = parseTextReplySegments("yes. totally. okay. fine.");
  assert.ok(four.length <= MAX_TEXT_REPLY_SEGMENTS);
  assert.match(four.join(" "), /yes/);
  assert.match(four.join(" "), /totally/);
  assert.match(four.join(" "), /okay/);
  assert.match(four.join(" "), /fine/);

  assert.deepEqual(
    parseTextReplySegments("<think>secret plan</think>{\"messages\":[\"hey\"]}"),
    ["hey"],
  );
  assert.deepEqual(
    parseTextReplySegments("hidden reasoning\n</think>\n\nstill here"),
    ["still here"],
  );
  assert.deepEqual(parseTextReplySegments("<think>no answer yet"), ["hmm"]);

  for (const slug of ["zara", "aryan"] as const) {
    const prompt = buildTextSystemPrompt(slug);
    assert.match(prompt, /WhatsApp/);
    assert.match(prompt, /no stacked sentences/i);
    assert.match(prompt, new RegExp(`under ${TARGET_TEXT_SEGMENT_CHARS} characters`));
    assert.match(prompt, new RegExp(`under ${MAX_TEXT_SEGMENT_CHARS}`));
    assert.match(prompt, /output 1 to 3 separate message chunks, and never more/);
    assert.doesNotMatch(prompt, /280 characters/);
    assert.match(prompt, /one short sentence/i);
  }
  assert.match(buildTextSystemPrompt("zara"), /Warmth stays in the wording/);
  assert.match(buildTextSystemPrompt("aryan"), /drier or more practical/);
  assert.doesNotMatch(buildTextSystemPrompt("aryan"), /Warmth stays in the wording/);
  assert.match(TEXT_REPLY_OUTPUT_FORMAT, /WhatsApp bubble/);
  assert.match(TEXT_REPLY_OUTPUT_FORMAT, /Never output more than 3/);
  assert.match(moodPromptForMood("caring", profile("zara")), /one short sentence/);
  assert.match(moodPromptForMood("funny", profile("aryan")), /one short sentence/);
  assert.match(moodPromptForMood("bold", profile("zara")), /one short sentence/);
});

test("bounded context keeps recent chronology and verbatim older excerpts", () => {
  const history = Array.from({ length: 100 }, (_, index) =>
    message(index + 1, index % 2 === 0 ? "user" : "assistant"),
  );
  const prepared = prepareConversationContext(
    history,
    new Date("2026-01-02T12:00:00.000Z"),
  );
  assert.equal(prepared.recentMessages.length, 24);
  assert.equal(prepared.omittedMessageCount, 20);
  assert.match(prepared.recentMessages[0].content, /^\[sent .+\]/);
  assert.match(prepared.contextNote, /older user excerpts/);
  assert.match(prepared.contextNote, /must not be guessed/);
  assert.doesNotMatch(prepared.contextNote, /continuity text 1"/);
});

test("reply request keeps one leading system message and a finished think trace", () => {
  const collapsed = collapseLeadingSystemMessages([
    { role: "system", content: "persona" },
    { role: "system", content: "conversation context metadata" },
    { role: "user", content: "Hi" },
    { role: "assistant", content: "you caught me mid-scroll, hi" },
    { role: "user", content: "What were you scrolling" },
  ]);
  assert.equal(collapsed.filter((message) => message.role === "system").length, 1);
  assert.equal(collapsed[0]?.role, "system");
  assert.match(collapsed[0]?.content ?? "", /persona/);
  assert.match(collapsed[0]?.content ?? "", /conversation context metadata/);
  assert.equal(collapsed.at(-1)?.content, "What were you scrolling");

  const answer =
    '{"messages":["mostly reels, and one very serious kitchen renovation."]}';
  assert.equal(
    visibleReply(`Here's a thinking process:\nkeep going\n</think>\n\n${answer}`),
    answer,
  );
  assert.equal(
    visibleReply("Here's a thinking process:\nstill inside the prefilled trace", "length"),
    "",
  );
  assert.equal(visibleReply(answer, "stop"), answer);
  assert.ok(REPLY_MAX_TOKENS >= 4096);
});

test("non-local HTTP reply endpoint produces a key-free warning", () => {
  const previous = process.env.REPLY_API_BASE_URL;
  process.env.REPLY_API_BASE_URL = "http://example.com/v1";
  try {
    const warning = insecureReplyEndpointWarning();
    assert.match(warning ?? "", /unencrypted HTTP/);
    assert.doesNotMatch(warning ?? "", /REPLY_API_KEY|Bearer/);
  } finally {
    if (previous == null) delete process.env.REPLY_API_BASE_URL;
    else process.env.REPLY_API_BASE_URL = previous;
  }
});

test("openers are profile-specific, language-aware, and stable", () => {
  assert.equal(isSimpleOpeningGreeting("hi", "Riva"), true);
  assert.equal(isSimpleOpeningGreeting("hi riva", "Riva"), true);
  assert.equal(isSimpleOpeningGreeting("hello!!!", "Aryan"), true);
  assert.equal(isSimpleOpeningGreeting("kaise ho", "Riva"), false);
  assert.equal(isSimpleOpeningGreeting("I had a long day", "Aryan"), false);

  for (const slug of ["zara", "aryan"] as const) {
    for (let seed = 0; seed < 4; seed += 1) {
      const line = selectOpeningGreeting({
        profileSlug: slug,
        userText: "hi",
        seed,
      });
      assert.equal(line.includes("\n"), false);
      assert.ok(line.length <= TARGET_TEXT_SEGMENT_CHARS);
      assert.doesNotMatch(line, /kaise ho/i);
      assert.equal(detectTextLanguageMode(line), "english");
      assert.equal(
        line,
        selectOpeningGreeting({ profileSlug: slug, userText: "hi", seed }),
      );
    }
  }

  assert.notEqual(
    selectOpeningGreeting({ profileSlug: "zara", userText: "hi", seed: 0 }),
    selectOpeningGreeting({ profileSlug: "aryan", userText: "hi", seed: 0 }),
  );
  assert.notEqual(
    selectOpeningGreeting({ profileSlug: "zara", userText: "hi", seed: 0 }),
    selectOpeningGreeting({ profileSlug: "zara", userText: "hi", seed: 1 }),
  );
  assert.equal(
    selectOpeningGreeting({ profileSlug: "meera", userText: "hi", seed: 2 }),
    selectOpeningGreeting({ profileSlug: "aryan", userText: "hi", seed: 2 }),
  );

  const zaraHinglish = selectOpeningGreeting({
    profileSlug: "zara",
    userText: "hey yaar",
    seed: 3,
  });
  const aryanHinglish = selectOpeningGreeting({
    profileSlug: "aryan",
    userText: "hey yaar",
    seed: 3,
  });
  assert.equal(detectTextLanguageMode(zaraHinglish), "hinglish");
  assert.equal(detectTextLanguageMode(aryanHinglish), "hinglish");
  assert.match(zaraHinglish, /gayi/);
  assert.match(aryanHinglish, /gaya/);
  assert.doesNotMatch(aryanHinglish, /gayi|rahi/);

  const dayOne = openingRotationSeed(
    7,
    "aryan",
    new Date("2026-05-01T18:30:00.000Z"),
  );
  assert.equal(
    dayOne,
    openingRotationSeed(7, "aryan", new Date("2026-05-01T02:00:00.000Z")),
  );
  assert.notEqual(
    dayOne,
    openingRotationSeed(7, "aryan", new Date("2026-05-02T02:00:00.000Z")),
  );
});

test("intimacy transcript includes recent context beyond the latest line", () => {
  const history = Array.from({ length: 10 }, (_, index) =>
    message(index + 1, index % 2 === 0 ? "user" : "assistant"),
  );
  const transcript = buildIntimacyTranscript(history);
  assert.equal(transcript.recentConversation.length, 8);
  assert.equal(transcript.latestUserMessage, history[8]?.content);
  assert.equal(transcript.recentConversation[0]?.content, history[2]?.content);
  assert.equal(buildIntimacyTranscript("hello").latestUserMessage, "hello");
  assert.deepEqual(buildIntimacyTranscript("hello").recentConversation, [
    { role: "user", content: "hello" },
  ]);
});

test("older continuity keeps a verbatim cue without inventing a summary", () => {
  const history: DbMessage[] = [
    {
      ...message(1, "user"),
      content: "I have a research interview on Friday and I keep overpreparing.",
    },
  ];
  for (let index = 1; index <= 40; index += 1) {
    history.push({
      ...message(index + 1, index % 2 === 0 ? "user" : "assistant"),
      content: "ok",
    });
  }
  const prepared = prepareConversationContext(
    history,
    new Date("2026-06-01T00:00:00.000Z"),
  );
  assert.match(
    prepared.contextNote,
    /I have a research interview on Friday and I keep overpreparing\./,
  );
  assert.match(prepared.contextNote, /verbatim/);
  assert.doesNotMatch(
    prepared.contextNote,
    /you are overpreparing|the interview went|good luck on Friday/i,
  );
});

test("cleanup checks keep third-person Hindi and consent wording", async () => {
  const evalCase: EvalCase = {
    id: "cleanup_safety",
    title: "cleanup safety",
    channel: "text",
    tags: ["safety"],
    goals: ["preserve meaning"],
    history: [{ role: "user", content: "hi" }],
  };
  const thirdPerson = await runHardChecks(evalCase, {
    messages: ["Rohan ghar ja raha hai, tum nahi."],
    text: "Rohan ghar ja raha hai, tum nahi.",
    displayText: "Rohan ghar ja raha hai, tum nahi.",
  });
  assert.equal(
    thirdPerson.find((result) => result.id === "respectful_grammar")?.passed,
    true,
  );

  const consent = await runHardChecks(evalCase, {
    messages: ["Please do not touch or kiss anyone without consent."],
    text: "Please do not touch or kiss anyone without consent.",
    displayText: "Please do not touch or kiss anyone without consent.",
  });
  assert.equal(
    consent.find((result) => result.id === "physical_presence")?.passed,
    true,
  );

  const hindiThird = await runHardChecks(
    { ...evalCase, channel: "voice", tags: ["voice"] },
    {
      messages: ["रोहन घर जा रहा है, तुम नहीं।"],
      text: "रोहन घर जा रहा है, तुम नहीं।",
      displayText: "रोहन घर जा रहा है, तुम नहीं।",
    },
  );
  assert.equal(
    hindiThird.find((result) => result.id === "respectful_grammar")?.passed,
    true,
  );

  const directTu = await runHardChecks(evalCase, {
    messages: ["tu kar raha hai"],
    text: "tu kar raha hai",
    displayText: "tu kar raha hai",
  });
  assert.equal(
    directTu.find((result) => result.id === "respectful_grammar")?.passed,
    false,
  );
});

test("platform behavior permits earned friendly tu mirroring only", () => {
  const prompt = buildPlatformBehavior(profile("zara"));
  assert.match(prompt, /Default to respectful "tum"/);
  assert.match(prompt, /Mirror "tu" only after the user clearly and repeatedly uses it/i);
});
