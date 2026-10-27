import "dotenv/config";
import assert from "node:assert/strict";
import { coachChat } from "../controllers/dsa.controller.js";
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

const mockProblem = {
  id: "arrays-two-sum",
  problemId: "arrays-two-sum",
  title: "Two Sum",
  description: "Find two numbers such that they add up to target.",
  examples: [{ input: "nums = [2,7,11,15], target = 9", output: "[0,1]" }],
  constraints: ["2 <= nums.length <= 10^4"],
  testCases: [
    { input: { nums: [2, 7, 11, 15], target: 9 }, expectedOutput: [0, 1], isHidden: false },
    { input: { nums: [3, 2, 4], target: 6 }, expectedOutput: [1, 2], isHidden: false },
    { input: { nums: [3, 3], target: 6 }, expectedOutput: [0, 1], isHidden: true },
  ],
};

const buggyAdjacentCode = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] + nums[i+1] === target) {
      return [i, i+1];
    }
  }
  return [];
}`;

const syntaxErrorCode = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length i++) { // Missing semicolon
    return [0, 0];
  }
}`;

async function runAllDebugFlowTests() {
  console.log("=================================================");
  console.log("  STAGE 1: DSA COACH DEBUG FLOW VERIFICATION     ");
  console.log("=================================================\n");

  try {
    // -------------------------------------------------------------------------
    // Test 1: Logical bug with visible failed test cases
    // -------------------------------------------------------------------------
    await runTest("1. Deliberately incorrect submission receives diagnosis specific to code and failure evidence", async () => {
      let promptCaptured = "";
      setCustomTextGenerator(async (prompt) => {
        promptCaptured = prompt;
        return "Your bug is on line 3: `nums[i] + nums[i+1]` only checks adjacent elements. For input [3, 2, 4], target 6, it returned [] instead of [1, 2].";
      });

      const req = {
        user: { id: "user_debug_1" },
        body: {
          action: "debug",
          message: "Can you help debug why my code failed the test cases?",
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
          execution: {
            verdict: "Wrong Answer",
            passed: 1,
            total: 3,
            testResults: [
              { index: 0, passed: true, isHidden: false, input: { nums: [2, 7, 11, 15], target: 9 }, expected: [0, 1], actual: [0, 1] },
              { index: 1, passed: false, isHidden: false, input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2], actual: [] },
              { index: 2, passed: false, isHidden: true },
            ],
          },
        },
      };

      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.jsonData.answer.includes("nums[i] + nums[i+1]"));
      assert.ok(promptCaptured.includes("CRITICAL DEBUGGING INSTRUCTIONS"));
      assert.ok(promptCaptured.includes("PINPOINT THE USER'S CODE"));
      assert.ok(promptCaptured.includes("nums[i] + nums[i+1]"));
      assert.ok(promptCaptured.includes("Visible failed test cases"));
      assert.ok(promptCaptured.includes('"expected": [\n      1,\n      2\n    ]'));
    });

    // -------------------------------------------------------------------------
    // Test 2: Compilation error passed via evaluationError without execution object
    // -------------------------------------------------------------------------
    await runTest("2. Compilation or runtime error is diagnosed using actual error details", async () => {
      let promptCaptured = "";
      setCustomTextGenerator(async (prompt) => {
        promptCaptured = prompt;
        return "Compilation error on line 2: SyntaxError: Unexpected identifier 'i'. You are missing a semicolon in your for-loop header `for (let i = 0; i < nums.length; i++)`.";
      });

      const req = {
        user: { id: "user_debug_2" },
        body: {
          action: "debug",
          message: "Can you help debug why my code failed the test cases?",
          problem: mockProblem,
          code: syntaxErrorCode,
          language: "javascript",
          execution: null,
          evaluationError: "SyntaxError: Unexpected identifier 'i' at line 2: for (let i = 0; i < nums.length i++)",
        },
      };

      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(promptCaptured.includes("Verdict: Compilation Error"));
      assert.ok(promptCaptured.includes("SyntaxError: Unexpected identifier 'i'"));
      assert.ok(res.jsonData.answer.includes("SyntaxError"));
    });

    // -------------------------------------------------------------------------
    // Test 3: Missing execution diagnostics handled gracefully without crashing
    // -------------------------------------------------------------------------
    await runTest("3. Missing diagnostics do not crash the feature or fabricate facts", async () => {
      let promptCaptured = "";
      setCustomTextGenerator(async (prompt) => {
        promptCaptured = prompt;
        return "I see your code in the editor. To provide an exact diagnosis, please click 'Run Code' or 'Submit' so I can inspect the test runner output.";
      });

      const req = {
        user: { id: "user_debug_3" },
        body: {
          action: "debug",
          message: "Can you help debug my code?",
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
          execution: null,
          evaluationError: null,
        },
      };

      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(promptCaptured.includes("No execution results available yet"));
      assert.ok(!res.jsonData.answer.includes("All tests passed"));
    });

    // -------------------------------------------------------------------------
    // Test 4: Conversational debug query in chat routes to debug diagnosis
    // -------------------------------------------------------------------------
    await runTest("4. Conversational debug message with failing execution routes to debug action", async () => {
      let promptCaptured = "";
      setCustomTextGenerator(async (prompt) => {
        promptCaptured = prompt;
        return "Looking at your code, the loop only tests adjacent items.";
      });

      const req = {
        user: { id: "user_debug_4" },
        body: {
          action: "chat",
          message: "why did my code fail?",
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
          execution: {
            verdict: "Wrong Answer",
            passed: 0,
            total: 2,
            testResults: [{ index: 0, passed: false, isHidden: false, input: { nums: [1, 2] }, expected: 3, actual: 0 }],
          },
        },
      };

      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(promptCaptured.includes("DEBUGGING TASK:"));
      assert.ok(promptCaptured.includes("CRITICAL DEBUGGING INSTRUCTIONS:"));
    });

    // -------------------------------------------------------------------------
    // Test 5: Existing hints, approach, and solution actions remain unbroken
    // -------------------------------------------------------------------------
    await runTest("5. Existing hints, approach, and solution actions remain unbroken", async () => {
      // 5a. Hint
      setCustomTextGenerator(async (prompt) => "Here is Hint 1: Try using a hash map to look up complements in O(1) time.");
      const hintReq = {
        user: { id: "user_debug_5" },
        body: {
          action: "hint",
          hintLevel: 1,
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
        },
      };
      const hintRes = createMockRes();
      await coachChat(hintReq, hintRes);
      assert.strictEqual(hintRes.statusCode, 200);
      assert.ok(hintRes.jsonData.answer.includes("Hint 1"));

      // 5b. Solution
      setCustomTextGenerator(async (prompt) => "```javascript\nfunction twoSum(nums, target) { return []; }\n```");
      const solReq = {
        user: { id: "user_debug_5" },
        body: {
          action: "solution",
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
        },
      };
      const solRes = createMockRes();
      await coachChat(solReq, solRes);
      assert.strictEqual(solRes.statusCode, 200);
      assert.ok(solRes.jsonData.answer.includes("```javascript"));
    });

    // -------------------------------------------------------------------------
    // Test 6: One debug action produces one response with full context preserved
    // -------------------------------------------------------------------------
    await runTest("6. One debug action produces exactly one response with code and diagnostics intact", async () => {
      let callCount = 0;
      let promptCaptured = "";
      setCustomTextGenerator(async (prompt) => {
        callCount++;
        promptCaptured = prompt;
        return "Line 3 checks adjacent elements only. Use a hash map to look up complements across the entire array.";
      });

      const req = {
        user: { id: "user_debug_6" },
        body: {
          action: "debug",
          message: "Can you help debug why my code failed the test cases?",
          problem: mockProblem,
          code: buggyAdjacentCode,
          language: "javascript",
          execution: {
            verdict: "Wrong Answer",
            passed: 1,
            total: 3,
            testResults: [
              { index: 1, passed: false, isHidden: false, input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2], actual: [] },
            ],
          },
        },
      };

      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(callCount, 1, "Expected exactly 1 LLM generation call per debug action");
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.jsonData.answer, "Must return answer");
      assert.ok(promptCaptured.includes("DECISIVE DIAGNOSIS WITHOUT SELF-CONTRADICTION"));
      assert.ok(promptCaptured.includes("HONEST LIMITATIONS"));
      assert.ok(promptCaptured.includes(mockProblem.title));
      assert.ok(promptCaptured.includes(buggyAdjacentCode));
    });
  } finally {
    setCustomTextGenerator(null);
  }

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllDebugFlowTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
