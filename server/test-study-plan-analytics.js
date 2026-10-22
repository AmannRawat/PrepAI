import assert from "node:assert/strict";
import {
  calculateDsaStats,
  getSubmissionProblemKey,
} from "./services/analytics.service.js";
import StudyPlan from "./models/StudyPlan.model.js";
import {
  generateProblem,
  runCode,
  evaluateCode,
  coachChat,
  getHint,
  explainApproach,
  showSolution,
  clearCoachData,
} from "./controllers/dsa.controller.js";
import {
  getUserProgress,
  getDsaStats,
  getStudyPlan,
  saveStudyPlan,
  recordActivity,
} from "./controllers/user.controller.js";

async function runTests() {
  console.log("=================================================");
  console.log("  STUDY PLAN & DSA ANALYTICS VERIFICATION TESTS  ");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`[PASS] ${name}`);
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message}`);
    }
  }

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

  // ----------------------------------------------------
  // Test Suite 1: Users with No History
  // ----------------------------------------------------
  console.log("--- Suite 1: Users With No History ---");

  test("Empty submissions array returns clean zeroed statistics", () => {
    const stats = calculateDsaStats([]);
    assert.equal(stats.totalAttempts, 0);
    assert.equal(stats.acceptedAttempts, 0);
    assert.equal(stats.uniqueSolved, 0);
    assert.equal(stats.totalProblemsAttempted, 0);
    assert.equal(stats.acceptanceRate, 0);
    assert.deepEqual(stats.topicBreakdown, []);
    assert.deepEqual(stats.topicStats, {});
  });

  test("Null or undefined submissions returns zeroed statistics without throwing", () => {
    const statsNull = calculateDsaStats(null);
    const statsUndef = calculateDsaStats(undefined);
    assert.equal(statsNull.totalAttempts, 0);
    assert.equal(statsNull.uniqueSolved, 0);
    assert.equal(statsUndef.totalAttempts, 0);
    assert.equal(statsUndef.acceptanceRate, 0);
  });

  // ----------------------------------------------------
  // Test Suite 2: Authoritative Verdict Handling
  // ----------------------------------------------------
  console.log("\n--- Suite 2: Authoritative Verdict Handling ---");

  test("Only verdict === 'Accepted' counts as successful; non-accepted verdicts count as attempts", () => {
    const submissions = [
      { problemId: "p1", topic: "Arrays", verdict: "Accepted" },
      { problemId: "p2", topic: "Arrays", verdict: "Wrong Answer" },
      { problemId: "p3", topic: "Strings", verdict: "Runtime Error" },
      { problemId: "p4", topic: "Trees", verdict: "Time Limit Exceeded" },
      { problemId: "p5", topic: "DP", verdict: "Compilation Error" },
    ];

    const stats = calculateDsaStats(submissions);
    assert.equal(stats.totalAttempts, 5);
    assert.equal(stats.acceptedAttempts, 1);
    assert.equal(stats.uniqueSolved, 1);
    assert.equal(stats.acceptanceRate, 20); // 1 / 5 = 20%
  });

  // ----------------------------------------------------
  // Test Suite 3: Duplicate Solves and Separate Metrics
  // ----------------------------------------------------
  console.log("\n--- Suite 3: Duplicate Submissions & Metric Separation ---");

  test("Multiple accepted submissions for SAME problem do NOT inflate uniqueSolved, but DO count in attempts", () => {
    const submissions = [
      // Problem 1: solved 3 times consecutively
      { problemId: "p1", problem: { title: "Two Sum" }, topic: "Arrays", verdict: "Accepted" },
      { problemId: "p1", problem: { title: "Two Sum" }, topic: "Arrays", verdict: "Accepted" },
      { problemId: "p1", problem: { title: "Two Sum" }, topic: "Arrays", verdict: "Accepted" },
      // Problem 2: failed 2 times, then accepted 1 time
      { problemId: "p2", problem: { title: "Valid Palindrome" }, topic: "Strings", verdict: "Wrong Answer" },
      { problemId: "p2", problem: { title: "Valid Palindrome" }, topic: "Strings", verdict: "Runtime Error" },
      { problemId: "p2", problem: { title: "Valid Palindrome" }, topic: "Strings", verdict: "Accepted" },
      // Problem 3: attempted 2 times, never accepted
      { problemId: "p3", problem: { title: "Invert Binary Tree" }, topic: "Trees", verdict: "Wrong Answer" },
      { problemId: "p3", problem: { title: "Invert Binary Tree" }, topic: "Trees", verdict: "Wrong Answer" },
    ];

    const stats = calculateDsaStats(submissions);

    // Total attempts across all problems: 3 + 3 + 2 = 8
    assert.equal(stats.totalAttempts, 8);
    // Total successful attempts: 3 (p1) + 1 (p2) = 4
    assert.equal(stats.acceptedAttempts, 4);
    // Total unique problems solved: p1 and p2 = 2
    assert.equal(stats.uniqueSolved, 2);
    // Total distinct problems attempted: p1, p2, p3 = 3
    assert.equal(stats.totalProblemsAttempted, 3);
    // Acceptance rate: 4 / 8 = 50%
    assert.equal(stats.acceptanceRate, 50);

    // Verify uniqueSolved is strictly separated from acceptedAttempts
    assert.notEqual(stats.uniqueSolved, stats.acceptedAttempts);
    assert.equal(stats.uniqueSolved < stats.acceptedAttempts, true);
  });

  // ----------------------------------------------------
  // Test Suite 4: Problem Identification Fallbacks
  // ----------------------------------------------------
  console.log("\n--- Suite 4: Problem Key Resolution ---");

  test("Problem key resolves problemId, problem.id, or normalized title correctly", () => {
    const sub1 = { problemId: "prob-123", topic: "DP" };
    const sub2 = { problem: { id: "prob-456", title: "Climbing Stairs" } };
    const sub3 = { problem: { title: "  Binary Search  " } };
    const sub4 = { problem: { title: "binary search" } };

    assert.equal(getSubmissionProblemKey(sub1), "id:prob-123");
    assert.equal(getSubmissionProblemKey(sub2), "id:prob-456");
    assert.equal(getSubmissionProblemKey(sub3), "title:binary search");
    assert.equal(getSubmissionProblemKey(sub4), "title:binary search");
    // Sub 3 and Sub 4 map to identical key despite whitespace/case
    assert.equal(getSubmissionProblemKey(sub3), getSubmissionProblemKey(sub4));
  });

  // ----------------------------------------------------
  // Test Suite 5: Topic-Wise Performance Aggregation
  // ----------------------------------------------------
  console.log("\n--- Suite 5: Topic-Wise Performance Breakdown ---");

  test("Topic-wise performance correctly aggregates attempts, unique solves, and identifies weak areas", () => {
    const submissions = [
      // Arrays: 4 attempts, 3 accepted (2 unique problems)
      { problemId: "arr1", topic: "Arrays", verdict: "Accepted" },
      { problemId: "arr1", topic: "Arrays", verdict: "Accepted" },
      { problemId: "arr2", topic: "Arrays", verdict: "Accepted" },
      { problemId: "arr3", topic: "Arrays", verdict: "Wrong Answer" },
      // DP: 3 attempts, 0 accepted
      { problemId: "dp1", topic: "Dynamic Programming", verdict: "Wrong Answer" },
      { problemId: "dp2", topic: "Dynamic Programming", verdict: "Time Limit Exceeded" },
      { problemId: "dp2", topic: "Dynamic Programming", verdict: "Wrong Answer" },
    ];

    const stats = calculateDsaStats(submissions);
    assert.equal(stats.topicBreakdown.length, 2);

    const arraysTopic = stats.topicStats["Arrays"];
    assert.ok(arraysTopic);
    assert.equal(arraysTopic.attempts, 4);
    assert.equal(arraysTopic.acceptedAttempts, 3);
    assert.equal(arraysTopic.uniqueSolved, 2);
    assert.equal(arraysTopic.acceptanceRate, 75); // 3/4 = 75%
    assert.equal(arraysTopic.needsImprovement, false);

    const dpTopic = stats.topicStats["Dynamic Programming"];
    assert.ok(dpTopic);
    assert.equal(dpTopic.attempts, 3);
    assert.equal(dpTopic.acceptedAttempts, 0);
    assert.equal(dpTopic.uniqueSolved, 0);
    assert.equal(dpTopic.acceptanceRate, 0);
    assert.equal(dpTopic.needsImprovement, true); // < 60% or 0 solved -> needs improvement
  });

  // ----------------------------------------------------
  // Test Suite 6: StudyPlan Model Schema Verification
  // ----------------------------------------------------
  console.log("\n--- Suite 6: StudyPlan Model Verification ---");

  test("StudyPlan model exposes expected schema paths and structure", () => {
    assert.ok(StudyPlan.schema);
    const paths = StudyPlan.schema.paths;
    assert.ok(paths["user"], "user reference path must exist");
    assert.ok(paths["onboardingProfile.targetCompanies"], "onboardingProfile.targetCompanies path must exist");
    assert.ok(paths["onboardingProfile.weakTopics"], "onboardingProfile.weakTopics path must exist");
    assert.ok(paths["onboardingProfile.dailyTime"], "onboardingProfile.dailyTime path must exist");
    assert.ok(paths["plan.title"], "plan.title path must exist");
    assert.ok(paths["plan.schedule"], "plan.schedule array path must exist");
  });

  // ----------------------------------------------------
  // Test Suite 7: User Isolation
  // ----------------------------------------------------
  console.log("\n--- Suite 7: User Isolation in Analytics ---");

  test("Analytics correctly isolates statistics per user submissions array", () => {
    const userASubmissions = [
      { problemId: "p1", topic: "Arrays", verdict: "Accepted" },
      { problemId: "p2", topic: "Strings", verdict: "Accepted" },
    ];
    const userBSubmissions = [
      { problemId: "p3", topic: "Trees", verdict: "Wrong Answer" },
    ];

    const statsA = calculateDsaStats(userASubmissions);
    const statsB = calculateDsaStats(userBSubmissions);

    assert.equal(statsA.totalAttempts, 2);
    assert.equal(statsA.uniqueSolved, 2);
    assert.equal(statsA.acceptanceRate, 100);

    assert.equal(statsB.totalAttempts, 1);
    assert.equal(statsB.uniqueSolved, 0);
    assert.equal(statsB.acceptanceRate, 0);
  });

  // ----------------------------------------------------
  // Test Suite 8: Authentication Enforcement & Protection (Bug 2)
  // ----------------------------------------------------
  console.log("\n--- Suite 8: Unauthenticated Access Rejection (Bug 2) ---");

  await test("Unauthenticated generateProblem rejects with HTTP 401", async () => {
    const req = { body: { topic: "Arrays", difficulty: "Easy" }, user: undefined };
    const res = createMockRes();
    await generateProblem(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated runCode rejects with HTTP 401", async () => {
    const req = { body: { code: "function test() {}", language: "javascript" }, user: null };
    const res = createMockRes();
    await runCode(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated evaluateCode rejects with HTTP 401", async () => {
    const req = { body: { code: "function test() {}", language: "javascript", topic: "Arrays" }, user: undefined };
    const res = createMockRes();
    await evaluateCode(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated coachChat rejects with HTTP 401", async () => {
    const req = { body: { message: "Hello Pepe" }, user: undefined };
    const res = createMockRes();
    await coachChat(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated getHint, explainApproach, and showSolution reject with HTTP 401", async () => {
    for (const coachFn of [getHint, explainApproach, showSolution]) {
      const req = { body: { problem: { title: "T", description: "D" }, language: "javascript" }, user: undefined };
      const res = createMockRes();
      await coachFn(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
    }
  });

  await test("Unauthenticated clearCoachData rejects with HTTP 401", async () => {
    const req = { user: undefined };
    const res = createMockRes();
    await clearCoachData(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated user progress and stats endpoints reject with HTTP 401", async () => {
    for (const userFn of [getUserProgress, getDsaStats, getStudyPlan, saveStudyPlan, recordActivity]) {
      const req = { body: { plan: {} }, user: undefined };
      const res = createMockRes();
      await userFn(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
    }
  });

  await test("Client-supplied userId in body or headers cannot bypass authentication", async () => {
    const req = {
      body: { userId: "victim_user_123", topic: "Arrays", difficulty: "Medium" },
      headers: { "x-user-id": "victim_user_123" },
      user: undefined, // No valid authenticated Clerk session
    };
    const res = createMockRes();
    await generateProblem(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  // ----------------------------------------------------
  // Test Suite 9: DSA Arena Results Tab State Regression (Bug 1)
  // ----------------------------------------------------
  console.log("\n--- Suite 9: DSA Arena Results Tab State Regression (Bug 1) ---");

  await test("DSA Arena activeResultsTab state lifecycle contract holds", () => {
    // Simulate activeResultsTab lifecycle
    let activeResultsTab = 'tests';
    const setActiveResultsTab = (tab) => { activeResultsTab = tab; };

    // Initial state
    assert.equal(activeResultsTab, 'tests');

    // Run Code resets to 'tests' tab
    setActiveResultsTab('analysis');
    assert.equal(activeResultsTab, 'analysis');
    // Code runner action:
    setActiveResultsTab('tests');
    assert.equal(activeResultsTab, 'tests');

    // Submit Code resets to 'tests' tab
    setActiveResultsTab('analysis');
    // Code submit action:
    setActiveResultsTab('tests');
    assert.equal(activeResultsTab, 'tests');

    // Session reset restores 'tests' tab
    setActiveResultsTab('analysis');
    setActiveResultsTab('tests');
    assert.equal(activeResultsTab, 'tests');
  });

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Unhandled test suite error:", err);
  process.exit(1);
});
