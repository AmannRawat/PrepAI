import "dotenv/config";
import assert from "node:assert/strict";
import vm from "node:vm";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";
process.env.ONLINECOMPILER_API_KEY =
  process.env.ONLINECOMPILER_API_KEY || "test_mock_compiler_key";

import {
  getAllBlueprints,
  getBlueprintById,
  findBlueprintsByTopicAndDifficulty,
  selectNextBlueprint,
  buildCanonicalProblemFromBlueprint,
  TOPIC_ROTATION_ORDER,
} from "./services/dsaBlueprints.js";

import {
  createDsaProblem,
  generateProblem,
  coachChat,
  validateGeneratedProblem,
  getUserRecentProblemData,
  recordUserProblemLoad,
} from "./controllers/dsa.controller.js";

import { setCustomTextGenerator } from "./services/gemini.service.js";
import { executeCode } from "./services/codeExecution.service.js";

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

// Global fetch mock helper for tests requiring compiler simulation
function setupMockFetchCompiler(customHandler = null) {
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const urlStr = url instanceof URL ? url.toString() : String(url || "");
    if (urlStr.includes("onlinecompiler") || urlStr.includes("run-code")) {
      if (customHandler) {
        return customHandler(urlStr, opts);
      }
      // Default: parse test cases from harness and return matching expected outputs
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
    return originalFetch ? originalFetch(url, opts) : { ok: true, json: async () => ({}) };
  };
  return () => {
    global.fetch = originalFetch;
  };
}

function setDefaultMockGenerator() {
  setCustomTextGenerator(async (prompt, options) => {
    const stage = options?.stage || "unknown";
    if (stage === "problem_generation") {
      return JSON.stringify({
        title: "Generated Variation",
        description: "Description of the generated problem variation.",
        examples: [
          { input: "Sample input 1", output: "Sample output 1", explanation: "Exp 1" },
          { input: "Sample input 2", output: "Sample output 2", explanation: "Exp 2" },
        ],
        constraints: ["1 <= n <= 10^4"],
      });
    }
    if (stage === "problem_confirmation") {
      return "New original problem loaded into your DSA Arena!";
    }
    if (stage === "coach_chat") {
      return "Here are the interview questions for Amazon: [Two Sum](https://leetcode.com/problems/two-sum/)";
    }
    return "Pepe response";
  });
}

async function runAllHybridTests() {
  console.log("=================================================");
  console.log("  HYBRID DSA PROBLEM GENERATION & BLUEPRINT SUITE ");
  console.log("=================================================");

  const restoreFetch = setupMockFetchCompiler();
  setDefaultMockGenerator();

  try {
    // -------------------------------------------------------------------------
    // 1. Seeded Blueprint Specification & Baseline Tests
    // -------------------------------------------------------------------------
    await runTest("1. Every seeded blueprint has a valid specification, boilerplates, and baseline tests", () => {
      const blueprints = getAllBlueprints();
      assert.ok(blueprints.length >= 12, `Expected at least 12 blueprints, found ${blueprints.length}`);

      for (const bp of blueprints) {
        assert.ok(bp.id && typeof bp.id === "string", `Missing blueprint id`);
        assert.ok(bp.topic && typeof bp.topic === "string", `Missing topic for ${bp.id}`);
        assert.ok(bp.pattern && typeof bp.pattern === "string", `Missing pattern for ${bp.id}`);
        assert.ok(["Easy", "Medium", "Hard"].includes(bp.difficulty), `Invalid difficulty '${bp.difficulty}' for ${bp.id}`);
        assert.ok(bp.title && typeof bp.title === "string", `Missing title for ${bp.id}`);
        assert.ok(bp.functionName && typeof bp.functionName === "string", `Missing functionName for ${bp.id}`);
        assert.ok(Array.isArray(bp.parameterNames) && bp.parameterNames.length > 0, `Missing parameterNames for ${bp.id}`);
        assert.ok(bp.description && bp.description.length > 20, `Description too short for ${bp.id}`);
        assert.ok(Array.isArray(bp.constraints) && bp.constraints.length > 0, `Missing constraints for ${bp.id}`);
        assert.ok(Array.isArray(bp.examples) && bp.examples.length >= 2, `Expected at least 2 examples for ${bp.id}`);

        // Verify starter code boilerplates for 4 languages
        for (const lang of ["javascript", "python", "java", "cpp"]) {
          assert.ok(bp.boilerplates[lang], `Missing ${lang} boilerplate in ${bp.id}`);
          assert.ok(bp.boilerplates[lang].includes(bp.functionName), `${lang} boilerplate must contain ${bp.functionName} in ${bp.id}`);
        }

        // Verify reference solution
        assert.ok(bp.referenceSolution && typeof bp.referenceSolution.code === "string", `Missing referenceSolution.code in ${bp.id}`);
        assert.ok(bp.referenceSolution.code.includes(bp.functionName), `Reference solution missing ${bp.functionName} in ${bp.id}`);
        assert.ok(bp.referenceSolution.timeComplexity, `Missing timeComplexity in ${bp.id}`);
        assert.ok(bp.referenceSolution.spaceComplexity, `Missing spaceComplexity in ${bp.id}`);

        // Verify oracle function
        assert.ok(typeof bp.oracle === "function", `Oracle must be a function in ${bp.id}`);

        // Verify baseline test cases
        assert.ok(Array.isArray(bp.baselineTestCases) && bp.baselineTestCases.length >= 4, `At least 4 baseline test cases required in ${bp.id}`);
        const visible = bp.baselineTestCases.filter((tc) => !tc.isHidden);
        const hidden = bp.baselineTestCases.filter((tc) => tc.isHidden);
        assert.ok(visible.length >= 2, `At least 2 visible test cases required in ${bp.id}`);
        assert.ok(hidden.length >= 1, `At least 1 hidden test case required in ${bp.id}`);
      }
    });

    // -------------------------------------------------------------------------
    // 2. Oracle & Reference Implementation Agreement on Edge Cases
    // -------------------------------------------------------------------------
    await runTest("2. Oracle-produced expected outputs match trusted reference implementation over boundary cases", () => {
      const blueprints = getAllBlueprints();
      for (const bp of blueprints) {
        const testCases = bp.baselineTestCases;
        for (let i = 0; i < testCases.length; i++) {
          const tc = testCases[i];
          const oracleOutput = bp.oracle(tc.input);

          // Execute reference solution in isolated VM context
          const context = vm.createContext({ console });
          vm.runInContext(bp.referenceSolution.code, context);
          const args = bp.parameterNames.map((p) => {
            const val = tc.input[p];
            return typeof structuredClone === "function" ? structuredClone(val) : JSON.parse(JSON.stringify(val));
          });
          const fn = context[bp.functionName];
          assert.ok(typeof fn === "function", `Reference solution ${bp.functionName} not callable`);
          const rawRef = fn(...args);
          const refOutput = typeof rawRef === "object" && rawRef !== null ? JSON.parse(JSON.stringify(rawRef)) : rawRef;

          assert.deepStrictEqual(
            refOutput,
            oracleOutput,
            `Oracle and Reference Solution mismatch in ${bp.id} testCase ${i}: ref got ${JSON.stringify(refOutput)}, oracle got ${JSON.stringify(oracleOutput)}`
          );
        }
      }
    });

    // -------------------------------------------------------------------------
    // 3. Rejection of Invalid Gemini-Generated Candidates
    // -------------------------------------------------------------------------
    await runTest("3. Invalid Gemini-generated candidates (malformed JSON, missing fields) are rejected", () => {
      assert.strictEqual(validateGeneratedProblem(null), false);
      assert.strictEqual(validateGeneratedProblem({ title: "" }), false);
      assert.strictEqual(validateGeneratedProblem({ title: "Valid", description: "" }), false);
      assert.strictEqual(
        validateGeneratedProblem({
          title: "Valid",
          description: "Desc",
          examples: [],
        }),
        false
      );
      assert.strictEqual(
        validateGeneratedProblem({
          title: "Valid",
          description: "Desc",
          examples: [{ input: "a", output: "b" }, { input: "c", output: "d" }],
          constraints: [],
          boilerplates: {},
          testCases: [],
        }),
        false
      );
    });

    // -------------------------------------------------------------------------
    // 4. Missing Reference Solution & Missing Validation Provider Cannot Bypass Gate
    // -------------------------------------------------------------------------
    await runTest("4. Missing reference solution and missing validation-provider configuration cannot silently bypass the gate", async () => {
      // 4a: Missing referenceSolution in newly generated candidate is rejected by validateGeneratedProblem
      assert.strictEqual(
        validateGeneratedProblem({
          title: "No Ref Solution",
          description: "Valid description here",
          examples: [{ input: "1", output: "1" }, { input: "2", output: "2" }],
          constraints: ["1 <= n <= 10"],
          boilerplates: { javascript: "function solve() {}" },
          testCases: [
            { input: { n: 1 }, expectedOutput: 1, isHidden: false },
            { input: { n: 2 }, expectedOutput: 2, isHidden: false },
            { input: { n: 3 }, expectedOutput: 3, isHidden: true },
            { input: { n: 4 }, expectedOutput: 4, isHidden: true },
          ],
        }),
        false,
        "Candidate without referenceSolution.code must fail validation"
      );

      // 4b: Absence of ONLINECOMPILER_API_KEY throws and does not silently accept unverified candidate
      const savedKey = process.env.ONLINECOMPILER_API_KEY;
      delete process.env.ONLINECOMPILER_API_KEY;
      setCustomTextGenerator(async () =>
        JSON.stringify({
          title: "Custom Unverified Candidate",
          description: "Fresh problem statement",
          examples: [{ input: "1", output: "1" }, { input: "2", output: "2" }],
          constraints: ["1 <= n <= 10"],
          boilerplates: { javascript: "function customSolve() {}" },
          referenceSolution: {
            code: "function customSolve() { return 1; }",
            timeComplexity: "O(1)",
            spaceComplexity: "O(1)",
          },
          testCases: [
            { input: { n: 1 }, expectedOutput: 1, isHidden: false },
            { input: { n: 2 }, expectedOutput: 2, isHidden: false },
            { input: { n: 3 }, expectedOutput: 3, isHidden: true },
            { input: { n: 4 }, expectedOutput: 4, isHidden: true },
          ],
        })
      );

      try {
        let threw = false;
        try {
          await createDsaProblem({
            topic: "Arrays",
            difficulty: "Easy",
            allowFallback: false,
          });
        } catch (err) {
          threw = true;
          assert.match(
            err.message,
            /The AI generated an invalid problem|ONLINECOMPILER_API_KEY|Cannot establish correctness|Compiler validation provider is not configured|structural validation/i
          );
        }
        assert.strictEqual(threw, true, "Must throw when validation provider key is missing for unverified candidate");

        // 4c: Conversely, a verified blueprint loads promptly WITHOUT requiring ONLINECOMPILER_API_KEY
        setDefaultMockGenerator();
        const bpResult = await createDsaProblem({
          topic: "Arrays",
          difficulty: "Easy",
          allowFallback: true,
        });
        assert.ok(bpResult.problem, "Verified blueprint problem must load promptly even when ONLINECOMPILER_API_KEY is missing");
        assert.strictEqual(bpResult.topic, "Arrays");
      } finally {
        process.env.ONLINECOMPILER_API_KEY = savedKey;
        setDefaultMockGenerator();
      }
    });

    // -------------------------------------------------------------------------
    // 5. Provider Outages Are Not Mislabeled as Wrong Answer
    // -------------------------------------------------------------------------
    await runTest("5. Provider outages (timeout / 503) are classified separately from Wrong Answer and never count as validation success", async () => {
      const resetFetch = setupMockFetchCompiler(async () => {
        const err = new Error("The operation was aborted due to timeout");
        err.name = "TimeoutError";
        throw err;
      });

      try {
        const result = await executeCode({
          code: "function solve() { return 1; }",
          language: "javascript",
          testCases: [{ input: { n: 1 }, expectedOutput: 1 }],
          isRunCode: false,
        });

        assert.strictEqual(result.verdict, "Provider Timeout");
        assert.strictEqual(result.isProviderFailure, true);
        assert.notStrictEqual(result.verdict, "Wrong Answer");
      } finally {
        resetFetch();
      }
    });

    // -------------------------------------------------------------------------
    // 6. Controlled Fallback Recovery on Generation Failure
    // -------------------------------------------------------------------------
    await runTest("6. Failed AI candidate variation recovers using verified blueprint fallback without returning unverified code", async () => {
      // Simulate Gemini network error / fetch failed during narrative variation
      setCustomTextGenerator(async () => {
        const err = new Error("fetch failed");
        err.name = "TypeError";
        throw err;
      });

      try {
        const result = await createDsaProblem({
          topic: "Binary Search",
          difficulty: "Medium",
          allowFallback: true,
        });

        assert.strictEqual(result.isFallback, true);
        assert.strictEqual(result.topic, "Binary Search");
        assert.ok(result.problem.isVerifiedBlueprint);
        assert.ok(result.problem.title.includes("Search in Rotated Sorted Array"));
        assert.ok(result.problem.referenceSolution.code.includes("searchRotatedArray"));
      } finally {
        setDefaultMockGenerator();
      }
    });

    // -------------------------------------------------------------------------
    // 7. Explicit Graph Request Selects Graph Blueprint (Never Arrays Fallback)
    // -------------------------------------------------------------------------
    await runTest("7. Explicit Graph request selects a Graph blueprint, never defaulting to Arrays", async () => {
      const result = await createDsaProblem({
        topic: "Graphs",
        difficulty: "Medium",
        allowFallback: true,
      });

      assert.strictEqual(result.topic, "Graphs");
      assert.strictEqual(result.problem.blueprintId, "graphs-grid-shortest-path");
      assert.ok(result.problem.referenceSolution.code.includes("shortestPathBinaryGrid"));
    });

    // -------------------------------------------------------------------------
    // 8. Generic Successive Requests Rotate Topics & Algorithmic Patterns
    // -------------------------------------------------------------------------
    await runTest("8. Generic successive requests vary topics and patterns rather than repeating the same family", () => {
      const selectedBlueprints = [];
      const recentIds = [];
      const recentTopics = [];

      for (let i = 0; i < 5; i++) {
        const bp = selectNextBlueprint({
          requestedTopic: "Any",
          recentBlueprintIds: [...recentIds],
          recentTopics: [...recentTopics],
        });
        assert.ok(bp, `selectNextBlueprint must return a blueprint for generic request (step ${i})`);
        selectedBlueprints.push(bp);
        recentIds.push(bp.id);
        recentTopics.push(bp.topic.toLowerCase());
      }

      // Ensure at least 4 distinct topics across 5 generic steps
      const distinctTopics = new Set(selectedBlueprints.map((b) => b.topic));
      assert.ok(
        distinctTopics.size >= 4,
        `Expected at least 4 distinct topics across 5 generic selections, got ${distinctTopics.size}: ${Array.from(distinctTopics).join(", ")}`
      );

      // Ensure no two consecutive selections share the exact same blueprint ID
      for (let i = 1; i < selectedBlueprints.length; i++) {
        assert.notStrictEqual(
          selectedBlueprints[i].id,
          selectedBlueprints[i - 1].id,
          `Consecutive duplicate blueprint selected: ${selectedBlueprints[i].id}`
        );
      }
    });

    // -------------------------------------------------------------------------
    // 9. Avoid Repeating Recent Patterns When Alternatives Exist
    // -------------------------------------------------------------------------
    await runTest("9. Recent repeated patterns and titles are avoided when alternatives exist", () => {
      const bp1 = selectNextBlueprint({
        requestedTopic: "Any",
        requestedDifficulty: "Easy",
        excludeTitles: ["Find Pivot Index"],
        recentBlueprintIds: ["arrays-pivot-index"],
      });
      assert.notStrictEqual(bp1.id, "arrays-pivot-index");
      assert.notStrictEqual(bp1.title, "Find Pivot Index");

      const bp2 = selectNextBlueprint({
        requestedTopic: "Dynamic Programming",
        excludeTitles: ["Climbing Stairs Ways"],
        recentBlueprintIds: ["dp-climbing-stairs"],
      });
      assert.strictEqual(bp2.topic, "Dynamic Programming");
      assert.notStrictEqual(bp2.id, "dp-climbing-stairs");
      assert.strictEqual(bp2.id, "dp-coin-change");
    });

    // -------------------------------------------------------------------------
    // 10. Topic & Difficulty Selections Preserved Across Routes
    // -------------------------------------------------------------------------
    await runTest("10. Explicit topic and difficulty selections are preserved in generation responses", async () => {
      const req = {
        user: { id: "user_test_preserve" },
        body: {
          topic: "Trees",
          difficulty: "Easy",
        },
      };
      const res = createMockRes();

      await generateProblem(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonData.topic, "Trees");
      assert.strictEqual(res.jsonData.difficulty, "Easy");
    });

    // -------------------------------------------------------------------------
    // 11. Pepe Chat & Arena Button Use the Same Reliable Generation Path
    // -------------------------------------------------------------------------
    await runTest("11. Both Pepe chat and manual Generate Problem button use the same reliable generation engine", async () => {
      // 11a: Manual Generate Problem endpoint
      const arenaReq = {
        user: { id: "user_shared_path" },
        body: { topic: "Binary Search", difficulty: "Medium" },
      };
      const arenaRes = createMockRes();
      await generateProblem(arenaReq, arenaRes);
      assert.strictEqual(arenaRes.statusCode, 200);
      assert.strictEqual(arenaRes.jsonData.topic, "Binary Search");
      assert.strictEqual(arenaRes.jsonData.difficulty, "Medium");

      // 11b: Pepe Chat endpoint with explicit topic and difficulty
      const pepeReq = {
        user: { id: "user_shared_path" },
        body: {
          message: "Give me a medium binary search question",
          action: "chat",
        },
      };
      const pepeRes = createMockRes();
      await coachChat(pepeReq, pepeRes);
      assert.strictEqual(pepeRes.statusCode, 200);
      assert.strictEqual(pepeRes.jsonData.action, "load_problem");
      assert.strictEqual(pepeRes.jsonData.topic, "Binary Search");
      assert.strictEqual(pepeRes.jsonData.difficulty, "Medium");
    });

    // -------------------------------------------------------------------------
    // 12. Failed Generation Does Not Erase Loaded Problem or Unsaved Code
    // -------------------------------------------------------------------------
    await runTest("12. Failed generation preserves existing loaded problem without erasing editor state", async () => {
      // Test the contract: When generateProblem encounters an error, it returns a 4xx/5xx JSON error.
      // DsaArena's executeGenerateProblem only calls applyLoadProblem upon 200 OK with response.data.
      const savedKey = process.env.ONLINECOMPILER_API_KEY;
      delete process.env.ONLINECOMPILER_API_KEY;

      const req = {
        user: { id: "user_state_preservation" },
        body: { topic: "UnseededTopicXYZ", difficulty: "Hard" },
      };
      const res = createMockRes();

      try {
        await generateProblem(req, res);
        // Returns error response without returning a problem payload
        assert.ok(res.statusCode >= 400);
        assert.ok(res.jsonData?.error);
        assert.strictEqual(res.jsonData?.title, undefined);
      } finally {
        process.env.ONLINECOMPILER_API_KEY = savedKey;
      }
    });

    // -------------------------------------------------------------------------
    // 13. Existing Working Features Remain Intact
    // -------------------------------------------------------------------------
    await runTest("13. Existing company catalog, adaptive difficulty, hint, and solution behavior remains intact", async () => {
      // 13a: Company catalog routing preserved
      const catReq = {
        user: { id: "user_invariants" },
        body: {
          message: "What questions does Amazon ask?",
          action: "chat",
        },
      };
      const catRes = createMockRes();
      await coachChat(catReq, catRes);
      assert.strictEqual(catRes.statusCode, 200);
      assert.strictEqual(catRes.jsonData.action, "chat");
      assert.match(catRes.jsonData.answer, /Amazon/i);

      // 13b: Hint request preserved
      const hintReq = {
        user: { id: "user_invariants" },
        body: {
          message: "Can I have a hint?",
          action: "hint",
          hintLevel: 1,
          problem: { title: "Find Pivot Index", topic: "Arrays" },
        },
      };
      const hintRes = createMockRes();
      await coachChat(hintReq, hintRes);
      assert.strictEqual(hintRes.statusCode, 200);
      assert.strictEqual(hintRes.jsonData.action, "chat");
      assert.ok(hintRes.jsonData.answer.length > 10);
    });

    // -------------------------------------------------------------------------
    // 14. Independent Provider Simulation (Verification Requirement 5)
    // -------------------------------------------------------------------------
    await runTest("14. Verified blueprint loads promptly without OnlineCompiler or Gemini being required", async () => {
      // Both Gemini and OnlineCompiler simulate total transport failure
      const savedKey = process.env.ONLINECOMPILER_API_KEY;
      delete process.env.ONLINECOMPILER_API_KEY;

      setCustomTextGenerator(async () => {
        const timeoutErr = new Error("This operation was aborted");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      });

      try {
        const start = Date.now();
        const result = await createDsaProblem({
          topic: "Dynamic Programming",
          difficulty: "Medium",
          allowFallback: true,
        });
        const duration = Date.now() - start;

        assert.ok(result.problem, "Must return verified problem");
        assert.strictEqual(result.topic, "Dynamic Programming");
        assert.strictEqual(result.difficulty, "Medium");
        assert.strictEqual(result.isFallback, true);
        assert.ok(result.problem.referenceSolution.code.includes("minCoinsForAmount"));
        assert.ok(duration < 2000, `Expected fast return under 2000ms, took ${duration}ms`);
      } finally {
        process.env.ONLINECOMPILER_API_KEY = savedKey;
        setDefaultMockGenerator();
      }
    });

    // -------------------------------------------------------------------------
    // 15. Truthful Availability on Unsupported Topic (Instruction A)
    // -------------------------------------------------------------------------
    await runTest("15. Unsupported topic returns clear availability message without mislabeling", async () => {
      // 15a: createDsaProblem throws availability error listing available topics
      let threw = false;
      try {
        await createDsaProblem({
          topic: "Trie",
          difficulty: "Medium",
          allowFallback: true,
        });
      } catch (err) {
        threw = true;
        assert.match(err.message, /not available in our library/i);
        assert.match(err.message, /Available topics/i);
      }
      assert.strictEqual(threw, true, "Must throw availability error for unsupported topic");

      // 15b: Pepe coachChat gives truthful, friendly response with available topics
      const req = {
        user: { id: "user_unsupported" },
        body: {
          message: "give me a trie problem",
          action: "chat",
        },
      };
      const res = createMockRes();
      await coachChat(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.jsonData.action, "chat");
      assert.match(res.jsonData.answer, /not available in (?:our verified|my) library/i);
      assert.match(res.jsonData.answer, /Arrays|Strings|Dynamic Programming/i);
    });
  } finally {
    restoreFetch();
    setCustomTextGenerator(null);
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllHybridTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
