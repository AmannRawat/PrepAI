/**
 * PrepAI Server Test Runner
 * Executes all backend test suites sequentially and reports consolidated results.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testSuites = [
  "study-plan-analytics.test.js",
  "resume-reviewer.test.js",
  "company-catalog.test.js",
  "adaptive-difficulty.test.js",
  "problem-deduplication.test.js",
  "incident-resilience.test.js",
  "generation-reliability.test.js",
  "hybrid-generation.test.js",
  "debug-flow.test.js",
  "correctness-evaluation.test.js",
  "interview-langgraph.test.js",
  "blueprints-audit.test.js",
  "calendar-activity.test.js",
  "reliability-audit.test.js",
  "security.test.js",
  "settings-ia-integration.test.js",
  "settings-preferences.test.js",
];

console.log("=================================================");
console.log(`  PREPAI SERVER TEST RUNNER (${testSuites.length} Suites)`);
console.log("=================================================\n");

let passedCount = 0;
let failedCount = 0;
const failures = [];

async function runSuite(suiteFile) {
  return new Promise((resolve) => {
    const fullPath = path.join(__dirname, suiteFile);
    console.log(`\n>>> Running suite: ${suiteFile} ...`);
    const child = spawn(process.execPath, [fullPath], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        passedCount++;
        resolve(true);
      } else {
        failedCount++;
        failures.push(suiteFile);
        resolve(false);
      }
    });
  });
}

for (const suite of testSuites) {
  await runSuite(suite);
}

console.log("\n=================================================");
console.log("  PREPAI SERVER TEST SUMMARY");
console.log("=================================================");
console.log(`Total Suites:  ${testSuites.length}`);
console.log(`Passed Suites: ${passedCount}`);
console.log(`Failed Suites: ${failedCount}`);

if (failedCount > 0) {
  console.error("\nFailed suites:");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log("\nALL SERVER TEST SUITES PASSED SUCCESSFULLY!");
  process.exit(0);
}
