import assert from "node:assert/strict";
import {
  getAllBlueprints,
  buildCanonicalProblemFromBlueprint,
} from "../services/dsaBlueprints.js";
import {
  evaluateProblemCorrectness,
  compileJsSolution,
} from "../services/correctnessEvaluator.js";
import { verifyReferenceSolutionMatchesTestCases } from "../controllers/dsa.controller.js";

console.log("=================================================");
console.log("  STAGE 3: DSA CORRECTNESS EVALUATION SUITE      ");
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

async function runAllCorrectnessEvaluationTests() {
  const blueprints = getAllBlueprints();

  // Test 1: All verified blueprints pass 5-point ground-truth evaluation
  await runTest(
    "1. All verified blueprints pass full 5-point ground-truth correctness evaluation",
    async () => {
      for (const bp of blueprints) {
        const canonicalProblem = buildCanonicalProblemFromBlueprint(bp);
        const report = evaluateProblemCorrectness(canonicalProblem, {
          trustedBlueprint: bp,
        });

        assert.strictEqual(
          report.verified,
          true,
          `Blueprint ${bp.id} failed correctness evaluation: ${JSON.stringify(report.details)}`
        );
        assert.strictEqual(report.checks.statementConsistency, true);
        assert.strictEqual(report.checks.referenceSolutionCorrectness, true);
        assert.strictEqual(report.checks.boundaryConditionsAgreement, true);
        assert.strictEqual(report.checks.deliberateDefectDetection, true);
        assert.strictEqual(report.checks.oracleReferenceAgreement, true);
      }
    }
  );

  // Test 2: Problem statement and expected-output consistency
  await runTest(
    "2. Problem statement examples and expected outputs match trusted oracle",
    async () => {
      const pivotBp = blueprints.find((b) => b.id === "arrays-pivot-index");
      const canonical = buildCanonicalProblemFromBlueprint(pivotBp);

      // Mutate a test case with an incorrect expected output
      const corruptedProblem = {
        ...canonical,
        testCases: canonical.testCases.map((tc, idx) =>
          idx === 0 ? { ...tc, expectedOutput: 9999 } : tc
        ),
      };

      const report = evaluateProblemCorrectness(corruptedProblem, {
        trustedBlueprint: pivotBp,
      });

      assert.strictEqual(report.verified, false);
      assert.strictEqual(report.checks.statementConsistency, false);
      assert.ok(
        report.details.some((d) => d.includes("expectedOutput mismatch")),
        "Should flag expectedOutput mismatch against oracle"
      );
    }
  );

  // Test 3: Reference solution behavior against trusted test cases
  await runTest(
    "3. Defective reference solutions are rejected by trusted test cases",
    async () => {
      const subArrayBp = blueprints.find((b) => b.id === "arrays-maximum-subarray");
      const canonical = buildCanonicalProblemFromBlueprint(subArrayBp);

      // Reference solution that always returns 0
      const defectiveProblem = {
        ...canonical,
        referenceSolution: {
          code: "function maxSubArray(nums) { return 0; }",
        },
      };

      const report = evaluateProblemCorrectness(defectiveProblem, {
        trustedBlueprint: subArrayBp,
      });

      assert.strictEqual(report.verified, false);
      assert.strictEqual(report.checks.referenceSolutionCorrectness, false);
    }
  );

  // Test 4: Boundary conditions and edge cases agreement
  await runTest(
    "4. Boundary conditions and extreme edge cases agree between oracle and reference",
    async () => {
      const dpBp = blueprints.find((b) => b.id === "dp-coin-change");
      const canonical = buildCanonicalProblemFromBlueprint(dpBp);

      const report = evaluateProblemCorrectness(canonical, {
        trustedBlueprint: dpBp,
      });

      assert.strictEqual(report.checks.boundaryConditionsAgreement, true);
      assert.ok(
        report.defectsCaught.includes(
          "Greedy Coin Selector (Fails when greedy is non-optimal)"
        ),
        "Must verify that greedy heuristic is caught as defective on boundary cases"
      );
    }
  );

  // Test 5: Deliberately incorrect solutions MUST fail test cases
  await runTest(
    "5. Deliberately incorrect solutions (adjacent-only, reusers, parity) are detected and fail",
    async () => {
      const testedBlueprints = [
        "arrays-pivot-index",
        "arrays-maximum-subarray",
        "hashmap-pair-sum",
        "stack-balanced-brackets",
        "dp-coin-change",
      ];

      for (const bpId of testedBlueprints) {
        const bp = blueprints.find((b) => b.id === bpId);
        const canonical = buildCanonicalProblemFromBlueprint(bp);
        const report = evaluateProblemCorrectness(canonical, {
          trustedBlueprint: bp,
        });

        assert.strictEqual(
          report.checks.deliberateDefectDetection,
          true,
          `Failed to detect all defects in ${bpId}`
        );
        assert.ok(
          report.defectsCaught.length >= 2,
          `Expected at least 2 defects caught for ${bpId}, got ${report.defectsCaught.length}`
        );
      }
    }
  );

  // Test 6: Untrusted / AI-generated problem without ground truth is reported as unverified
  await runTest(
    "6. Problem without trusted ground truth reports unverified status without inventing claims",
    async () => {
      const aiGeneratedProblem = {
        title: "Novel Complex Matrix Path Variation",
        description: "Find a path in a custom matrix satisfying arbitrary conditions.",
        boilerplates: {
          javascript: "function customPath() {}",
        },
        referenceSolution: {
          code: "function customPath() { return 42; }",
        },
        testCases: [
          { input: { grid: [[1, 2], [3, 4]] }, expectedOutput: 42, isHidden: false },
          { input: { grid: [[5, 6], [7, 8]] }, expectedOutput: 42, isHidden: true },
        ],
      };

      const report = evaluateProblemCorrectness(aiGeneratedProblem);

      assert.strictEqual(report.status, "unverified");
      assert.strictEqual(report.verified, false);
      assert.ok(
        report.reason.includes("Correctness is unverified"),
        "Must explicitly report that correctness is unverified"
      );
    }
  );

  // Test 7: Regression: Frequent Element Pair Distance contradiction is caught and rejected
  await runTest(
    "7. Regression: Frequent Element Pair Distance contradiction (reference returns 3, expectedOutput 2) is rejected",
    async () => {
      const inconsistentProblem = {
        title: "Frequent Element Pair Distance",
        description: "Given an array of integers nums and an integer k, find the maximum distance between two occurrences of the most frequent element such that the number of elements strictly between those two occurrences is less than or equal to k.",
        boilerplates: {
          javascript: "function maxFrequentPairDistance(nums, k) {\n  // Your code here\n}",
        },
        referenceSolution: {
          code: `function maxFrequentPairDistance(nums, k) {
  const counts = new Map();
  for (const num of nums) {
    counts.set(num, (counts.get(num) || 0) + 1);
  }
  let maxFreq = 0;
  for (const count of counts.values()) {
    if (count > maxFreq) maxFreq = count;
  }
  const positions = new Map();
  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    if (counts.get(num) === maxFreq) {
      if (!positions.has(num)) positions.set(num, []);
      positions.get(num).push(i);
    }
  }
  let maxDist = 0;
  for (const [num, indices] of positions.entries()) {
    let left = 0;
    for (let right = 0; right < indices.length; right++) {
      while (indices[right] - indices[left] - 1 > k) left++;
      if (right > left) {
        maxDist = Math.max(maxDist, indices[right] - indices[left]);
      }
    }
  }
  return maxDist;
}`,
        },
        testCases: [
          // In the reported bug: input has 3 at [0, 2, 4, 5], k = 2.
          // Pair (2, 5) has 2 intervening elements (indices 3, 4). 2 <= k(2) is true!
          // Distance = 5 - 2 = 3.
          // Contradictory test case claimed expectedOutput was 2!
          {
            input: { nums: [3, 1, 3, 4, 3, 3], k: 2 },
            expectedOutput: 2, // Contradicts mathematical rules and reference solution
            isHidden: false,
          },
        ],
      };

      const isValid = verifyReferenceSolutionMatchesTestCases(inconsistentProblem);
      assert.strictEqual(
        isValid,
        false,
        "verifyReferenceSolutionMatchesTestCases MUST reject problem when reference solution output (3) contradicts expectedOutput (2)"
      );
    }
  );

  // Test 8: Regression: Consistent Frequent Element Pair Distance problem is accepted
  await runTest(
    "8. Regression: Mathematically consistent Frequent Element Pair Distance problem is accepted",
    async () => {
      const consistentProblem = {
        title: "Frequent Element Pair Distance",
        description: "Given an array of integers nums and an integer k, find the maximum distance between two occurrences of the most frequent element such that the number of elements strictly between those two occurrences is less than or equal to k.",
        boilerplates: {
          javascript: "function maxFrequentPairDistance(nums, k) {\n  // Your code here\n}",
        },
        referenceSolution: {
          code: `function maxFrequentPairDistance(nums, k) {
  const counts = new Map();
  for (const num of nums) {
    counts.set(num, (counts.get(num) || 0) + 1);
  }
  let maxFreq = 0;
  for (const count of counts.values()) {
    if (count > maxFreq) maxFreq = count;
  }
  const positions = new Map();
  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    if (counts.get(num) === maxFreq) {
      if (!positions.has(num)) positions.set(num, []);
      positions.get(num).push(i);
    }
  }
  let maxDist = 0;
  for (const [num, indices] of positions.entries()) {
    let left = 0;
    for (let right = 0; right < indices.length; right++) {
      while (indices[right] - indices[left] - 1 > k) left++;
      if (right > left) {
        maxDist = Math.max(maxDist, indices[right] - indices[left]);
      }
    }
  }
  return maxDist;
}`,
        },
        testCases: [
          {
            input: { nums: [3, 1, 3, 4, 3, 3], k: 2 },
            expectedOutput: 3, // Mathematically correct distance between indices 2 and 5
            isHidden: false,
          },
          {
            input: { nums: [1, 2, 1, 2, 1], k: 1 },
            expectedOutput: 2, // 1 at [0, 2, 4], (0, 2) has 1 between (<= 1) dist = 2
            isHidden: false,
          },
        ],
      };

      const isValid = verifyReferenceSolutionMatchesTestCases(consistentProblem);
      assert.strictEqual(
        isValid,
        true,
        "verifyReferenceSolutionMatchesTestCases MUST accept problem when reference solution and expected outputs are in 100% agreement"
      );
    }
  );

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================\n");
}

runAllCorrectnessEvaluationTests();
