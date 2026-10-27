import "dotenv/config";
import assert from "node:assert/strict";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";

import {
  isUnambiguousProblemRequest,
  createDsaProblem,
  coachChat,
} from "../controllers/dsa.controller.js";
import {
  executeCode,
} from "../services/codeExecution.service.js";
import {
  generateText,
  setCustomTextGenerator,
} from "../services/gemini.service.js";

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

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// Sample valid problem payload generator conforming to PrepAI schema
function createMockValidProblemPayload(title = "Two Sum Distinct", difficulty = "Easy") {
  return JSON.stringify({
    title,
    difficulty,
    topic: "Arrays",
    description: "Find two numbers in array that add up to target.",
    examples: [
      {
        input: "nums = [2, 7, 11, 15], target = 9",
        output: "[0, 1]",
        explanation: "nums[0] + nums[1] == 9",
      },
      {
        input: "nums = [3, 2, 4], target = 6",
        output: "[1, 2]",
        explanation: "nums[1] + nums[2] == 6",
      },
    ],
    constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"],
    boilerplates: {
      javascript: "function twoSum(nums, target) {\n  return [0, 1];\n}",
      python: "def twoSum(nums, target):\n    return [0, 1]",
      java: "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        return new int[]{0, 1};\n    }\n}",
      cpp: "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return {0, 1};\n    }\n};",
    },
    referenceSolution: {
      code: "function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const comp = target - nums[i];\n    if (map.has(comp)) return [map.get(comp), i];\n    map.set(nums[i], i);\n  }\n  return [];\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(n)",
    },
    testCases: [
      {
        input: { nums: [2, 7, 11, 15], target: 9 },
        expectedOutput: [0, 1],
        isHidden: false,
      },
      {
        input: { nums: [3, 2, 4], target: 6 },
        expectedOutput: [1, 2],
        isHidden: false,
      },
      {
        input: { nums: [3, 3], target: 6 },
        expectedOutput: [0, 1],
        isHidden: true,
      },
      {
        input: { nums: [1, 5, 8], target: 9 },
        expectedOutput: [0, 2],
        isHidden: true,
      },
    ],
  });
}

async function runAllGenerationReliabilityTests() {
  console.log("=================================================");
  console.log("  DSA PROBLEM GENERATION RELIABILITY REGRESSION  ");
  console.log("=================================================\n");

  // -------------------------------------------------------------------------
  // Finding 2: Unambiguous Problem Request Detection & Routing
  // -------------------------------------------------------------------------

  await runTest("Finding 2: isUnambiguousProblemRequest matches direct generation intents", () => {
    const directPhrases = [
      "give me a new problem",
      "another problem",
      "another problem, please",
      "next question",
      "next problem",
      "give me a problem",
      "give me another problem",
      "generate an easy array problem",
      "create a hard graph question",
      "load next problem",
      "new question",
    ];

    for (const phrase of directPhrases) {
      assert.strictEqual(
        isUnambiguousProblemRequest(phrase, "chat", false),
        true,
        `Expected phrase '${phrase}' to be recognized as direct problem request`
      );
    }
  });

  await runTest("Finding 2: isUnambiguousProblemRequest rejects conversational and coaching queries", () => {
    const nonDirectPhrases = [
      "Hi Pepe",
      "Hello, my name is Aman",
      "What is an array?",
      "Can you give me a hint for this problem?",
      "give me the solution to this question",
      "give me an approach to solve this",
      "explain this problem to me",
      "give me a clue for this test case",
      "debug my code for this question",
      "How do I prepare for DSA?",
    ];

    for (const phrase of nonDirectPhrases) {
      assert.strictEqual(
        isUnambiguousProblemRequest(phrase, "chat", false),
        false,
        `Expected phrase '${phrase}' NOT to be recognized as direct problem request`
      );
    }
  });

  await runTest("Finding 2: isUnambiguousProblemRequest rejects company catalog requests and non-chat actions", () => {
    assert.strictEqual(
      isUnambiguousProblemRequest("Amazon questions", "chat", true),
      false,
      "Company catalog request should not be treated as direct problem generation"
    );
    assert.strictEqual(
      isUnambiguousProblemRequest("give me a new problem", "hint", false),
      false,
      "Non-chat action should not be treated as direct problem generation"
    );
  });

  await runTest("Finding 2: coachChat routes unambiguous request directly without general conversational LLM call", async () => {
    const originalFetch = global.fetch;
    const origKey = process.env.ONLINECOMPILER_API_KEY;
    process.env.ONLINECOMPILER_API_KEY = "test_key";
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        exit_code: 0,
        output: `__PREPAI_START__${JSON.stringify([
          { actual: [0, 1] },
          { actual: [1, 2] },
          { actual: [0, 1] },
          { actual: [0, 2] },
        ])}__PREPAI_END__`,
      }),
    });

    const recordedCalls = [];
    setCustomTextGenerator(async (prompt, options) => {
      const stage = options?.stage || "unknown";
      recordedCalls.push({ stage, prompt: prompt.slice(0, 100) });

      if (stage === "problem_generation") {
        return createMockValidProblemPayload("Binary Search Pivot", "Easy");
      }
      if (stage === "problem_confirmation") {
        return "New original problem loaded: Binary Search Pivot!";
      }
      if (stage === "coach_chat") {
        return "I am Pepe, how can I help?";
      }
      return "Default response";
    });

    const req = {
      user: { id: "user_test_unambiguous" },
      body: {
        message: "give me a new problem",
        action: "chat",
      },
    };
    const res = createMockRes();

    try {
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.action, "load_problem");
      assert.strictEqual(res.body.problem.title, "Binary Search Pivot");

      // CRITICAL: Ensure NO "coach_chat" stage call occurred!
      const coachChatCalls = recordedCalls.filter((c) => c.stage === "coach_chat");
      assert.strictEqual(
        coachChatCalls.length,
        0,
        `Expected 0 coach_chat calls for direct request, but found ${coachChatCalls.length}`
      );

      // Verify problem_generation and problem_confirmation stages were called
      const generationCalls = recordedCalls.filter((c) => c.stage === "problem_generation");
      assert.strictEqual(generationCalls.length, 1, "Expected 1 problem_generation call");
    } finally {
      global.fetch = originalFetch;
      process.env.ONLINECOMPILER_API_KEY = origKey;
      setCustomTextGenerator(null);
    }
  });

  await runTest("Finding 2: coachChat preserves normal conversational flow for general chat", async () => {
    const recordedCalls = [];
    setCustomTextGenerator(async (prompt, options) => {
      const stage = options?.stage || "unknown";
      recordedCalls.push({ stage, prompt: prompt.slice(0, 100) });
      return "Hi there! I am Pepe, ready to practice DSA?";
    });

    const req = {
      user: { id: "user_test_conversation" },
      body: {
        message: "Hi Pepe",
        action: "chat",
      },
    };
    const res = createMockRes();

    await coachChat(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.action, "chat");

    const coachChatCalls = recordedCalls.filter((c) => c.stage === "coach_chat");
    assert.strictEqual(
      coachChatCalls.length,
      1,
      "Expected 1 coach_chat call for general conversation"
    );

    setCustomTextGenerator(null);
  });

  // -------------------------------------------------------------------------
  // Finding 3: Distinguish Evaluator / Provider Failure from Code Errors
  // -------------------------------------------------------------------------

  await runTest("Finding 3: Provider timeout in executeCode returns 'Provider Timeout' with isProviderFailure: true", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    const origKey = process.env.ONLINECOMPILER_API_KEY;
    process.env.ONLINECOMPILER_API_KEY = "test_key";

    try {
      const result = await executeCode({
        code: "function solution() { return 1; }",
        language: "javascript",
        testCases: [{ input: {}, expectedOutput: 1, isHidden: false }],
      });

      assert.strictEqual(result.verdict, "Provider Timeout");
      assert.strictEqual(result.isProviderFailure, true);
      assert.match(result.error, /compiler service did not respond within 15 seconds/i);
      assert.notStrictEqual(result.verdict, "Time Limit Exceeded");
    } finally {
      global.fetch = originalFetch;
      process.env.ONLINECOMPILER_API_KEY = origKey;
    }
  });

  await runTest("Finding 3: Provider HTTP 503 outage in executeCode returns 'Execution Unavailable' with isProviderFailure: true", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: "Service Unavailable" }),
    });

    const origKey = process.env.ONLINECOMPILER_API_KEY;
    process.env.ONLINECOMPILER_API_KEY = "test_key";

    try {
      const result = await executeCode({
        code: "function solution() { return 1; }",
        language: "javascript",
        testCases: [{ input: {}, expectedOutput: 1, isHidden: false }],
      });

      assert.strictEqual(result.verdict, "Execution Unavailable");
      assert.strictEqual(result.isProviderFailure, true);
      assert.match(result.error, /temporarily unavailable/i);
    } finally {
      global.fetch = originalFetch;
      process.env.ONLINECOMPILER_API_KEY = origKey;
    }
  });

  await runTest("Finding 3: Compiler provider failure does not block problem creation in restored generation flow", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    const origKey = process.env.ONLINECOMPILER_API_KEY;
    delete process.env.ONLINECOMPILER_API_KEY;

    setCustomTextGenerator(async () => {
      return createMockValidProblemPayload("Compiler Independent Problem", "Easy");
    });

    try {
      const result = await createDsaProblem({ topic: "Arrays", difficulty: "Easy" });
      assert.strictEqual(result.problem.title, "Compiler Independent Problem");
      assert.strictEqual(result.isFallback, false);
      assert.ok(Array.isArray(result.problem.testCases));
    } finally {
      global.fetch = originalFetch;
      process.env.ONLINECOMPILER_API_KEY = origKey;
      setCustomTextGenerator(null);
    }
  });

  // -------------------------------------------------------------------------
  // Finding 1: Structural Validation & Retry Behavior
  // -------------------------------------------------------------------------

  await runTest("Finding 1: Structural validation failure triggers retry on next attempt", async () => {
    let attemptCount = 0;

    setCustomTextGenerator(async (prompt, options) => {
      attemptCount++;
      if (attemptCount === 1) {
        // Attempt 1: Return malformed JSON or missing test cases
        return "Not valid JSON output from LLM";
      }
      // Attempt 2: Return structurally valid problem
      return createMockValidProblemPayload("Recovered Structurally Valid Problem", "Medium");
    });

    try {
      const result = await createDsaProblem({ topic: "Arrays", difficulty: "Medium" });
      assert.strictEqual(attemptCount, 2, "Expected exactly 2 attempts");
      assert.strictEqual(result.problem.title, "Recovered Structurally Valid Problem");
      assert.strictEqual(result.isFallback, false);
    } finally {
      setCustomTextGenerator(null);
    }
  });

  await runTest("Finding 1: Structurally invalid problem is rejected when all retries fail", async () => {
    let attemptCount = 0;

    setCustomTextGenerator(async () => {
      attemptCount++;
      // Return payload missing required boilerplates and test cases
      return JSON.stringify({
        title: `Invalid Payload ${attemptCount}`,
        description: "Incomplete description",
      });
    });

    try {
      let threw = false;
      try {
        await createDsaProblem({ topic: "Arrays", difficulty: "Easy", allowFallback: false });
      } catch (err) {
        threw = true;
        assert.match(err.message, /structural validation|invalid problem/i);
      }
      assert.strictEqual(threw, true, "createDsaProblem must throw when all retries fail structural validation");
      assert.strictEqual(attemptCount, 2, "Expected exactly 2 bounded attempts");
    } finally {
      setCustomTextGenerator(null);
    }
  });

  // -------------------------------------------------------------------------
  // Finding 4: Gemini Service Stage Logging & Error Metadata
  // -------------------------------------------------------------------------

  await runTest("Finding 4: Gemini service tracks stage and duration in error metadata", async () => {
    // Test transient failure retry and error metadata
    let attempts = 0;
    const loggedStages = [];

    // Capture console.warn to verify stage logging
    const origWarn = console.warn;
    console.warn = (...args) => {
      loggedStages.push(args.join(" "));
      origWarn(...args);
    };

    setCustomTextGenerator(async (prompt, options) => {
      attempts++;
      const err = new Error("503 Service Unavailable");
      err.status = 503;
      throw err;
    });

    try {
      let caughtErr = null;
      try {
        await generateText("Test prompt", { stage: "problem_generation" });
      } catch (err) {
        caughtErr = err;
      }

      assert.ok(caughtErr, "generateText must rethrow after retries are exhausted");
      assert.strictEqual(caughtErr.stage, "problem_generation", "Error must retain stage metadata");
      assert.ok(typeof caughtErr.durationMs === "number", "Error must retain durationMs metadata");
      assert.strictEqual(attempts, 2, "Expected bounded 2 attempts for 503 error");

      // Verify console warning logged the stage and duration
      const stageLog = loggedStages.find((l) => l.includes("problem_generation"));
      assert.ok(stageLog, "Expected console.warn to log stage 'problem_generation'");
    } finally {
      console.warn = origWarn;
      setCustomTextGenerator(null);
    }
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  COMPLETED: ${passedTests}/${totalTests} tests passed`);
  console.log("=================================================\n");

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runAllGenerationReliabilityTests().catch((err) => {
  console.error("Unhandled error running tests:", err);
  process.exit(1);
});
