import { getAllBlueprints } from "./dsaBlueprints.js";

/**
 * PrepAI Correctness Evaluation Service
 * 
 * Evaluates DSA problem correctness against trusted ground-truth data.
 * Adheres strictly to the invariant:
 * "If trusted data is unavailable for a problem, report that its correctness is unverified.
 *  Do not invent ground truth or claim full correctness."
 */

/**
 * Safely compiles a JavaScript function from string code.
 * @param {string} code 
 * @param {string} functionName 
 * @returns {Function}
 */
export function compileJsSolution(code, functionName) {
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("Missing solution code to compile.");
  }
  if (functionName) {
    const fn = new Function(
      `${code}\nreturn (typeof ${functionName} === 'function' ? ${functionName} : undefined);`
    );
    const compiled = fn();
    if (typeof compiled === "function") {
      return compiled;
    }
  }

  const fnFallback = new Function(
    `${code}\nreturn typeof Solution !== 'undefined' ? Solution : undefined;`
  );
  return fnFallback();
}

/**
 * Evaluates the correctness of a DSA problem against trusted ground truth.
 *
 * @param {Object} problem - The problem object to evaluate.
 * @param {Object} [options]
 * @param {Object} [options.trustedBlueprint] - Explicit trusted blueprint, if available.
 * @returns {Object} Evaluation report
 */
export function evaluateProblemCorrectness(problem, options = {}) {
  if (!problem || typeof problem !== "object") {
    return {
      status: "invalid",
      verified: false,
      reason: "Invalid problem structure provided for evaluation.",
    };
  }

  // 1. Locate trusted ground truth (blueprint / oracle)
  let blueprint = options.trustedBlueprint || null;
  if (!blueprint) {
    const all = getAllBlueprints();
    blueprint =
      all.find((b) => b.id === problem.blueprintId || b.id === problem.id) ||
      all.find(
        (b) =>
          b.title.trim().toLowerCase() ===
          String(problem.title || "").trim().toLowerCase()
      );
  }

  // If no trusted blueprint or oracle exists, report unverified
  if (!blueprint || typeof blueprint.oracle !== "function") {
    return {
      status: "unverified",
      verified: false,
      problemTitle: problem.title || "Untitled",
      reason:
        "Trusted ground truth data and oracle are unavailable for this problem. Correctness is unverified.",
    };
  }

  const results = {
    status: "verified",
    verified: true,
    problemTitle: problem.title,
    blueprintId: blueprint.id,
    checks: {
      statementConsistency: false,
      referenceSolutionCorrectness: false,
      boundaryConditionsAgreement: false,
      deliberateDefectDetection: false,
      oracleReferenceAgreement: false,
    },
    defectsCaught: [],
    details: [],
  };

  const functionName = blueprint.functionName;
  const paramNames = blueprint.parameterNames || ["nums"];
  const oracle = blueprint.oracle;

  // Compile the reference solution
  let refFn = null;
  try {
    const refCode =
      problem.referenceSolution?.code || blueprint.referenceSolution?.code;
    refFn = compileJsSolution(refCode, functionName);
  } catch (err) {
    return {
      status: "failed",
      verified: false,
      reason: `Failed to compile reference solution: ${err.message}`,
      problemTitle: problem.title,
    };
  }

  if (typeof refFn !== "function") {
    return {
      status: "failed",
      verified: false,
      reason: `Reference solution does not expose function '${functionName}'.`,
      problemTitle: problem.title,
    };
  }

  // CHECK 1: Problem statement and expected-output consistency
  const testCases = Array.isArray(problem.testCases)
    ? problem.testCases
    : blueprint.baselineTestCases;

  let allTestCasesConsistent = true;
  for (const tc of testCases) {
    const oracleExpected = oracle(tc.input);
    const actualExpected = tc.expectedOutput;
    if (JSON.stringify(actualExpected) !== JSON.stringify(oracleExpected)) {
      allTestCasesConsistent = false;
      results.details.push(
        `Test case expectedOutput mismatch on input ${JSON.stringify(tc.input)}: expected ${JSON.stringify(oracleExpected)}, got ${JSON.stringify(actualExpected)}`
      );
    }
  }
  results.checks.statementConsistency = allTestCasesConsistent;

  // CHECK 2: Reference solution behavior against trusted test cases
  let refSolutionPassed = true;
  for (const tc of blueprint.baselineTestCases) {
    const args = paramNames.map((p) => tc.input[p]);
    try {
      const output = refFn(...args);
      if (JSON.stringify(output) !== JSON.stringify(tc.expectedOutput)) {
        refSolutionPassed = false;
        results.details.push(
          `Reference solution returned incorrect result on baseline input ${JSON.stringify(tc.input)}: expected ${JSON.stringify(tc.expectedOutput)}, got ${JSON.stringify(output)}`
        );
      }
    } catch (err) {
      refSolutionPassed = false;
      results.details.push(`Reference solution threw error: ${err.message}`);
    }
  }
  results.checks.referenceSolutionCorrectness = refSolutionPassed;

  // CHECK 3: Boundary conditions and edge cases agreement between oracle and reference
  let boundaryAgreement = true;
  const boundaryInputs = getBoundaryInputsForBlueprint(blueprint);
  for (const boundaryInput of boundaryInputs) {
    try {
      const oracleOut = oracle(boundaryInput);
      const args = paramNames.map((p) => boundaryInput[p]);
      const refOut = refFn(...args);
      if (JSON.stringify(oracleOut) !== JSON.stringify(refOut)) {
        boundaryAgreement = false;
        results.details.push(
          `Boundary condition mismatch on ${JSON.stringify(boundaryInput)}: oracle=${JSON.stringify(oracleOut)}, ref=${JSON.stringify(refOut)}`
        );
      }
    } catch (err) {
      boundaryAgreement = false;
      results.details.push(
        `Error executing boundary input ${JSON.stringify(boundaryInput)}: ${err.message}`
      );
    }
  }
  results.checks.boundaryConditionsAgreement = boundaryAgreement;

  // CHECK 4: Deliberately incorrect solutions that MUST fail test cases
  const buggySolutions = getBuggySolutionsForBlueprint(blueprint);
  let allDefectsDetected = true;
  for (const bug of buggySolutions) {
    let passedAll = true;
    for (const tc of testCases) {
      const args = paramNames.map((p) => tc.input[p]);
      try {
        const out = bug.fn(...args);
        if (JSON.stringify(out) !== JSON.stringify(tc.expectedOutput)) {
          passedAll = false;
          break; // caught!
        }
      } catch {
        passedAll = false;
        break; // threw runtime error = caught!
      }
    }

    if (passedAll) {
      allDefectsDetected = false;
      results.details.push(
        `Defect NOT caught: test suite permitted buggy solution '${bug.name}'.`
      );
    } else {
      results.defectsCaught.push(bug.name);
    }
  }
  results.checks.deliberateDefectDetection = allDefectsDetected;

  // CHECK 5: Agreement between known-correct implementations (Oracle vs Reference)
  results.checks.oracleReferenceAgreement =
    results.checks.referenceSolutionCorrectness &&
    results.checks.boundaryConditionsAgreement;

  // Overall verdict
  results.verified =
    results.checks.statementConsistency &&
    results.checks.referenceSolutionCorrectness &&
    results.checks.boundaryConditionsAgreement &&
    results.checks.deliberateDefectDetection &&
    results.checks.oracleReferenceAgreement;

  if (!results.verified) {
    results.status = "failed";
  }

  return results;
}

/**
 * Returns domain-specific boundary inputs for a blueprint to stress-test corner cases.
 */
function getBoundaryInputsForBlueprint(blueprint) {
  switch (blueprint.id) {
    case "arrays-pivot-index":
      return [
        { nums: [0] },
        { nums: [1] },
        { nums: [-1, 1, 0] },
        { nums: [1, 2, 3] },
        { nums: [0, 0, 0, 0] },
      ];
    case "arrays-maximum-subarray":
      return [
        { nums: [-5] },
        { nums: [-2, -1, -3] },
        { nums: [100] },
        { nums: [0, 0, 0] },
      ];
    case "hashmap-pair-sum":
      return [
        { nums: [3, 3], target: 6 },
        { nums: [1, 2, 3], target: 10 },
        { nums: [-3, 4, 3, 90], target: 0 },
      ];
    case "twopointers-water-container":
      return [
        { heights: [1, 1] },
        { heights: [4, 3, 2, 1, 4] },
        { heights: [1, 2, 1] },
      ];
    case "strings-longest-unique-substr":
      return [
        { s: "" },
        { s: "a" },
        { s: "aaaa" },
        { s: "abcdef" },
      ];
    case "binarysearch-rotated-array":
      return [
        { nums: [1], target: 0 },
        { nums: [1], target: 1 },
        { nums: [3, 1], target: 1 },
        { nums: [5, 1, 3], target: 5 },
      ];
    case "stack-balanced-brackets":
      return [
        { s: "" },
        { s: "[" },
        { s: "]" },
        { s: "([{}])" },
        { s: "[(])" },
      ];
    case "dp-climbing-stairs":
      return [
        { n: 1 },
        { n: 2 },
        { n: 3 },
        { n: 10 },
      ];
    case "dp-coin-change":
      return [
        { coins: [1], amount: 0 },
        { coins: [2], amount: 3 },
        { coins: [1, 2, 5], amount: 11 },
      ];
    default:
      return blueprint.baselineTestCases.map((tc) => tc.input);
  }
}

/**
 * Returns deliberately incorrect candidate solutions for defect detection.
 */
function getBuggySolutionsForBlueprint(blueprint) {
  const name = blueprint.id;
  const bugs = [
    {
      name: "Constant Zero Returner",
      fn: () => 0,
    },
    {
      name: "Constant Negative Returner",
      fn: () => -1,
    },
  ];

  if (name === "arrays-pivot-index") {
    bugs.push({
      name: "Only Adjacent Check (Fails prefix/suffix total sums)",
      fn: (nums) => {
        if (!nums || nums.length < 3) return -1;
        for (let i = 1; i < nums.length - 1; i++) {
          if (nums[i - 1] === nums[i + 1]) return i;
        }
        return -1;
      },
    });
  } else if (name === "arrays-maximum-subarray") {
    bugs.push({
      name: "Positive Only Sum (Fails entirely negative arrays)",
      fn: (nums) => {
        let max = 0;
        for (const n of nums) max = Math.max(max, max + n);
        return max;
      },
    });
  } else if (name === "hashmap-pair-sum") {
    bugs.push({
      name: "Same Element Reuser (nums[i] + nums[i] == target)",
      fn: (nums, target) => {
        for (let i = 0; i < nums.length; i++) {
          if (nums[i] * 2 === target) return [i, i];
        }
        return [];
      },
    });
  } else if (name === "stack-balanced-brackets") {
    bugs.push({
      name: "Length Parity Only (Returns true if even length)",
      fn: (s) => s.length % 2 === 0,
    });
  } else if (name === "dp-coin-change") {
    bugs.push({
      name: "Greedy Coin Selector (Fails when greedy is non-optimal)",
      fn: (coins, amount) => {
        if (amount === 0) return 0;
        const sorted = [...coins].sort((a, b) => b - a);
        let count = 0;
        let rem = amount;
        for (const c of sorted) {
          while (rem >= c) {
            rem -= c;
            count++;
          }
        }
        return rem === 0 ? count : -1;
      },
    });
  }

  return bugs;
}
