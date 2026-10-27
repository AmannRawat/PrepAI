import "dotenv/config";
import assert from "node:assert/strict";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";

import {
  evaluateProblemConsistency,
  verifyReferenceSolutionMatchesTestCases,
  isUnorderedContract,
  unorderedValuesEqual,
  extractPrimaryFunctionName,
  extractParameterNames,
  mapArgumentsToParameters,
  createDsaProblem,
  validateGeneratedProblem,
  applyRepairPatch,
} from "../controllers/dsa.controller.js";
import {
  setCustomTextGenerator,
  resetFailoverState,
} from "../services/gemini.service.js";
import {
  extractJson,
  JsonExtractionError,
} from "../utils/extractJson.js";

console.log("=================================================");
console.log("  DSA CONSISTENCY GATE & REPAIR REGRESSION SUITE ");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helper template for standard valid candidate
function buildProblemFixture(overrides = {}) {
  const base = {
    title: "Count Substring Occurrences",
    description: "Given a string s and a target char c, count occurrences.",
    examples: [
      { input: "s = 'abc', c = 'a'", output: "1", explanation: "One occurrence." },
      { input: "s = 'aaa', c = 'a'", output: "3", explanation: "Three occurrences." },
    ],
    constraints: ["1 <= s.length <= 100"],
    boilerplates: {
      javascript: "function countChar(s, c) {\n  return 0;\n}",
      python: "def count_char(s, c):\n    return 0",
      java: "class Solution { public int countChar(String s, char c) { return 0; } }",
      cpp: "class Solution { public: int countChar(string s, char c) { return 0; } };",
    },
    referenceSolution: {
      code: "function countChar(s, c) {\n  let cnt = 0;\n  for (let i = 0; i < s.length; i++) {\n    if (s[i] === c) cnt++;\n  }\n  return cnt;\n}",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
    testCases: [
      { input: { s: "hello", c: "l" }, expectedOutput: 2, isHidden: false },
      { input: { s: "world", c: "o" }, expectedOutput: 1, isHidden: false },
      { input: { s: "test", c: "x" }, expectedOutput: 0, isHidden: true },
      { input: { s: "aaaa", c: "a" }, expectedOutput: 4, isHidden: true },
    ],
  };

  return { ...base, ...overrides };
}

async function runAllTests() {
  // Test 1: Correct reference solution and correct expected output
  await runTest("1. Correct reference solution & expected output passes consistency evaluation", async () => {
    const fixture = buildProblemFixture();
    const report = evaluateProblemConsistency(fixture);
    assert.strictEqual(report.isValid, true);
    assert.strictEqual(report.failingCases.length, 0);
    assert.strictEqual(verifyReferenceSolutionMatchesTestCases(fixture), true);
  });

  // Test 2: Incorrect reference solution fails and reports failure details
  await runTest("2. Defective reference solution is rejected with root-cause reason", async () => {
    const fixture = buildProblemFixture({
      referenceSolution: {
        code: "function countChar(s, c) {\n  return -1; // buggy\n}",
        timeComplexity: "O(1)",
        spaceComplexity: "O(1)",
      },
    });
    const report = evaluateProblemConsistency(fixture);
    assert.strictEqual(report.isValid, false);
    assert.ok(report.failingCases.length > 0);
    assert.strictEqual(report.failingCases[0].actualOutput, -1);
    assert.strictEqual(verifyReferenceSolutionMatchesTestCases(fixture), false);
  });

  // Test 3: Incorrect expected output in test cases is rejected
  await runTest("3. Incorrect expected output in testCase 0 is caught", async () => {
    const fixture = buildProblemFixture({
      testCases: [
        { input: { s: "hello", c: "l" }, expectedOutput: 999, isHidden: false }, // wrong
        { input: { s: "world", c: "o" }, expectedOutput: 1, isHidden: false },
        { input: { s: "test", c: "x" }, expectedOutput: 0, isHidden: true },
        { input: { s: "aaaa", c: "a" }, expectedOutput: 4, isHidden: true },
      ],
    });
    const report = evaluateProblemConsistency(fixture);
    assert.strictEqual(report.isValid, false);
    assert.strictEqual(report.failingCases[0].testCaseIndex, 0);
    assert.strictEqual(report.failingCases[0].expectedOutput, 999);
    assert.strictEqual(report.failingCases[0].actualOutput, 2);
  });

  // Test 4: Valid empty-string output versus execution failure / undefined
  await runTest("4. Valid empty-string output passes; undefined / execution failure fails", async () => {
    const emptyStringProblem = {
      title: "Remove Vowels",
      description: "Remove all vowels from string s.",
      boilerplates: {
        javascript: "function removeVowels(s) {\n  return '';\n}",
      },
      referenceSolution: {
        code: "function removeVowels(s) {\n  return s.replace(/[aeiou]/gi, '');\n}",
      },
      testCases: [
        { input: { s: "aeiou" }, expectedOutput: "", isHidden: false },
        { input: { s: "bcd" }, expectedOutput: "bcd", isHidden: false },
      ],
    };
    const reportValid = evaluateProblemConsistency(emptyStringProblem);
    assert.strictEqual(reportValid.isValid, true);

    const undefinedProblem = {
      ...emptyStringProblem,
      referenceSolution: {
        code: "function removeVowels(s) {\n  // Missing return statement\n}",
      },
    };
    const reportUndefined = evaluateProblemConsistency(undefinedProblem);
    assert.strictEqual(reportUndefined.isValid, false);
    assert.ok(reportUndefined.failingCases[0].reason.includes("undefined"));
  });

  // Test 5: Numeric and string comparison respects strict types
  await runTest("5. Numeric and string comparisons do not falsely coerce types", async () => {
    const typeMismatchProblem = {
      title: "Get Value",
      boilerplates: {
        javascript: "function getValue() {\n  return 15;\n}",
      },
      referenceSolution: {
        code: "function getValue() {\n  return '15'; // string instead of number\n}",
      },
      testCases: [
        { input: {}, expectedOutput: 15, isHidden: false },
      ],
    };
    const report = evaluateProblemConsistency(typeMismatchProblem);
    assert.strictEqual(report.isValid, false);
    assert.strictEqual(report.failingCases[0].actualOutput, "15");
    assert.strictEqual(report.failingCases[0].expectedOutput, 15);
  });

  // Test 6: Ordered arrays vs genuinely unordered outputs
  await runTest("6. Ordered arrays reject reversed output; unordered contracts accept permitted permutations", async () => {
    const strictOrderProblem = {
      title: "Sorted Two Sum Indices",
      description: "Return the indices in ascending order.",
      boilerplates: {
        javascript: "function twoSum(nums) { return []; }",
      },
      referenceSolution: {
        code: "function twoSum(nums) { return [20, 5]; }",
      },
      testCases: [
        { input: { nums: [1] }, expectedOutput: [5, 20], isHidden: false },
      ],
    };
    assert.strictEqual(isUnorderedContract(strictOrderProblem.description, strictOrderProblem.title), false);
    const reportStrict = evaluateProblemConsistency(strictOrderProblem);
    assert.strictEqual(reportStrict.isValid, false);

    const unorderedProblem = {
      title: "Two Sum Pairs",
      description: "Find two numbers. You may return the answer in any order.",
      boilerplates: {
        javascript: "function twoSum(nums) { return []; }",
      },
      referenceSolution: {
        code: "function twoSum(nums) { return [20, 5]; }",
      },
      testCases: [
        { input: { nums: [1] }, expectedOutput: [5, 20], isHidden: false },
      ],
    };
    assert.strictEqual(isUnorderedContract(unorderedProblem.description, unorderedProblem.title), true);
    const reportUnordered = evaluateProblemConsistency(unorderedProblem);
    assert.strictEqual(reportUnordered.isValid, true);
    assert.strictEqual(unorderedValuesEqual([20, 5], [5, 20]), true);
  });

  // Test 7: Nested JSON structures compare correctly
  await runTest("7. Nested JSON structures (matrices and records) compare correctly", async () => {
    const matrixProblem = {
      title: "Rotate Matrix",
      boilerplates: {
        javascript: "function rotateMatrix(mat) { return mat; }",
      },
      referenceSolution: {
        code: "function rotateMatrix(mat) {\n  return mat.map(row => [...row].reverse());\n}",
      },
      testCases: [
        {
          input: { mat: [[1, 2], [3, 4]] },
          expectedOutput: [[2, 1], [4, 3]],
          isHidden: false,
        },
      ],
    };
    const report = evaluateProblemConsistency(matrixProblem);
    assert.strictEqual(report.isValid, true);
  });

  // Test 8: Compilation errors and runtime errors are isolated and reported accurately
  await runTest("8. Syntax and runtime errors in reference solution are captured safely", async () => {
    const syntaxProblem = {
      title: "Syntax Error Problem",
      referenceSolution: { code: "function broken() { if (true " },
      testCases: [{ input: {}, expectedOutput: 1 }],
    };
    const syntaxReport = evaluateProblemConsistency(syntaxProblem);
    assert.strictEqual(syntaxReport.isValid, false);
    assert.ok(syntaxReport.compilationError);

    const runtimeProblem = {
      title: "Runtime Error Problem",
      referenceSolution: {
        code: "function crash(obj) { return obj.subProperty.nonExistent(); }",
      },
      testCases: [{ input: { obj: null }, expectedOutput: 1 }],
    };
    const runtimeReport = evaluateProblemConsistency(runtimeProblem);
    assert.strictEqual(runtimeReport.isValid, false);
    assert.ok(runtimeReport.failingCases[0].reason.includes("Runtime error"));
  });

  // Test 9: Sandbox security guardrails block forbidden execution tokens
  await runTest("9. Sandbox security guardrail blocks process, require, and prototype pollution", async () => {
    const dangerousProblem = {
      title: "Malicious Attempt",
      referenceSolution: {
        code: "function solve() { return process.exit(1); }",
      },
      testCases: [{ input: {}, expectedOutput: 1 }],
    };
    const report = evaluateProblemConsistency(dangerousProblem);
    assert.strictEqual(report.isValid, false);
    assert.ok(report.compilationError.includes("Security violation"));
  });

  // Test 10: extractJson parses clean JSON and handles markdown-fenced JSON with surrounding text
  await runTest("10. extractJson handles markdown fences, surrounding text, and balanced braces", async () => {
    const fencedText = `Here is the diagnosis and fix:
\`\`\`json
{
  "diagnosis": "Off by one error in loop",
  "patchType": "code",
  "referenceSolutionCode": "function solve() { return { value: 42 }; }"
}
\`\`\`
Hope this helps!`;

    const parsed = extractJson(fencedText);
    assert.strictEqual(parsed.diagnosis, "Off by one error in loop");
    assert.strictEqual(parsed.patchType, "code");
    assert.ok(parsed.referenceSolutionCode.includes("42"));
  });

  // Test 11: extractJson handles unescaped regex escapes (\s, \d) and newlines inside code strings
  await runTest("11. extractJson non-destructively repairs bad string escapes (\\s, \\d) and raw newlines", async () => {
    // Model outputs raw \s and \d inside regex string, which normally triggers "Bad escaped character in JSON"
    const rawModelOutput = `{"code": "function clean(s) { return s.replace(/\\s+/g, '').replace(/\\d+/g, ''); }", "value": 1}`;
    const parsed = extractJson(rawModelOutput);
    assert.strictEqual(parsed.value, 1);
    assert.ok(parsed.code.includes("replace"));

    // Code with literal newlines inside string literal
    const rawWithNewlines = '{\n  "patchType": "code",\n  "referenceSolutionCode": "function test() {\n    return true;\n  }"\n}';
    const parsedNewlines = extractJson(rawWithNewlines);
    assert.strictEqual(parsedNewlines.patchType, "code");
    assert.ok(parsedNewlines.referenceSolutionCode.includes("return true;"));
  });

  // Test 12: extractJson throws typed JsonExtractionError with redacted snippet on invalid JSON
  await runTest("12. extractJson throws typed JsonExtractionError on unrecoverable input without leaking secrets", async () => {
    const textWithSecret = 'AIzaSyFakeKey1234567890abcdefghijklmnop Not a JSON object at all';
    try {
      extractJson(textWithSecret);
      assert.fail("Should have thrown JsonExtractionError");
    } catch (err) {
      assert.ok(err instanceof JsonExtractionError);
      assert.strictEqual(err.name, "JsonExtractionError");
      assert.ok(!err.message.includes("AIzaSyFakeKey"), "Must not leak API key in error message");
      if (err.rawSnippet) {
        assert.ok(!err.rawSnippet.includes("AIzaSyFakeKey"), "Must redact API key in rawSnippet");
      }
    }
  });

  // Test 13: applyRepairPatch merges constrained patches correctly
  await runTest("13. applyRepairPatch cleanly merges code, testCases, and both without corrupting candidate", async () => {
    const candidate = buildProblemFixture();

    // 13a: Code patch only
    const codePatch = {
      patchType: "code",
      referenceSolutionCode: "function countChar(s, c) { return 99; }",
    };
    const repairedCode = applyRepairPatch(candidate, codePatch);
    assert.strictEqual(repairedCode.referenceSolution.code, "function countChar(s, c) { return 99; }");
    assert.strictEqual(repairedCode.testCases.length, 4);
    assert.strictEqual(repairedCode.testCases[0].expectedOutput, 2);

    // 13b: TestCase patch only
    const tcPatch = {
      patchType: "testCases",
      correctedOutputs: [
        { testCaseIndex: 0, expectedOutput: 100 },
        { testCaseIndex: 3, expectedOutput: 400 },
      ],
    };
    const repairedTc = applyRepairPatch(candidate, tcPatch);
    assert.strictEqual(repairedTc.testCases[0].expectedOutput, 100);
    assert.strictEqual(repairedTc.testCases[3].expectedOutput, 400);
    assert.strictEqual(repairedTc.testCases[1].expectedOutput, 1); // unchanged
    assert.ok(repairedTc.referenceSolution.code.includes("cnt++")); // code preserved

    // 13c: Full problem backward compatibility
    const fullProblem = buildProblemFixture({ title: "Completely Fresh Title" });
    const repairedFull = applyRepairPatch(candidate, fullProblem);
    assert.strictEqual(repairedFull.title, "Completely Fresh Title");
  });

  // Test 14: Invalid candidate is repaired via constrained repair patch and passes
  await runTest("14. Invalid candidate is repaired via constrained JSON patch and accepted", async () => {
    const invalidCandidate = buildProblemFixture({
      testCases: [
        { input: { s: "hello", c: "l" }, expectedOutput: 999, isHidden: false }, // wrong
        { input: { s: "world", c: "o" }, expectedOutput: 1, isHidden: false },
        { input: { s: "test", c: "x" }, expectedOutput: 0, isHidden: true },
        { input: { s: "aaaa", c: "a" }, expectedOutput: 4, isHidden: true },
      ],
    });

    const constrainedPatch = {
      diagnosis: "Test case 0 had incorrect expectedOutput 999 instead of 2",
      patchType: "testCases",
      correctedOutputs: [
        { testCaseIndex: 0, expectedOutput: 2 },
      ],
    };

    let repairCalled = false;
    setCustomTextGenerator(async (prompt, options) => {
      if (options?.stage === "problem_repair") {
        repairCalled = true;
        // Return fenced JSON with markdown
        return "```json\n" + JSON.stringify(constrainedPatch) + "\n```";
      }
      return JSON.stringify(invalidCandidate);
    });

    const result = await createDsaProblem({
      topic: "Strings",
      difficulty: "Easy",
      allowFallback: false,
    });

    assert.strictEqual(repairCalled, true, "Targeted repair should have been invoked");
    assert.strictEqual(result.isFallback, false);
    assert.strictEqual(result.problem.testCases[0].expectedOutput, 2);

    resetFailoverState();
  });

  // Test 15: Repaired candidate that still fails consistency validation is rejected
  await runTest("15. Repaired candidate that remains inconsistent is rejected without false claims", async () => {
    const brokenCandidate = buildProblemFixture({
      referenceSolution: {
        code: "function countChar(s, c) { return -1; }",
      },
    });

    const ineffectivePatch = {
      diagnosis: "Tried to fix but still buggy",
      patchType: "code",
      referenceSolutionCode: "function countChar(s, c) { return -2; }",
    };

    setCustomTextGenerator(async (prompt, options) => {
      if (options?.stage === "problem_repair") {
        return JSON.stringify(ineffectivePatch);
      }
      return JSON.stringify(brokenCandidate);
    });

    await assert.rejects(
      async () => {
        await createDsaProblem({
          topic: "Strings",
          difficulty: "Easy",
          allowFallback: false,
        });
      },
      /Generated problem failed consistency validation/
    );

    resetFailoverState();
  });

  // Test 16: Malformed repair output fails repair gracefully and falls back to verified blueprint
  await runTest("16. Malformed JSON in repair response fails safely and delivers accurate fallback metadata", async () => {
    const brokenCandidate = buildProblemFixture({
      referenceSolution: {
        code: "function countChar(s, c) { return -1; }",
      },
    });

    setCustomTextGenerator(async (prompt, options) => {
      if (options?.stage === "problem_repair") {
        // Unrecoverable malformed output
        return "Here is what I think: { not a json at all ::: ";
      }
      return JSON.stringify(brokenCandidate);
    });

    const res = await createDsaProblem({
      topic: "Arrays",
      difficulty: "Easy",
      allowFallback: true,
      recentTitles: [],
      recentBlueprints: [],
      recentTopics: [],
    });

    assert.strictEqual(res.isFallback, true);
    assert.ok(res.blueprintId);
    assert.ok(res.fallbackReason.includes("consistency validation"));

    resetFailoverState();
  });

  console.log("\n=================================================");
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
