import "dotenv/config";
import assert from "node:assert/strict";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";

import {
  createDsaProblem,
  coachChat,
  generateProblem,
} from "../controllers/dsa.controller.js";
import { setCustomTextGenerator } from "../services/gemini.service.js";

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

function createMockProblemPayload(title) {
  const funcName = "sampleTask";
  return JSON.stringify({
    title,
    description: `Complete problem statement for ${title}`,
    examples: [
      { input: "n = 1", output: "1", explanation: "Returns n" },
      { input: "n = 2", output: "2", explanation: "Returns n" },
    ],
    constraints: ["1 <= n <= 10^5"],
    boilerplates: {
      javascript: `function ${funcName}(n) {\n  return n;\n}`,
      python: `def ${funcName}(n):\n    return n`,
      java: `class Solution { public int ${funcName}(int n) { return n; } }`,
      cpp: `class Solution { public: int ${funcName}(int n) { return n; } };`,
    },
    referenceSolution: {
      language: "javascript",
      code: `function ${funcName}(n) {\n  return n;\n}`,
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
    },
    testCases: [
      { input: { n: 1 }, expectedOutput: 1, isHidden: false },
      { input: { n: 2 }, expectedOutput: 2, isHidden: false },
      { input: { n: 3 }, expectedOutput: 3, isHidden: true },
      { input: { n: 4 }, expectedOutput: 4, isHidden: true },
    ],
  });
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runAllTests() {
  console.log("=================================================");
  console.log("  PEPE DSA PROBLEM DEDUPLICATION & RETRY TESTS   ");
  console.log("=================================================");

  const savedCompilerKey = process.env.ONLINECOMPILER_API_KEY;
  process.env.ONLINECOMPILER_API_KEY = "test_mock_compiler_key";
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status: "success",
      exit_code: 0,
      output: `__PREPAI_START__${JSON.stringify([
        { actual: 1 },
        { actual: 2 },
        { actual: 3 },
        { actual: 4 },
      ])}__PREPAI_END__`,
    }),
  });

  try {

  // --- Suite 1: Intent Detection for Regeneration Requests ---
  console.log("\n--- Suite 1: Problem Regeneration Intent Detection ---");

  await runTest("Intent regex catches 'Another problem, please'", () => {
    const regex = /\b(?:generate|create|give me|load|another|next)\s+(?:a|an)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*[\w\s]*?(?:problem|question)\b/i;
    assert.equal(regex.test("Another problem, please"), true);
    assert.equal(regex.test("another problem"), true);
    assert.equal(regex.test("Another question please"), true);
  });

  await runTest("Intent regex catches 'Give me a new problem' and 'Give me a DSA problem'", () => {
    const regex = /\b(?:generate|create|give me|load|another|next)\s+(?:a|an)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*[\w\s]*?(?:problem|question)\b/i;
    assert.equal(regex.test("Give me a new problem"), true);
    assert.equal(regex.test("Give me a DSA problem"), true);
    assert.equal(regex.test("Give me an easy question"), true);
    assert.equal(regex.test("load a new problem"), true);
    assert.equal(regex.test("next problem"), true);
  });

  await runTest("Intent regex does NOT trigger for normal chat or hints", () => {
    const regex = /\b(?:generate|create|give me|load|another|next)\s+(?:a|an)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*[\w\s]*?(?:problem|question)\b/i;
    assert.equal(regex.test("Can you explain how Kadane works?"), false);
    assert.equal(regex.test("Give me a hint"), false);
    assert.equal(regex.test("What does this error mean?"), false);
  });

  // --- Suite 2: createDsaProblem Deduplication Logic ---
  console.log("\n--- Suite 2: createDsaProblem Deduplication Logic ---");

  await runTest("createDsaProblem rejects duplicate on attempt 1 and accepts distinct on attempt 2", async () => {
    let callCount = 0;
    setCustomTextGenerator(async (prompt) => {
      callCount++;
      if (callCount === 1) {
        // First attempt generates duplicate of current problem
        return createMockProblemPayload("Peak Segment Balance");
      }
      // Second attempt generates distinct new problem
      return createMockProblemPayload("Valley Crest Traversal");
    });

    try {
      const result = await createDsaProblem({
        topic: "Arrays",
        difficulty: "Medium",
        excludeTitle: "Peak Segment Balance",
      });

      assert.equal(callCount, 2, "Expected 2 attempts: attempt 1 rejected for duplicate, attempt 2 accepted");
      assert.equal(result.problem.title, "Valley Crest Traversal");
      assert.notEqual(result.problem.title, "Peak Segment Balance");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("createDsaProblem duplicate check is case-insensitive and trims whitespace", async () => {
    let callCount = 0;
    setCustomTextGenerator(async () => {
      callCount++;
      if (callCount === 1) {
        return createMockProblemPayload("  peak segment balance  ");
      }
      return createMockProblemPayload("Sliding Window Maximum");
    });

    try {
      const result = await createDsaProblem({
        topic: "Arrays",
        difficulty: "Medium",
        excludeTitle: "Peak Segment Balance",
      });

      assert.equal(callCount, 2);
      assert.equal(result.problem.title, "Sliding Window Maximum");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("createDsaProblem throws error when all attempts generate duplicate title", async () => {
    setCustomTextGenerator(async () => {
      return createMockProblemPayload("Peak Segment Balance");
    });

    try {
      let threw = false;
      try {
        await createDsaProblem({
          topic: "Arrays",
          difficulty: "Medium",
          excludeTitle: "Peak Segment Balance",
        });
      } catch (err) {
        threw = true;
        assert.match(err.message, /duplicate problem title/i);
      }
      assert.equal(threw, true, "Expected createDsaProblem to throw duplicate error");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("createDsaProblem prompt includes critical exclusion directive when excludeTitle provided", async () => {
    let recordedPrompt = "";
    setCustomTextGenerator(async (prompt) => {
      recordedPrompt = prompt;
      return createMockProblemPayload("Subarray Product Minimizer");
    });

    try {
      await createDsaProblem({
        topic: "Arrays",
        difficulty: "Medium",
        excludeTitle: "Peak Segment Balance",
      });

      assert.match(recordedPrompt, /CRITICAL DEDUPLICATION REQUIREMENT/);
      assert.match(recordedPrompt, /Do NOT generate, reproduce, or title this problem "Peak Segment Balance"/);
    } finally {
      setCustomTextGenerator(null);
    }
  });

  // --- Suite 3: coachChat Integration and Honest Failure Reporting ---
  console.log("\n--- Suite 3: coachChat Integration & Failure Handling ---");

  await runTest("coachChat passes current problem title as excludeTitle and returns new problem", async () => {
    setCustomTextGenerator(async (prompt) => {
      if (prompt.includes("You are Pepe, the DSA Coach") && prompt.includes("confirmation")) {
        return "I've loaded an original practice problem: 'Interval Matrix Sum' into your Arena!";
      }
      if (prompt.includes("Generate ONE original")) {
        return createMockProblemPayload("Interval Matrix Sum");
      }
      // General conversation response that emits tool call
      return "[TOOL_CALL:generate_problem]{\"topic\": \"Arrays\", \"difficulty\": \"Medium\"}[/TOOL_CALL]";
    });

    try {
      const req = {
        user: { id: "testuser123" },
        body: {
          action: "chat",
          message: "Give me a new problem",
          problem: {
            title: "Peak Segment Balance",
            description: "Old problem description",
          },
        },
      };
      const res = createMockRes();

      await coachChat(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.action, "load_problem");
      assert.equal(res.jsonData.problem.title, "Interval Matrix Sum");
      assert.notEqual(res.jsonData.problem.title, "Peak Segment Balance");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("coachChat handles 'Another problem, please' via fallback explicit intent", async () => {
    setCustomTextGenerator(async (prompt) => {
      if (prompt.includes("You are Pepe, the DSA Coach") && prompt.includes("confirmation")) {
        return "New problem loaded into Arena!";
      }
      if (prompt.includes("Generate ONE original")) {
        return createMockProblemPayload("Prefix Suffix Split");
      }
      // Model responded without emitting tool call tag
      return "Sure, let's practice another problem!";
    });

    try {
      const req = {
        user: { id: "testuser123" },
        body: {
          action: "chat",
          message: "Another problem, please",
          problem: {
            title: "Peak Segment Balance",
          },
        },
      };
      const res = createMockRes();

      await coachChat(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.action, "load_problem");
      assert.equal(res.jsonData.problem.title, "Prefix Suffix Split");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("coachChat on generation failure recovers with verified fallback or honest error and does NOT load previous problem", async () => {
    setCustomTextGenerator(async (prompt) => {
      if (prompt.includes("Generate ONE original")) {
        // Force all attempts to fail with duplicate
        return createMockProblemPayload("Peak Segment Balance");
      }
      return "[TOOL_CALL:generate_problem]{\"topic\": \"Arrays\", \"difficulty\": \"Medium\"}[/TOOL_CALL]";
    });

    try {
      const req = {
        user: { id: "testuser123" },
        body: {
          action: "chat",
          message: "Give me a new problem",
          problem: {
            title: "Peak Segment Balance",
          },
        },
      };
      const res = createMockRes();

      await coachChat(req, res);

      assert.equal(res.statusCode, 200);
      if (res.jsonData.action === "load_problem") {
        // Phase 5 Controlled recovery: MUST NOT load stale previous problem!
        assert.notEqual(res.jsonData.problem.title, "Peak Segment Balance");
        assert.equal(res.jsonData.isFallback, true);
      } else {
        assert.equal(res.jsonData.action, "chat");
        assert.equal(res.jsonData.problem, undefined);
        assert.match(res.jsonData.answer, /encountered an error/i);
        assert.match(res.jsonData.answer, /Please try asking again/i);
      }
    } finally {
      setCustomTextGenerator(null);
    }
  });

  // --- Suite 4: Structural Validation Gate Integrity ---
  console.log("\n--- Suite 4: Validation Gate Integrity ---");

  await runTest("Validation gate still rejects malformed generated problems without reference solution", async () => {
    setCustomTextGenerator(async () => {
      return JSON.stringify({
        title: "Incomplete Problem",
        description: "Missing boilerplates and reference solution",
      });
    });

    try {
      let threw = false;
      try {
        await createDsaProblem({
          topic: "Arrays",
          difficulty: "Medium",
          excludeTitle: "Peak Segment Balance",
        });
      } catch (err) {
        threw = true;
        assert.match(err.message, /failed structural validation|invalid problem/i);
      }
      assert.equal(threw, true);
    } finally {
      setCustomTextGenerator(null);
    }
  });

  } finally {
    global.fetch = origFetch;
    if (savedCompilerKey) {
      process.env.ONLINECOMPILER_API_KEY = savedCompilerKey;
    } else {
      delete process.env.ONLINECOMPILER_API_KEY;
    }
  }

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Unhandled error running tests:", err);
  process.exit(1);
});
