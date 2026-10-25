import assert from 'node:assert/strict';
import { SpeechTranscriptAccumulator, processSpeechVoices } from '../client/src/utils/speechUtils.js';

console.log("=================================================");
console.log("  SPEECH UTILITIES & TRANSCRIPTION UNIT TESTS");
console.log("=================================================\n");

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(` [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(` [FAIL] ${name}`);
    console.error(err);
  }
}

// 1. Single phrase recognition
test("Single phrase recognition accumulates correctly", () => {
  const accumulator = new SpeechTranscriptAccumulator();
  const event1 = {
    results: [
      { 0: { transcript: "My name is Aman" }, isFinal: true, length: 1 }
    ]
  };
  event1.results.length = 1;

  const result = accumulator.handleResult(event1);
  assert.equal(result, "My name is Aman");
});

// 2. Pause and continuation bug test
test("Speech across pauses preserves earlier words without dropping (My name is Aman ... hello)", () => {
  const accumulator = new SpeechTranscriptAccumulator();

  // Event 1: user says "My name is Aman" (finalized)
  const event1 = {
    resultIndex: 0,
    results: [
      { 0: { transcript: "My name is Aman" }, isFinal: true }
    ]
  };
  accumulator.handleResult(event1);
  assert.equal(accumulator.getFullTranscript(), "My name is Aman");

  // User pauses for 2-3 seconds...
  // Event 2: user says "hello" (interim chunk at index 1, resultIndex is 1)
  const event2 = {
    resultIndex: 1,
    results: [
      { 0: { transcript: "My name is Aman" }, isFinal: true },
      { 0: { transcript: "hello" }, isFinal: false }
    ]
  };
  const res2 = accumulator.handleResult(event2);
  assert.equal(res2, "My name is Aman hello", "Earlier words must NOT disappear on pause!");

  // Event 3: user says " everyone" (still interim)
  const event3 = {
    resultIndex: 1,
    results: [
      { 0: { transcript: "My name is Aman" }, isFinal: true },
      { 0: { transcript: "hello everyone" }, isFinal: false }
    ]
  };
  const res3 = accumulator.handleResult(event3);
  assert.equal(res3, "My name is Aman hello everyone");

  // Event 4: user pauses and "hello everyone" is finalized
  const event4 = {
    resultIndex: 1,
    results: [
      { 0: { transcript: "My name is Aman" }, isFinal: true },
      { 0: { transcript: "hello everyone" }, isFinal: true }
    ]
  };
  const res4 = accumulator.handleResult(event4);
  assert.equal(res4, "My name is Aman hello everyone");
  assert.equal(accumulator.getFinalizedTranscript(), "My name is Aman hello everyone");
});

// 3. Pre-existing text preservation
test("Preserves pre-existing typed text when speech starts", () => {
  const accumulator = new SpeechTranscriptAccumulator("I would like to clarify:");
  const event = {
    results: [
      { 0: { transcript: "we use binary search for O(log N)" }, isFinal: true }
    ]
  };
  const res = accumulator.handleResult(event);
  assert.equal(res, "I would like to clarify: we use binary search for O(log N)");
});

// 4. Voice selection & Microsoft exclusion
test("Voice processing excludes all Microsoft voices and prioritizes Google UK English (en-GB)", () => {
  const mockVoices = [
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
    { name: "Google US English", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Google UK English Male", lang: "en-GB" },
    { name: "Alex", lang: "en-US" },
    { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" },
    { name: "Google UK English Female", lang: "en-GB" } // Duplicate test
  ];

  const { sortedVoices, defaultVoiceName } = processSpeechVoices(mockVoices);

  // Must not include Microsoft voices
  const hasMicrosoft = sortedVoices.some(v => /microsoft|desktop/i.test(v.name));
  assert.equal(hasMicrosoft, false, "Microsoft voices must be excluded");

  // Must not have duplicates
  const names = sortedVoices.map(v => v.name);
  const uniqueNames = new Set(names);
  assert.equal(names.length, uniqueNames.size, "Duplicate voices must be removed");

  // Google UK English voices must be at top, preferring Male by default
  assert.match(sortedVoices[0].name, /Google UK English/i);
  assert.equal(defaultVoiceName, "Google UK English Male");
});

// 5. Preserves user manual voice selection
test("Preserves user manual voice selection if valid", () => {
  const mockVoices = [
    { name: "Google US English", lang: "en-US" },
    { name: "Google UK English Female", lang: "en-GB" }
  ];

  const { defaultVoiceName } = processSpeechVoices(mockVoices, "Google US English");
  assert.equal(defaultVoiceName, "Google US English");
});

// 6. Graceful fallback when Google UK voice is absent
test("Falls back to another Google voice or English voice when Google UK is absent", () => {
  const mockVoices = [
    { name: "Samantha", lang: "en-US" },
    { name: "Google US English", lang: "en-US" }
  ];

  const { defaultVoiceName } = processSpeechVoices(mockVoices);
  assert.equal(defaultVoiceName, "Google US English");
});

console.log("\n-------------------------------------------------");
console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
console.log("-------------------------------------------------");

if (passed !== total) process.exit(1);
