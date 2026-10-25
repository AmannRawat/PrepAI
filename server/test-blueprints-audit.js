import assert from "node:assert/strict";
import { getAllBlueprints, buildCanonicalProblemFromBlueprint } from "./services/dsaBlueprints.js";

const blueprints = getAllBlueprints();
console.log(`Auditing ${blueprints.length} blueprints...`);

for (const bp of blueprints) {
  console.log(`Checking Blueprint: [${bp.id}] ${bp.title} (${bp.topic} - ${bp.difficulty})`);
  assert.ok(bp.id, "Must have id");
  assert.ok(bp.topic, "Must have topic");
  assert.ok(bp.difficulty, "Must have difficulty");
  assert.ok(bp.boilerplates.javascript, "Must have JS boilerplate");
  assert.ok(bp.boilerplates.python, "Must have Python boilerplate");
  assert.ok(bp.boilerplates.java, "Must have Java boilerplate");
  assert.ok(bp.boilerplates.cpp, "Must have C++ boilerplate");
  assert.ok(bp.referenceSolution.code, "Must have reference solution code");
  assert.ok(typeof bp.oracle === "function", "Must have oracle function");
  assert.ok(Array.isArray(bp.baselineTestCases) && bp.baselineTestCases.length >= 4, "Must have >= 4 baseline test cases");

  // Evaluate reference solution JS code via Function constructor
  const fnFactory = new Function(`${bp.referenceSolution.code}\nreturn ${bp.functionName};`);
  const refFn = fnFactory();

  // Test baseline test cases
  for (const tc of bp.baselineTestCases) {
    const args = bp.parameterNames.map((p) => tc.input[p]);
    const refResult = refFn(...args);
    const oracleResult = bp.oracle(tc.input);

    assert.deepStrictEqual(
      refResult,
      oracleResult,
      `Reference solution and oracle mismatch for blueprint ${bp.id} on input ${JSON.stringify(tc.input)}`
    );
    assert.deepStrictEqual(
      oracleResult,
      tc.expectedOutput,
      `Oracle and baseline expectedOutput mismatch for blueprint ${bp.id} on input ${JSON.stringify(tc.input)}`
    );
  }

  // Test canonical problem builder
  const canonical = buildCanonicalProblemFromBlueprint(bp);
  assert.strictEqual(canonical.title, bp.title);
  assert.strictEqual(canonical.testCases.length >= 4, true);

  for (const tc of canonical.testCases) {
    const args = bp.parameterNames.map((p) => tc.input[p]);
    const refResult = refFn(...args);
    assert.deepStrictEqual(
      refResult,
      tc.expectedOutput,
      `Generated test case mismatch for blueprint ${bp.id}`
    );
  }

  console.log(`✓ Blueprint ${bp.id} passed all oracle and reference solution checks!`);
}

console.log("\nALL 12 BLUEPRINTS VERIFIED SUCCESSFULLY!");
