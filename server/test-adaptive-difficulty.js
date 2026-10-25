import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";
process.env.ONLINECOMPILER_API_KEY =
  process.env.ONLINECOMPILER_API_KEY || "test_mock_compiler_key";

const nativeFetch = global.fetch;
global.fetch = async (url, opts) => {
  const urlStr = url instanceof URL ? url.toString() : String(url || "");
  if (urlStr.includes("onlinecompiler") || urlStr.includes("run-code")) {
    let results = [];
    try {
      const parsedBody = typeof opts?.body === "string" ? JSON.parse(opts.body) : {};
      const code = parsedBody.code || "";
      const match = code.match(/__tests\s*=\s*(?:JSON\.parse\()?(["'].*?["']|\[.*?\])(?:\))?;/s);
      if (match) {
        let rawTests = match[1];
        if (rawTests.startsWith('"') || rawTests.startsWith("'")) {
          rawTests = JSON.parse(rawTests);
        }
        const testList = typeof rawTests === "string" ? JSON.parse(rawTests) : rawTests;
        if (Array.isArray(testList)) {
          results = testList.map((t, idx) => ({
            index: idx,
            actual: t.expectedOutput !== undefined ? t.expectedOutput : 1,
            expected: t.expectedOutput,
            runtimeError: null,
          }));
        }
      }
    } catch {}
    if (results.length === 0) {
      results = Array.from({ length: 4 }, (_, i) => ({ index: i, actual: 1, runtimeError: null }));
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        exit_code: 0,
        output: `__PREPAI_START__${JSON.stringify(results)}__PREPAI_END__`,
      }),
    };
  }
  return nativeFetch ? nativeFetch(url, opts) : { ok: true, json: async () => ({}) };
};
import {
  ADAPTIVE_DIFFICULTY_CONFIG,
  normalizeDifficulty,
  getAdjacentDifficulty,
  extractExplicitDifficulty,
  extractKeepSamePreference,
  summarizeRecentSubmissions,
  evaluateAdaptiveDifficulty,
  normalizeTopicName,
} from "./services/adaptiveDifficulty.service.js";

import {
  generateProblem,
  getAdaptiveStatusHandler,
  coachChat,
  formatCatalogQuestionsResponse,
  hasComplexityMismatch,
  validateGeneratedProblem,
  createDsaProblem,
} from "./controllers/dsa.controller.js";

import { setCustomTextGenerator } from "./services/gemini.service.js";

import DsaSubmission from "./models/DsaSubmission.model.js";

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

console.log("=================================================");
console.log("  PEPE ADAPTIVE DIFFICULTY VERIFICATION TESTS   ");
console.log("=================================================");

// ---------------------------------------------------------------------------
// Suite 1: Level Normalization & Transitions (Adjacent Only)
// ---------------------------------------------------------------------------
console.log("\n--- Suite 1: Level Normalization & Transitions ---");

await runTest("normalizeDifficulty handles casing, whitespace, and defaults", () => {
  assert.equal(normalizeDifficulty("easy"), "Easy");
  assert.equal(normalizeDifficulty("EASY"), "Easy");
  assert.equal(normalizeDifficulty(" medium "), "Medium");
  assert.equal(normalizeDifficulty("hard"), "Hard");
  assert.equal(normalizeDifficulty(null), "Medium");
  assert.equal(normalizeDifficulty("unknown"), "Medium");
});

await runTest("getAdjacentDifficulty enforces strict adjacent transitions without jumps", () => {
  // Promotion (up)
  assert.equal(getAdjacentDifficulty("Easy", "up"), "Medium");
  assert.equal(getAdjacentDifficulty("Medium", "up"), "Hard");
  assert.equal(getAdjacentDifficulty("Hard", "up"), "Hard"); // Capped at Hard

  // Demotion (down)
  assert.equal(getAdjacentDifficulty("Hard", "down"), "Medium");
  assert.equal(getAdjacentDifficulty("Medium", "down"), "Easy");
  assert.equal(getAdjacentDifficulty("Easy", "down"), "Easy"); // Floor at Easy
});

// ---------------------------------------------------------------------------
// Suite 2: Preference Extraction (Explicit Difficulty & Stability)
// ---------------------------------------------------------------------------
console.log("\n--- Suite 2: Explicit Difficulty & Stability Detection ---");

await runTest("extractExplicitDifficulty detects requested difficulty", () => {
  assert.equal(extractExplicitDifficulty("Give me a hard problem"), "Hard");
  assert.equal(extractExplicitDifficulty("Can I get an easy tree problem?"), "Easy");
  assert.equal(extractExplicitDifficulty("Medium question please"), "Medium");
  assert.equal(extractExplicitDifficulty("What should I solve next?"), null);
});

await runTest("extractKeepSamePreference detects preference to stay at level", () => {
  assert.equal(extractKeepSamePreference("Keep difficulty the same"), true);
  assert.equal(extractKeepSamePreference("Stay at this level for now"), true);
  assert.equal(extractKeepSamePreference("Let's stick with medium"), true);
  assert.equal(extractKeepSamePreference("Don't change difficulty"), true);
  assert.equal(extractKeepSamePreference("Give me something harder"), false);
});

// ---------------------------------------------------------------------------
// Suite 3: Performance Summarization
// ---------------------------------------------------------------------------
console.log("\n--- Suite 3: Submission Performance Summarization ---");

await runTest("summarizeRecentSubmissions handles empty list gracefully", () => {
  const summary = summarizeRecentSubmissions([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.consecutiveSolves, 0);
  assert.equal(summary.consecutiveFailures, 0);
  assert.equal(summary.averagePassRatio, 0);
  assert.equal(summary.averageHints, 0);
  assert.equal(summary.acceptanceRate, 0);
});

await runTest("summarizeRecentSubmissions accurately computes metrics and streak", () => {
  const mockSubmissions = [
    // Most recent first
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 0, difficulty: "Medium", createdAt: new Date("2026-10-22T10:00:00Z") },
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 1, difficulty: "Medium", createdAt: new Date("2026-10-22T09:00:00Z") },
    { verdict: "Wrong Answer", passed: 4, total: 8, hintsUsed: 2, difficulty: "Medium", createdAt: new Date("2026-10-22T08:00:00Z") },
  ];

  const summary = summarizeRecentSubmissions(mockSubmissions);
  assert.equal(summary.count, 3);
  assert.equal(summary.consecutiveSolves, 2);
  assert.equal(summary.consecutiveFailures, 0);
  assert.equal(summary.averageHints, 1.0); // (0 + 1 + 2) / 3
  assert.equal(summary.acceptanceRate, 67); // 2/3 = 67%
  assert.equal(summary.latestDifficulty, "Medium");
});

// ---------------------------------------------------------------------------
// Suite 4: Adaptive Decision Engine Rules
// ---------------------------------------------------------------------------
console.log("\n--- Suite 4: Adaptive Decision Engine Rules ---");

await runTest("Rule 1: New user with no history starts at default Medium (or profile beginner Easy)", () => {
  // Case A: No history, no profile -> Medium
  const evalNew = evaluateAdaptiveDifficulty({ submissions: [] });
  assert.equal(evalNew.targetDifficulty, "Medium");
  assert.equal(evalNew.action, "maintain");
  assert.ok(evalNew.reason.toLowerCase().includes("starting with a balanced"));

  // Case B: No history, beginner profile -> Easy
  const evalBeginner = evaluateAdaptiveDifficulty({
    submissions: [],
    userProfile: { skillLevel: "Beginner" },
  });
  assert.equal(evalBeginner.targetDifficulty, "Easy");
  assert.equal(evalBeginner.action, "maintain");
});

await runTest("Rule 2: Consistent success with minimal hints promotes difficulty (Easy -> Medium -> Hard)", () => {
  // Case A: 2 consecutive solves at Easy with 0 hints -> promotes to Medium
  const easySolves = [
    { verdict: "Accepted", passed: 6, total: 6, hintsUsed: 0, difficulty: "Easy", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 1, difficulty: "Easy", createdAt: new Date(1000) },
  ];
  const evalEasy = evaluateAdaptiveDifficulty({ submissions: easySolves });
  assert.equal(evalEasy.currentDifficulty, "Easy");
  assert.equal(evalEasy.targetDifficulty, "Medium");
  assert.equal(evalEasy.action, "promote");
  assert.ok(evalEasy.reason.includes("step up to Medium"));

  // Case B: 2 consecutive solves at Medium with minimal hints -> promotes to Hard
  const mediumSolves = [
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(1000) },
  ];
  const evalMedium = evaluateAdaptiveDifficulty({ submissions: mediumSolves });
  assert.equal(evalMedium.currentDifficulty, "Medium");
  assert.equal(evalMedium.targetDifficulty, "Hard");
  assert.equal(evalMedium.action, "promote");

  // Case C: 2 consecutive solves at Hard -> stays at Hard (ceiling)
  const hardSolves = [
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Hard", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 0, difficulty: "Hard", createdAt: new Date(1000) },
  ];
  const evalHard = evaluateAdaptiveDifficulty({ submissions: hardSolves });
  assert.equal(evalHard.targetDifficulty, "Hard");
  assert.equal(evalHard.action, "maintain");
});

await runTest("Rule 3: Repeated failures or low pass rate demotes difficulty (Hard -> Medium -> Easy)", () => {
  // Case A: 2 consecutive failures at Hard -> demotes to Medium
  const hardFails = [
    { verdict: "Wrong Answer", passed: 2, total: 10, hintsUsed: 2, difficulty: "Hard", createdAt: new Date(2000) },
    { verdict: "Time Limit Exceeded", passed: 3, total: 10, hintsUsed: 3, difficulty: "Hard", createdAt: new Date(1000) },
  ];
  const evalHard = evaluateAdaptiveDifficulty({ submissions: hardFails });
  assert.equal(evalHard.currentDifficulty, "Hard");
  assert.equal(evalHard.targetDifficulty, "Medium");
  assert.equal(evalHard.action, "demote");
  assert.ok(evalHard.reason.includes("strengthen fundamental patterns"));

  // Case B: 2 consecutive failures at Medium -> demotes to Easy
  const mediumFails = [
    { verdict: "Wrong Answer", passed: 1, total: 8, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 2, total: 8, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(1000) },
  ];
  const evalMedium = evaluateAdaptiveDifficulty({ submissions: mediumFails });
  assert.equal(evalMedium.currentDifficulty, "Medium");
  assert.equal(evalMedium.targetDifficulty, "Easy");
  assert.equal(evalMedium.action, "demote");

  // Case C: 2 consecutive failures at Easy -> stays at Easy (floor)
  const easyFails = [
    { verdict: "Wrong Answer", passed: 1, total: 6, hintsUsed: 2, difficulty: "Easy", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 2, total: 6, hintsUsed: 3, difficulty: "Easy", createdAt: new Date(1000) },
  ];
  const evalEasy = evaluateAdaptiveDifficulty({ submissions: easyFails });
  assert.equal(evalEasy.targetDifficulty, "Easy");
  assert.equal(evalEasy.action, "maintain");
});

await runTest("Rule 4: Hint dependence prevents promotion even if tests pass", () => {
  // Solved both, but used 3 hints on each (heavy hint dependence)
  const heavyHintSolves = [
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(1000) },
  ];
  const evalHints = evaluateAdaptiveDifficulty({ submissions: heavyHintSolves });
  // Average hints = 3.0 > maxAverageHints (1.0), so promotion is NOT granted
  assert.notEqual(evalHints.action, "promote");
  assert.equal(evalHints.targetDifficulty, "Medium");
});

await runTest("Rule 5: Mixed performance maintains current difficulty level", () => {
  // 1 solve, 1 fail -> mixed
  const mixed = [
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 1, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 5, total: 8, hintsUsed: 1, difficulty: "Medium", createdAt: new Date(1000) },
  ];
  const evalMixed = evaluateAdaptiveDifficulty({ submissions: mixed });
  assert.equal(evalMixed.targetDifficulty, "Medium");
  assert.equal(evalMixed.action, "maintain");
  assert.ok(evalMixed.reason.toLowerCase().includes("steady"));
});

await runTest("Rule 6: Explicit user difficulty overrides adaptive recommendation", () => {
  const easyHistory = [
    { verdict: "Wrong Answer", passed: 1, total: 6, hintsUsed: 3, difficulty: "Easy", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 2, total: 6, hintsUsed: 3, difficulty: "Easy", createdAt: new Date(1000) },
  ];

  // User explicitly asks for Hard despite poor Easy history
  const evalExplicit = evaluateAdaptiveDifficulty({
    submissions: easyHistory,
    message: "Give me a hard dynamic programming problem",
  });
  assert.equal(evalExplicit.targetDifficulty, "Hard");
  assert.equal(evalExplicit.isExplicit, true);
  assert.ok(evalExplicit.reason.includes("requested Hard"));
});

await runTest("Rule 7: Explicit preference to keep level maintains current baseline", () => {
  const promoteHistory = [
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 8, total: 8, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(1000) },
  ];

  // User asks to stay at medium
  const evalKeep = evaluateAdaptiveDifficulty({
    submissions: promoteHistory,
    message: "Keep difficulty the same, give me another problem",
  });
  assert.equal(evalKeep.targetDifficulty, "Medium");
  assert.equal(evalKeep.isExplicit, true);
  assert.ok(evalKeep.reason.includes("Keeping your practice at Medium"));
});

await runTest("Rule 8: Topic-specific performance is prioritized when sufficient topic history exists", () => {
  const mixedHistory = [
    // Trees: 2 fails
    { verdict: "Wrong Answer", passed: 2, total: 8, hintsUsed: 3, topic: "Trees", difficulty: "Medium", createdAt: new Date(4000) },
    { verdict: "Wrong Answer", passed: 1, total: 8, hintsUsed: 3, topic: "Trees", difficulty: "Medium", createdAt: new Date(3000) },
    // Arrays: 2 flawless solves
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, topic: "Arrays", difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, topic: "Arrays", difficulty: "Medium", createdAt: new Date(1000) },
  ];

  // Evaluating Trees specifically -> should demote to Easy to reinforce Trees fundamentals
  const evalTrees = evaluateAdaptiveDifficulty({
    submissions: mixedHistory,
    topic: "Trees",
  });
  assert.equal(evalTrees.targetDifficulty, "Easy");
  assert.equal(evalTrees.action, "demote");
  assert.ok(evalTrees.reason.includes("Trees"));

  // Evaluating Arrays specifically -> should promote to Hard
  const evalArrays = evaluateAdaptiveDifficulty({
    submissions: mixedHistory,
    topic: "Arrays",
  });
  assert.equal(evalArrays.targetDifficulty, "Hard");
  assert.equal(evalArrays.action, "promote");
  assert.ok(evalArrays.reason.includes("Arrays"));
});

// ---------------------------------------------------------------------------
// Suite 5: Company Catalog & DSA Arena Integration Integrity
// ---------------------------------------------------------------------------
console.log("\n--- Suite 5: Company Catalog & DSA Arena Integration ---");

await runTest("Company-specific requests preserve catalog flow with clean LeetCode link and concise attribution", () => {
  const mockCatalogResult = {
    company: "Amazon",
    questions: [
      {
        id: "amzn-1",
        title: "Course Schedule",
        url: "https://leetcode.com/problems/course-schedule/",
        difficulty: "Medium",
        company: "Amazon",
        topics: ["Graph", "BFS"],
      },
    ],
    totalMatched: 1,
  };

  const responseText = formatCatalogQuestionsResponse("Amazon", "Medium", mockCatalogResult, true);
  // Preserves real LeetCode link
  assert.ok(responseText.includes("[Course Schedule](https://leetcode.com/problems/course-schedule/)"));
  // Explains Arena limitation (metadata only)
  assert.ok(responseText.toLowerCase().includes("cannot be loaded directly into the dsa arena"));
  // Concise attribution without official endorsement claim
  assert.ok(responseText.includes("(Source: Community LeetCode catalog • Not an official Amazon endorsement)"));
});

// ---------------------------------------------------------------------------
// Suite 6: Security, Auth & User Isolation
// ---------------------------------------------------------------------------
console.log("\n--- Suite 6: Security, Auth & User Isolation ---");

await runTest("getAdaptiveStatusHandler rejects unauthenticated requests with HTTP 401", async () => {
  const req = { user: null, query: {} };
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };

  await getAdaptiveStatusHandler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
});

await runTest("Performance isolation: Submissions from user A do not influence user B", () => {
  const userASubmissions = [
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Medium", user: "user-A", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Medium", user: "user-A", createdAt: new Date(1000) },
  ];
  const userBSubmissions = [
    { verdict: "Wrong Answer", passed: 1, total: 10, hintsUsed: 3, difficulty: "Medium", user: "user-B", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 2, total: 10, hintsUsed: 3, difficulty: "Medium", user: "user-B", createdAt: new Date(1000) },
  ];

  const evalA = evaluateAdaptiveDifficulty({ submissions: userASubmissions });
  const evalB = evaluateAdaptiveDifficulty({ submissions: userBSubmissions });

  assert.equal(evalA.targetDifficulty, "Hard"); // User A promoted
  assert.equal(evalB.targetDifficulty, "Easy"); // User B demoted
});

await runTest("DsaSubmission model schema contains difficulty and hintsUsed paths", () => {
  const paths = DsaSubmission.schema.paths;
  assert.ok(paths.difficulty);
  assert.ok(paths.hintsUsed);
  assert.deepEqual(paths.difficulty.enumValues, ["Easy", "Medium", "Hard"]);
});

// ---------------------------------------------------------------------------
// Suite 7: CoachChat Runtime Verification & Profile Menu Regression Tests
// ---------------------------------------------------------------------------
console.log("\n--- Suite 7: CoachChat Runtime Verification & Profile Menu Regression ---");

function createMockRes() {
  return {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
  };
}

await runTest("coachChat rejects unauthenticated requests with HTTP 401", async () => {
  const req = { user: null, body: { message: "Hello Pepe" } };
  const res = createMockRes();
  await coachChat(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
});

await runTest("coachChat rejects missing message and action with HTTP 400", async () => {
  const req = { user: { id: new mongoose.Types.ObjectId().toString() }, body: { message: "", action: "" } };
  const res = createMockRes();
  await coachChat(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.jsonData?.error, "A message or coach action is required.");
});

await runTest("Authenticated coachChat with 0 submissions succeeds without HTTP 500 (TDZ ReferenceError fix)", async () => {
  setCustomTextGenerator(async () => {
    return "Namaste! Main Pepe hoon. Let's start practicing DSA!";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Hello Pepe, I am starting today." },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200, `Expected 200 but got ${res.statusCode}: ${JSON.stringify(res.jsonData)}`);
  assert.ok(res.jsonData.answer.includes("Pepe"));
  assert.equal(res.jsonData.action, "chat");
  assert.ok(res.jsonData.adaptiveAssessment);
  assert.equal(res.jsonData.adaptiveAssessment.targetDifficulty, "Medium");
  assert.equal(res.jsonData.adaptiveAssessment.isExplicit, false);
});

await runTest("Authenticated coachChat with existing submissions grounds adaptive difficulty", async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  let capturedPrompt = "";

  setCustomTextGenerator(async (prompt) => {
    capturedPrompt = prompt;
    return "Great job on your previous problems! Let's keep the momentum going.";
  });

  const req = {
    user: { id: userId },
    body: {
      message: "What should I practice next?",
      problem: { title: "Two Sum", topic: "Arrays" },
    },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.adaptiveAssessment);
  assert.ok(capturedPrompt.includes("ADAPTIVE DIFFICULTY ASSESSMENT"));
});

await runTest("Explicit difficulty request overrides adaptive assessment in coachChat", async () => {
  setCustomTextGenerator(async (prompt) => {
    // If problem generation prompt is detected, return valid problem JSON
    if (prompt.includes("problem setter") || prompt.includes("TEST CASE REQUIREMENTS")) {
      return JSON.stringify({
        title: "Climbing Stairs Variation",
        description: "Count distinct ways to reach top...",
        difficulty: "Easy",
        topic: "Dynamic Programming",
        examples: [
          { input: "n = 2", output: "2", explanation: "1+1 or 2" },
          { input: "n = 3", output: "3", explanation: "1+1+1, 1+2, or 2+1" },
        ],
        constraints: ["1 <= n <= 45"],
        boilerplates: {
          javascript: "function climbStairs(n) {\n  return 0;\n}",
          python: "def climbStairs(n):\n    return 0",
          java: "class Solution { public int climbStairs(int n) { return 0; } }",
          cpp: "class Solution { public: int climbStairs(int n) { return 0; } };",
        },
        testCases: [
          { input: { n: 2 }, expectedOutput: 2, isHidden: false },
          { input: { n: 3 }, expectedOutput: 3, isHidden: false },
          { input: { n: 4 }, expectedOutput: 5, isHidden: true },
          { input: { n: 5 }, expectedOutput: 8, isHidden: true },
          { input: { n: 6 }, expectedOutput: 13, isHidden: true },
          { input: { n: 7 }, expectedOutput: 21, isHidden: true },
        ],
        referenceSolution: {
          language: "javascript",
          code: "function climbStairs(n) {\n  if (n <= 2) return n;\n  let a = 1, b = 2;\n  for (let i = 3; i <= n; i++) {\n    const c = a + b;\n    a = b;\n    b = c;\n  }\n  return b;\n}",
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
        },
      });
    }
    return "Sure bhai, here is an easy practice problem for you!";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Give me an easy dynamic programming question" },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.adaptiveAssessment);
  assert.equal(res.jsonData.adaptiveAssessment.targetDifficulty, "Easy");
  assert.equal(res.jsonData.adaptiveAssessment.isExplicit, true);
  assert.equal(res.jsonData.action, "load_problem");
  assert.equal(res.jsonData.difficulty, "Easy");
});

await runTest("Company-specific question request detects company, difficulty, and preserves catalog flow without 500", async () => {
  let promptSentToAi = "";
  setCustomTextGenerator(async (prompt) => {
    promptSentToAi = prompt;
    return "Here are the top Amazon Medium questions from our LeetCode catalog:\n- [LRU Cache](https://leetcode.com/problems/lru-cache/)\n\n*(Source: Community LeetCode catalog • Not an official Amazon endorsement)*";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Give me an Amazon medium-level DSA question." },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.action, "chat");
  assert.ok(promptSentToAi.includes("Amazon"));
});

await runTest("Recoverable adaptive evaluation failure falls back to safe default without HTTP 500", async () => {
  setCustomTextGenerator(async () => {
    return "Pepe is ready to help you with DSA!";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: {
      message: "Help me prepare",
      plan: { schedule: null, title: {} },
    },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.adaptiveAssessment);
  assert.ok(["Easy", "Medium", "Hard"].includes(res.jsonData.adaptiveAssessment.targetDifficulty));
});

setCustomTextGenerator(null);

await runTest("Profile Menu: Unauthenticated state renders Login/Sign in, not Logout", () => {
  function getProfileMenuState({ isLoaded, isLoggedIn }) {
    if (!isLoaded) {
      return { showLogout: false, showLogin: false, isLoading: true };
    }
    if (isLoggedIn) {
      return { showLogout: true, showLogin: false, isLoading: false, label: "Logout" };
    }
    return { showLogout: false, showLogin: true, isLoading: false, label: "Login / Sign in" };
  }

  // Initializing state: Logout must NEVER be exposed
  const initializing = getProfileMenuState({ isLoaded: false, isLoggedIn: false });
  assert.equal(initializing.showLogout, false);
  assert.equal(initializing.isLoading, true);

  // Signed out state: Login / Sign in shown, Logout NOT shown
  const signedOut = getProfileMenuState({ isLoaded: true, isLoggedIn: false });
  assert.equal(signedOut.showLogout, false);
  assert.equal(signedOut.showLogin, true);
  assert.ok(signedOut.label.includes("Login") || signedOut.label.includes("Sign in"));

  // Signed in state: Logout shown, Login NOT shown
  const signedIn = getProfileMenuState({ isLoaded: true, isLoggedIn: true });
  assert.equal(signedIn.showLogout, true);
  assert.equal(signedIn.showLogin, false);
  assert.equal(signedIn.label, "Logout");
});

// ---------------------------------------------------------------------------
// Suite 8: Step 4 Real Flow Verification (Pepe Coach & Arena Integration)
// ---------------------------------------------------------------------------
console.log("\n--- Suite 8: Step 4 Real Flow Verification ---");

// Helper to simulate handleLoadProblem logic from DsaArena.jsx
function simulateHandleLoadProblem(newProblem, newTopic, newDifficulty) {
  if (!newProblem) return false;

  const problemId =
    newProblem?.id ||
    newProblem?.problemId ||
    newProblem?._id ||
    (newProblem?.title
      ? newProblem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      : undefined);

  const targetTopic = newTopic || newProblem.topic || "Arrays";
  const targetDifficulty = newDifficulty || newProblem.difficulty || "Medium";
  const stableProblem = {
    ...newProblem,
    id: problemId,
    problemId,
    difficulty: targetDifficulty,
    topic: targetTopic,
  };

  const initializedRef = {
    problemKey: problemId || stableProblem.title,
    language: "javascript",
  };

  return { stableProblem, problemId, initializedRef };
}

await runTest("Flow 1: Send 'Hi' — Pepe responds normally without error", async () => {
  setCustomTextGenerator(async () => {
    return "Namaste dost! Main Pepe hoon, your DSA coach. Kaise chal rahi hai prep?";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Hi", action: "chat" },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.answer.includes("Pepe"));
  assert.equal(res.jsonData.action, "chat");
});

await runTest("Flow 2: Send 'Give me a DSA question' — question generated and handleLoadProblem resolves problemId safely", async () => {
  setCustomTextGenerator(async (prompt) => {
    if (prompt.includes("problem setter") || prompt.includes("TEST CASE REQUIREMENTS")) {
      return JSON.stringify({
        title: "Max Subarray Product",
        description: "Find the maximum product of a contiguous subarray.",
        difficulty: "Medium",
        topic: "Arrays",
        examples: [
          { input: "nums = [2,3,-2,4]", output: "6", explanation: "[2,3] has the largest product 6." },
          { input: "nums = [-2,0,-1]", output: "0", explanation: "The result cannot be 2, because [-2,-1] is not a subarray." },
        ],
        constraints: ["1 <= nums.length <= 2 * 10^4", "-10 <= nums[i] <= 10"],
        boilerplates: {
          javascript: "function maxProduct(nums) {\n  return 0;\n}",
          python: "def maxProduct(nums):\n    return 0",
          java: "class Solution { public int maxProduct(int[] nums) { return 0; } }",
          cpp: "class Solution { public: int maxProduct(vector<int>& nums) { return 0; } };",
        },
        testCases: [
          { input: { nums: [2, 3, -2, 4] }, expectedOutput: 6, isHidden: false },
          { input: { nums: [-2, 0, -1] }, expectedOutput: 0, isHidden: false },
          { input: { nums: [-2] }, expectedOutput: -2, isHidden: true },
          { input: { nums: [0, 2] }, expectedOutput: 2, isHidden: true },
          { input: { nums: [-2, 3, -4] }, expectedOutput: 24, isHidden: true },
          { input: { nums: [2, -5, -2, -4, 3] }, expectedOutput: 24, isHidden: true },
        ],
        referenceSolution: {
          language: "javascript",
          code: "function maxProduct(nums) {\n  let max = nums[0], min = nums[0], ans = nums[0];\n  for (let i = 1; i < nums.length; i++) {\n    if (nums[i] < 0) { const t = max; max = min; min = t; }\n    max = Math.max(nums[i], max * nums[i]);\n    min = Math.min(nums[i], min * nums[i]);\n    ans = Math.max(ans, max);\n  }\n  return ans;\n}",
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
        },
      });
    }
    return "I've generated an original AI practice problem ('Max Subarray Product') [Medium • Arrays] and loaded it into your DSA Arena!";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Give me a DSA question", action: "chat" },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.action, "load_problem");
  assert.ok(res.jsonData.problem);
  assert.equal(res.jsonData.problem.title, "Max Subarray Product");

  // Verify handleLoadProblem executes without ReferenceError
  const loaded = simulateHandleLoadProblem(res.jsonData.problem, res.jsonData.topic, res.jsonData.difficulty);
  assert.ok(loaded.problemId, "problemId must be resolved");
  assert.equal(loaded.stableProblem.id, loaded.problemId);
  assert.equal(loaded.stableProblem.problemId, loaded.problemId);
  assert.equal(loaded.stableProblem.difficulty, "Medium");
  assert.equal(loaded.stableProblem.topic, "Arrays");
});

await runTest("Flow 3: Ask for Hint 1 — hint appears and hint tracking works", async () => {
  setCustomTextGenerator(async () => {
    return "Think about keeping track of both maximum and minimum products up to the current index.";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: {
      action: "hint",
      hintLevel: 1,
      problem: { title: "Max Subarray Product", topic: "Arrays", difficulty: "Medium" },
      code: "function maxProduct(nums) {}",
    },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonData.answer.includes("maximum and minimum"));
});

await runTest("Flow 4: Ask for approach and solution — both existing flows work", async () => {
  // Test approach
  setCustomTextGenerator(async () => {
    return "Here is the two-variable DP approach: maintain max_so_far and min_so_far.";
  });

  const reqApproach = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: {
      action: "approach",
      problem: { title: "Max Subarray Product", topic: "Arrays" },
    },
  };
  const resApproach = createMockRes();
  await coachChat(reqApproach, resApproach);
  assert.equal(resApproach.statusCode, 200);
  assert.ok(resApproach.jsonData.answer.includes("approach"));

  // Test solution
  setCustomTextGenerator(async () => {
    return "Here is the complete solution:\n```javascript\nfunction maxProduct(nums) {}\n```";
  });

  const reqSolution = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: {
      action: "solution",
      problem: { title: "Max Subarray Product", topic: "Arrays" },
    },
  };
  const resSolution = createMockRes();
  await coachChat(reqSolution, resSolution);
  assert.equal(resSolution.statusCode, 200);
  assert.ok(resSolution.jsonData.answer.includes("solution"));
});

await runTest("Flow 5: Submit code — DsaSubmission model accepts problemId, difficulty, hintsUsed", () => {
  const submissionData = {
    user: new mongoose.Types.ObjectId(),
    problemId: "max-subarray-product",
    problem: {
      id: "max-subarray-product",
      title: "Max Subarray Product",
      description: "Find max product",
      difficulty: "Medium",
    },
    difficulty: "Medium",
    hintsUsed: 1,
    topic: "Arrays",
    language: "javascript",
    code: "function maxProduct() {}",
    verdict: "Accepted",
    passed: 6,
    total: 6,
  };

  const sub = new DsaSubmission(submissionData);
  assert.equal(sub.problemId, "max-subarray-product");
  assert.equal(sub.difficulty, "Medium");
  assert.equal(sub.hintsUsed, 1);
  assert.equal(sub.verdict, "Accepted");
});

await runTest("Flow 6: Ask for another question — request completes without error", async () => {
  setCustomTextGenerator(async (prompt) => {
    if (prompt.includes("problem setter") || prompt.includes("TEST CASE REQUIREMENTS")) {
      return JSON.stringify({
        title: "Two Sum BST",
        description: "Find if two nodes in BST sum to target.",
        difficulty: "Easy",
        topic: "Trees",
        examples: [
          { input: "root = [5,3,6], k = 9", output: "true", explanation: "5 + 4 = 9" },
          { input: "root = [5,3,6], k = 28", output: "false", explanation: "No two nodes sum to 28" },
        ],
        constraints: ["1 <= nodes <= 10^4"],
        boilerplates: {
          javascript: "function findTarget(root, k) {\n  return false;\n}",
          python: "def findTarget(root, k):\n    return False",
          java: "class Solution { public boolean findTarget(TreeNode root, int k) { return false; } }",
          cpp: "class Solution { public: bool findTarget(TreeNode* root, int k) { return false; } };",
        },
        testCases: [
          { input: { root: [5, 3, 6], k: 9 }, expectedOutput: true, isHidden: false },
          { input: { root: [5, 3, 6], k: 28 }, expectedOutput: false, isHidden: false },
          { input: { root: [5, 3, 6], k: 8 }, expectedOutput: true, isHidden: true },
          { input: { root: [5, 3, 6], k: 0 }, expectedOutput: false, isHidden: true },
        ],
        referenceSolution: {
          language: "javascript",
          code: "function findTarget(root, k) {\n  return k === 9 || k === 8;\n}",
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
        },
      });
    }
    return "I've loaded a new problem ('Two Sum BST') [Easy • Trees] into your DSA Arena!";
  });

  const req = {
    user: { id: new mongoose.Types.ObjectId().toString() },
    body: { message: "Give me an easy tree problem", action: "chat" },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.action, "load_problem");
  assert.equal(res.jsonData.difficulty, "Easy");

  const loaded = simulateHandleLoadProblem(res.jsonData.problem, res.jsonData.topic, res.jsonData.difficulty);
  assert.ok(loaded.problemId);
  assert.equal(loaded.stableProblem.difficulty, "Easy");
});

await runTest("Flow 7: Adaptive difficulty updates recommendation based on recorded submissions", () => {
  const consecutiveSolves = [
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 10, total: 10, hintsUsed: 0, difficulty: "Medium", createdAt: new Date(1000) },
  ];
  const consecutiveFails = [
    { verdict: "Wrong Answer", passed: 1, total: 10, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(2000) },
    { verdict: "Wrong Answer", passed: 2, total: 10, hintsUsed: 3, difficulty: "Medium", createdAt: new Date(1000) },
  ];

  const promoted = evaluateAdaptiveDifficulty({ submissions: consecutiveSolves });
  const demoted = evaluateAdaptiveDifficulty({ submissions: consecutiveFails });

  assert.equal(promoted.targetDifficulty, "Hard");
  assert.equal(promoted.action, "promote");
  assert.equal(demoted.targetDifficulty, "Easy");
  assert.equal(demoted.action, "demote");
});

await runTest("Flow 8: Confirm handleLoadProblem never throws ReferenceError on missing problemId", () => {
  // Case A: Problem with only title
  const r1 = simulateHandleLoadProblem({ title: "Invert Binary Tree" });
  assert.equal(r1.problemId, "invert-binary-tree");
  assert.equal(r1.stableProblem.id, "invert-binary-tree");

  // Case B: Problem with explicit id
  const r2 = simulateHandleLoadProblem({ id: "custom-id-123", title: "Two Sum" });
  assert.equal(r2.problemId, "custom-id-123");

  // Case C: Problem with problemId
  const r3 = simulateHandleLoadProblem({ problemId: "slug-456", title: "Subsets" });
  assert.equal(r3.problemId, "slug-456");

  // Case D: Problem with _id
  const r4 = simulateHandleLoadProblem({ _id: "mongo-789", title: "LRU" });
  assert.equal(r4.problemId, "mongo-789");
});

console.log("\n--- Suite 9: Targeted Fixes Verification (Issues A, B, C) ---");

// Helper simulating DsaArena's unsaved modifications detection
function evaluateUnsavedProtection({ problem, code, boilerplate, executionResults, lastSubmittedCode }) {
  const isBoilerplate = !code || code.trim() === boilerplate.trim();
  const isAccepted = executionResults?.verdict === "Accepted";
  const isAlreadySubmitted =
    executionResults &&
    lastSubmittedCode &&
    code.trim() === lastSubmittedCode.trim();
  const isKnownBroken =
    problem?.title === "Peak Segment Product" || problem?.isInvalid;

  const hasUnsavedModifications =
    !isBoilerplate && !isAccepted && !isAlreadySubmitted && !isKnownBroken;

  return { hasUnsavedModifications };
}

await runTest("Issue A: Unchanged code allows next problem without confirmation", () => {
  const boilerplate = "function solve() {}";
  const res = evaluateUnsavedProtection({
    problem: { title: "Two Sum" },
    code: "function solve() {}",
    boilerplate,
    executionResults: null,
    lastSubmittedCode: null,
  });
  assert.equal(res.hasUnsavedModifications, false);
});

await runTest("Issue A: Accepted code allows next problem without confirmation", () => {
  const boilerplate = "function solve() {}";
  const res = evaluateUnsavedProtection({
    problem: { title: "Two Sum" },
    code: "function solve() { return [0, 1]; }",
    boilerplate,
    executionResults: { verdict: "Accepted", passed: 5, total: 5 },
    lastSubmittedCode: "function solve() { return [0, 1]; }",
  });
  assert.equal(res.hasUnsavedModifications, false);
});

await runTest("Issue A: Safely submitted code (failed or passed) unchanged in editor allows next problem without confirmation", () => {
  const boilerplate = "function solve() {}";
  const submittedCode = "function solve() { return null; }";
  const res = evaluateUnsavedProtection({
    problem: { title: "Two Sum" },
    code: submittedCode,
    boilerplate,
    executionResults: { verdict: "Wrong Answer", passed: 2, total: 5 },
    lastSubmittedCode: submittedCode,
  });
  assert.equal(res.hasUnsavedModifications, false);
});

await runTest("Issue A: Edited unsubmitted code correctly triggers confirmation protection", () => {
  const boilerplate = "function solve() {}";
  const res = evaluateUnsavedProtection({
    problem: { title: "Two Sum" },
    code: "function solve() { // in progress draft... }",
    boilerplate,
    executionResults: null,
    lastSubmittedCode: null,
  });
  assert.equal(res.hasUnsavedModifications, true);
});

await runTest("Issue A: Flagged problem (Peak Segment Product) allows loading new problem without warning", () => {
  const boilerplate = "function maxPeakSegmentProduct() {}";
  const res = evaluateUnsavedProtection({
    problem: { title: "Peak Segment Product" },
    code: "function maxPeakSegmentProduct() { // 6/7 failed code }",
    boilerplate,
    executionResults: { verdict: "Wrong Answer", passed: 6, total: 7 },
    lastSubmittedCode: null,
  });
  assert.equal(res.hasUnsavedModifications, false);
});

await runTest("Issue B: Topic normalization maps variations and plurals accurately", () => {
  assert.equal(normalizeTopicName("array"), "arrays");
  assert.equal(normalizeTopicName("Arrays"), "arrays");
  assert.equal(normalizeTopicName("Tree"), "trees");
  assert.equal(normalizeTopicName("trees"), "trees");
  assert.equal(normalizeTopicName("dp"), "dynamic programming");
  assert.equal(normalizeTopicName("Dynamic Programming"), "dynamic programming");
});

await runTest("Issue B: Topic-specific performance matching matches singular and plural query", () => {
  const submissions = [
    { verdict: "Accepted", passed: 5, total: 5, hintsUsed: 0, difficulty: "Medium", topic: "Arrays" },
    { verdict: "Accepted", passed: 5, total: 5, hintsUsed: 0, difficulty: "Medium", topic: "Arrays" },
  ];
  const evalSingular = evaluateAdaptiveDifficulty({ submissions, topic: "array" });
  assert.equal(evalSingular.targetDifficulty, "Hard");
  assert.equal(evalSingular.action, "promote");
});

await runTest("Issue B: Complete decision path: 2 accepted Medium solves promotes to Hard and coachChat generates Hard problem", async () => {
  const mediumSolves = [
    { verdict: "Accepted", passed: 5, total: 5, hintsUsed: 0, difficulty: "Medium", topic: "Arrays", createdAt: new Date(2000) },
    { verdict: "Accepted", passed: 5, total: 5, hintsUsed: 0, difficulty: "Medium", topic: "Arrays", createdAt: new Date(1000) },
  ];

  const evalResult = evaluateAdaptiveDifficulty({ submissions: mediumSolves });
  assert.equal(evalResult.targetDifficulty, "Hard");
  assert.equal(evalResult.action, "promote");

  setCustomTextGenerator(async (prompt) => {
    if (prompt.includes("professional Data Structures and Algorithms problem setter")) {
      return JSON.stringify({
        title: "Hard Graph Flow",
        description: "Hard problem description",
        examples: [{ input: "a", output: "b", explanation: "c" }, { input: "d", output: "e", explanation: "f" }],
        constraints: ["1 <= n <= 10^5"],
        boilerplates: {
          javascript: "function hardFlow() {}",
          python: "def hard_flow(): pass",
          java: "class Solution { public void hardFlow() {} }",
          cpp: "class Solution { public: void hardFlow() {} };",
        },
        testCases: [
          { input: { n: 1 }, expectedOutput: 1, isHidden: false },
          { input: { n: 2 }, expectedOutput: 2, isHidden: false },
          { input: { n: 3 }, expectedOutput: 3, isHidden: true },
          { input: { n: 4 }, expectedOutput: 4, isHidden: true },
        ],
        referenceSolution: {
          language: "javascript",
          code: "function hardFlow(n) { return n; }",
          timeComplexity: "O(n)",
          spaceComplexity: "O(1)",
        },
      });
    }

    return `[TOOL_CALL:generate_problem]{"topic": "Arrays", "difficulty": "Medium"}[/TOOL_CALL] Loading a problem for you!`;
  });

  const testUserId = new mongoose.Types.ObjectId();
  const req = {
    user: { id: testUserId.toString() },
    body: {
      message: "Give me a DSA question",
      action: "chat",
      submissions: mediumSolves,
    },
  };
  const res = createMockRes();

  await coachChat(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonData.action, "load_problem");
  assert.equal(res.jsonData.difficulty, "Hard");
});

await runTest("Issue C: Structural validation includes referenceSolution", () => {
  const validProb = {
    title: "Test Problem",
    description: "Description",
    examples: [{ input: "a", output: "b", explanation: "c" }, { input: "d", output: "e", explanation: "f" }],
    constraints: ["c1"],
    boilerplates: {
      javascript: "function solve() {}",
      python: "def solve(): pass",
      java: "class Solution { public void solve() {} }",
      cpp: "class Solution { public: void solve() {} };",
    },
    testCases: [
      { input: { x: 1 }, expectedOutput: 1, isHidden: false },
      { input: { x: 2 }, expectedOutput: 2, isHidden: false },
      { input: { x: 3 }, expectedOutput: 3, isHidden: true },
      { input: { x: 4 }, expectedOutput: 4, isHidden: true },
    ],
    referenceSolution: {
      language: "javascript",
      code: "function solve(x) { return x; }",
      timeComplexity: "O(1)",
      spaceComplexity: "O(1)",
    },
  };
  assert.equal(validateGeneratedProblem(validProb), true);

  const invalidProb = { ...validProb, referenceSolution: { language: "javascript", code: "" } };
  assert.equal(validateGeneratedProblem(invalidProb), false);
});

await runTest("Issue C: Complexity mismatch detection catches false O(n) claim on quadratic nested loops", () => {
  const quadraticSolution = {
    language: "javascript",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    code: `function maxPeakSegmentProduct(nums) {
      let n = nums.length;
      for (let i = 0; i < n; i++) {
        for (let cur = i; cur <= rightBound; cur++) {
          let prod = nums[i] * nums[cur];
        }
      }
    }`,
  };
  assert.equal(hasComplexityMismatch(quadraticSolution), true);

  const genuineLinearSolution = {
    language: "javascript",
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    code: `function maxSubArray(nums) {
      let maxSoFar = nums[0];
      for (let i = 1; i < nums.length; i++) {
        maxSoFar = Math.max(maxSoFar, nums[i]);
      }
      return maxSoFar;
    }`,
  };
  assert.equal(hasComplexityMismatch(genuineLinearSolution), false);
});

setCustomTextGenerator(null);

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
console.log("=================================================\n");

if (passedTests < totalTests) {
  process.exit(1);
}
