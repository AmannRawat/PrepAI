import mongoose from "mongoose";
import DsaSubmission from "../models/DsaSubmission.model.js";
import UserMemory from "../models/UserMemory.model.js";
import StudyPlan from "../models/StudyPlan.model.js";
import { calculateDsaStats } from "../services/analytics.service.js";
import vm from "node:vm";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";
import { executeCode, valuesEqual } from "../services/codeExecution.service.js";
import {
  sanitizeProblemForClient,
  resolveAuthoritativeTestCases,
} from "../utils/testCaseSecurity.js";
import {
  getCompanyQuestions,
  getAvailableCompanies,
  COMPANY_CATALOG_DISCLAIMER,
} from "../services/companyQuestion.service.js";
import { normalizeCompanyName } from "../utils/companyNormalizer.js";
import {
  evaluateAdaptiveDifficulty,
  extractExplicitDifficulty,
  ADAPTIVE_DIFFICULTY_CONFIG,
} from "../services/adaptiveDifficulty.service.js";
import {
  selectNextBlueprint,
  buildCanonicalProblemFromBlueprint,
  findBlueprintsByTopicAndDifficulty,
  TOPIC_ROTATION_ORDER,
  getAvailableTopics,
  isTopicSupported,
} from "../services/dsaBlueprints.js";

// Bounded in-memory session cache (last 10 items) tracking recently loaded blueprints, topics,
// and problem titles per user. Informs selectNextBlueprint() so consecutive requests rotate across topics
// and do not serve duplicate problems in a single study session.
const userRecentProblems = new Map();

export function recordUserProblemLoad(userId, { blueprintId, topic, title } = {}) {
  if (!userId) return;
  let record = userRecentProblems.get(userId);
  if (!record) {
    record = { recentBlueprints: [], recentTopics: [], recentTitles: [] };
    userRecentProblems.set(userId, record);
  }
  if (blueprintId && !record.recentBlueprints.includes(blueprintId)) {
    record.recentBlueprints.push(blueprintId);
    if (record.recentBlueprints.length > 10) record.recentBlueprints.shift();
  }
  if (topic) {
    record.recentTopics.push(topic.toLowerCase());
    if (record.recentTopics.length > 10) record.recentTopics.shift();
  }
  if (title) {
    record.recentTitles.push(title.toLowerCase());
    if (record.recentTitles.length > 10) record.recentTitles.shift();
  }
}

export function getUserRecentProblemData(userId) {
  if (!userId) return { recentBlueprints: [], recentTopics: [], recentTitles: [] };
  return userRecentProblems.get(userId) || { recentBlueprints: [], recentTopics: [], recentTitles: [] };
}

/**
 * Extracts requested question count from user message.
 * Defaults to 1 for singular questions ("a question", "an amazon ... question", "one"),
 * extracts specific counts ("five", "5", "3"), and defaults to 5 for multi/list requests.
 */
export function extractQuestionCount(message) {
  if (!message || typeof message !== "string") return 1;
  const text = message.trim().toLowerCase();

  const wordMap = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  // Pattern for explicit count before company/difficulty/question: e.g. "five amazon medium-level dsa questions", "5 questions"
  const countPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*(?:company\s*)?(?:easy|medium|hard\s*)?(?:-level\s*)?(?:dsa\s*)?(?:questions?|problems?|leetcode)\b/i;
  const countMatch = text.match(countPattern);
  if (countMatch) {
    const raw = countMatch[1].toLowerCase();
    const parsed = wordMap[raw] || parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, 10);
    }
  }

  // Pattern for commands like "give me 5", "list 3", "show 10"
  const prefixPattern = /\b(?:give me|show me|list|find|get)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/i;
  const prefixMatch = text.match(prefixPattern);
  if (prefixMatch) {
    const raw = prefixMatch[1].toLowerCase();
    const parsed = wordMap[raw] || parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(parsed, 10);
    }
  }

  // Explicit singular: "a question", "an amazon ... question", "a dsa question", "single question"
  if (/\b(?:a|an|single)\s+[\w\s-]*?\b(?:question|problem)\b/i.test(text)) {
    return 1;
  }

  // Plural indicator without explicit number: "questions", "problems", "list", "some"
  if (/\b(?:questions|problems|list\s+of|some)\b/i.test(text)) {
    return 5;
  }

  // Default to 1 for singular intent
  return 1;
}

/**
 * Formats company question catalog search results with verified data fidelity,
 * preserving real title, company, difficulty, slug, and canonical source URL as clean clickable links.
 * Avoids malformed nested markdown, eliminates unnecessary raw debug fields, keeps source attribution
 * concise and separate, and clearly states Arena loading limitations.
 */
export function formatCatalogQuestionsResponse(company, difficulty, questionsResult, isSingle = false) {
  const questions = questionsResult?.questions || [];
  if (questions.length === 0) {
    return formatCatalogMissResponse(company, difficulty);
  }

  const attribution = `*(Source: Community LeetCode catalog • Not an official ${company} endorsement)*`;

  if (isSingle || questions.length === 1) {
    const q = questions[0];
    const topicsStr = q.topics?.length ? ` (${q.topics.join(", ")})` : "";
    return (
      `Here is a popular **${company}**${difficulty ? ` ${difficulty}` : ""} interview question from our community catalog:\n\n` +
      `📌 [${q.title}](${q.url}) — \`${q.difficulty}\`${topicsStr}\n\n` +
      `*Note: This is a reference LeetCode question. Because our catalog stores reference metadata rather than complete runnable test suites and starter code, it cannot be loaded directly into the DSA Arena. You can practice it on LeetCode via the link above!*\n\n` +
      `*If you'd like a runnable problem to code right here in the Arena, just ask: "Generate an original AI practice problem on this topic!"*\n\n` +
      `${attribution}`
    );
  }

  const qList = questions
    .map(
      (q, i) =>
        `${i + 1}. [${q.title}](${q.url}) — \`${q.difficulty}\`${q.topics?.length ? ` • ${q.topics.slice(0, 3).join(", ")}` : ""}`
    )
    .join("\n");

  return (
    `Here are matching interview questions for **${company}**${difficulty ? ` (${difficulty})` : ""} from our community catalog:\n\n` +
    `${qList}\n\n` +
    `*Note: These are reference LeetCode questions containing metadata and links. They cannot be loaded as runnable Arena problems. To practice runnable code in the Arena, ask for an original AI practice problem on any of these topics!*\n\n` +
    `${attribution}`
  );
}

/**
 * Formats a catalog miss notice explicitly stating that no matching questions exist
 * for the requested company/difficulty/topic, and prompts the user whether they would like
 * a separately labelled AI-generated practice problem.
 */
export function formatCatalogMissResponse(company, difficulty, topic) {
  const criteria = [difficulty, topic].filter(Boolean).join(" ");
  const criteriaStr = criteria ? ` matching **${criteria}**` : "";
  return (
    `I searched our company question catalog, but found no${criteriaStr} questions for **${company}** in the database.\n\n` +
    `Popular companies with extensive question catalogs include **Amazon**, **Google**, **Meta**, **Microsoft**, **Apple**, and **Uber**.\n\n` +
    `Would you like me to generate a separately labelled, original AI practice problem on this topic for your DSA Arena?`
  );
}

/**
 * Enforces that an AI-generated problem is NEVER described as a retrieved or verified company interview question.
 * Ensures the response contains an explicit AI-generated practice label.
 */
export function sanitizeAiProblemConfirmation(rawAnswer, result, detectedCompany) {
  let cleaned = (rawAnswer || "").trim();

  // Guardrail 1: Disallow false claims of catalog retrieval or verified interview status
  const falseClaimRegex = /\b(?:retrieved\s+from|pulled\s+from|from\s+the\s+catalog|catalog\s+question|verified\s+[\w\s]*question|actual\s+[\w\s]*interview\s+question|official\s+[\w\s]*question)\b/gi;
  if (falseClaimRegex.test(cleaned)) {
    cleaned = cleaned.replace(
      falseClaimRegex,
      "AI-generated practice challenge (not retrieved from catalog)"
    );
  }

  // Guardrail 2: Ensure explicit AI-generated label is always present
  if (!/\b(?:ai-generated|ai practice|original practice)\b/i.test(cleaned)) {
    cleaned = `[AI-Generated Practice Problem] ${cleaned}`;
  }

  // Guardrail 3: If a company was detected, clarify that it is modeled after company topics, not retrieved from catalog
  if (detectedCompany && !cleaned.includes("modeled after")) {
    cleaned += ` (Note: This is an original AI practice problem modeled after ${detectedCompany} interview topics, not a verified question from the catalog.)`;
  }

  return cleaned;
}

export function validateGeneratedProblem(problem) {
  const supportedLanguages = ["javascript", "python", "java", "cpp"];

  if (
    !problem ||
    typeof problem !== "object" ||
    Array.isArray(problem)
  ) {
    return false;
  }

  if (
    typeof problem.title !== "string" ||
    !problem.title.trim() ||
    typeof problem.description !== "string" ||
    !problem.description.trim()
  ) {
    return false;
  }

  if (
    !Array.isArray(problem.examples) ||
    problem.examples.length < 2 ||
    !problem.examples.every(
      (example) =>
        example &&
        typeof example.input === "string" &&
        example.input.trim() &&
        typeof example.output === "string" &&
        example.output.trim() &&
        typeof example.explanation === "string" &&
        example.explanation.trim()
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(problem.constraints) ||
    problem.constraints.length === 0 ||
    !problem.constraints.every(
      (constraint) =>
        typeof constraint === "string" && constraint.trim()
    )
  ) {
    return false;
  }

  if (
    !problem.boilerplates ||
    typeof problem.boilerplates !== "object"
  ) {
    return false;
  }

  for (const language of supportedLanguages) {
    const code = problem.boilerplates[language];
    if (typeof code !== "string" || !code.trim()) {
      return false;
    }
    if (language === "javascript" && !/(?:function\b|=>)/.test(code)) {
      return false;
    }
    if (language === "python" && !/\bdef\b/.test(code)) {
      return false;
    }
    if (language === "java" && !/\bclass\s+Solution\b/.test(code)) {
      return false;
    }
    if (language === "cpp" && !/\bclass\s+Solution\b/.test(code)) {
      return false;
    }
  }

  if (
    !Array.isArray(problem.testCases) ||
    problem.testCases.length < 4 ||
    problem.testCases.length > 20
  ) {
    return false;
  }

  let baselineKeys = null;
  for (const testCase of problem.testCases) {
    if (
      !testCase ||
      typeof testCase !== "object" ||
      !Object.prototype.hasOwnProperty.call(testCase, "input") ||
      !Object.prototype.hasOwnProperty.call(
        testCase,
        "expectedOutput"
      ) ||
      typeof testCase.isHidden !== "boolean"
    ) {
      return false;
    }

    // Input must be a non-null plain object representing named function arguments
    if (
      !testCase.input ||
      typeof testCase.input !== "object" ||
      Array.isArray(testCase.input) ||
      testCase.expectedOutput === undefined
    ) {
      return false;
    }

    // Validate that inputs and expected outputs are JSON-serializable
    try {
      const serializedInput = JSON.stringify(testCase.input);
      const serializedOutput = JSON.stringify(testCase.expectedOutput);
      if (!serializedInput || serializedOutput === undefined) {
        return false;
      }
    } catch {
      return false;
    }

    // Ensure all test cases share consistent function parameter keys
    const currentKeys = Object.keys(testCase.input).sort().join(",");
    if (!currentKeys) {
      return false;
    }
    if (baselineKeys === null) {
      baselineKeys = currentKeys;
    } else if (baselineKeys !== currentKeys) {
      return false;
    }
  }

  if (!problem.testCases.some((testCase) => !testCase.isHidden)) {
    return false;
  }

  if (!problem.testCases.some((testCase) => testCase.isHidden)) {
    return false;
  }

  if (problem.referenceSolution !== undefined) {
    if (
      !problem.referenceSolution ||
      typeof problem.referenceSolution !== "object" ||
      typeof problem.referenceSolution.code !== "string" ||
      !problem.referenceSolution.code.trim()
    ) {
      return false;
    }
    if (
      problem.referenceSolution.timeComplexity !== undefined &&
      (typeof problem.referenceSolution.timeComplexity !== "string" ||
        !problem.referenceSolution.timeComplexity.trim())
    ) {
      return false;
    }
    if (
      problem.referenceSolution.spaceComplexity !== undefined &&
      (typeof problem.referenceSolution.spaceComplexity !== "string" ||
        !problem.referenceSolution.spaceComplexity.trim())
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether the reference solution implementation's structure contradicts its claimed complexity.
 * Prevents claiming O(n) or O(1) when the implementation contains quadratic nested loops.
 */
export function hasComplexityMismatch(referenceSolution) {
  if (!referenceSolution || typeof referenceSolution !== "object") return false;
  const timeComp = String(referenceSolution.timeComplexity || "").toLowerCase();
  const code = String(referenceSolution.code || "");

  const claimsLinearOrBetter =
    /\bo\(\s*(?:1|log\s*n|n)\s*\)/i.test(timeComp) &&
    !/\bo\(\s*(?:n\s*(?:\^2|2|\*\s*n|log\s*n))\s*\)/i.test(timeComp);

  if (claimsLinearOrBetter) {
    // Check for nested loops where the inner loop iterates over dynamic bounds or array variables
    const nestedForOrWhile =
      /(?:for|while)\s*\([^)]*\)\s*\{[\s\S]*?(?:for|while)\s*\([^)]*(?:<|<=|>|>=)\s*[^;)]*(?:length|size|\bn\b|[a-zA-Z0-9_$]*bound|[a-zA-Z0-9_$]*limit|R|L)/i;
    if (nestedForOrWhile.test(code)) {
      return true;
    }
  }
  return false;
}

/**
 * Determines whether a problem contract explicitly allows unordered/arbitrary output.
 */
export function isUnorderedContract(description = "", title = "") {
  const text = `${title} ${description}`;
  const allowUnordered =
    /\b(in any order|in either order|order does not matter|in any sequence|in arbitrary order|any order is accepted|return the (?:elements|pairs|indices|items|values|result) in any order)\b/i.test(
      text
    );
  const requireOrder =
    /\b(in ascending order|in descending order|in sorted order|sorted by|in order of appearance|non-decreasing order|non-increasing order)\b/i.test(
      text
    );
  return allowUnordered && !requireOrder;
}

/**
 * Compares two arrays in an order-independent fashion when allowed by the problem contract.
 */
export function unorderedValuesEqual(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  if (actual.length !== expected.length) return false;

  const isPrimitiveArray = (arr) => arr.every((x) => x === null || typeof x !== "object");
  if (isPrimitiveArray(actual) && isPrimitiveArray(expected)) {
    const sortedActual = [...actual].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
    const sortedExpected = [...expected].sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
    return JSON.stringify(sortedActual) === JSON.stringify(sortedExpected);
  }

  const normalizeAndStringify = (item) => {
    if (Array.isArray(item)) {
      if (isPrimitiveArray(item)) {
        return JSON.stringify(
          [...item].sort((a, b) =>
            String(a).localeCompare(String(b), undefined, { numeric: true })
          )
        );
      }
      return JSON.stringify(item.map(normalizeAndStringify).sort());
    }
    if (item && typeof item === "object") {
      return JSON.stringify(
        Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((k) => [k, item[k]])
        )
      );
    }
    return JSON.stringify(item);
  };

  const normActual = actual.map(normalizeAndStringify).sort();
  const normExpected = expected.map(normalizeAndStringify).sort();
  return JSON.stringify(normActual) === JSON.stringify(normExpected);
}

/**
 * Extracts the primary algorithmic function name from code, prioritizing
 * the name declared in the starter boilerplate so helper functions (e.g. swap, gcd)
 * are not mistakenly invoked as the entry point.
 */
export function extractPrimaryFunctionName(code, boilerplate = "") {
  if (!code || typeof code !== "string") return null;

  if (boilerplate && typeof boilerplate === "string") {
    const bpMatch = boilerplate.match(
      /(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:function|\((?:[^)]*)\)\s*=>))/
    );
    const expectedName = bpMatch ? bpMatch[1] || bpMatch[2] : null;
    if (expectedName) {
      const nameRegex = new RegExp(
        `(?:function\\s+${expectedName}\\s*\\(|(?:const|let|var)\\s+${expectedName}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>))`
      );
      if (nameRegex.test(code)) {
        return expectedName;
      }
    }
  }

  const allFunctionMatches = [
    ...code.matchAll(
      /(?:function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:function|\(([^)]*)\)\s*=>))/g
    ),
  ];

  if (allFunctionMatches.length === 0) return null;

  const helperNames = new Set([
    "swap",
    "helper",
    "dfs",
    "bfs",
    "gcd",
    "lcm",
    "partition",
    "merge",
    "check",
    "isvalid",
  ]);
  const primary = allFunctionMatches.find((m) => {
    const name = m[1] || m[3];
    return name && !helperNames.has(name.toLowerCase());
  });

  if (primary) {
    return primary[1] || primary[3];
  }

  return allFunctionMatches[0][1] || allFunctionMatches[0][3];
}

/**
 * Extracts parameter names from the declared primary function signature.
 */
export function extractParameterNames(code, fnName) {
  if (!code || !fnName) return [];
  const regex = new RegExp(
    `(?:function\\s+${fnName}\\s*\\(([^)]*)\\)|(?:const|let|var)\\s+${fnName}\\s*=\\s*(?:function\\s*\\(([^)]*)\\)|\\(([^)]*)\\)\\s*=>))`
  );
  const match = code.match(regex);
  if (!match) return [];
  const rawParams = match[1] || match[2] || match[3] || "";
  return rawParams
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Robustly maps testcase input dictionary to positional arguments matching paramNames.
 * Handles exact matches, case differences, and camelCase vs snake_case conventions.
 */
export function mapArgumentsToParameters(inputObj, paramNames) {
  if (!inputObj || typeof inputObj !== "object") return [];
  if (!paramNames || paramNames.length === 0) return Object.values(inputObj);

  const inputKeys = Object.keys(inputObj);

  if (paramNames.every((p) => Object.prototype.hasOwnProperty.call(inputObj, p))) {
    return paramNames.map((p) => inputObj[p]);
  }

  const normalizedKeyMap = new Map();
  for (const k of inputKeys) {
    normalizedKeyMap.set(k.toLowerCase(), k);
    normalizedKeyMap.set(k.replace(/[^a-zA-Z0-9]/g, "").toLowerCase(), k);
  }

  const mappedArgs = [];
  let allMapped = true;

  for (const p of paramNames) {
    if (Object.prototype.hasOwnProperty.call(inputObj, p)) {
      mappedArgs.push(inputObj[p]);
      continue;
    }
    const lower = normalizedKeyMap.get(p.toLowerCase());
    if (lower) {
      mappedArgs.push(inputObj[lower]);
      continue;
    }
    const clean = normalizedKeyMap.get(p.replace(/[^a-zA-Z0-9]/g, "").toLowerCase());
    if (clean) {
      mappedArgs.push(inputObj[clean]);
      continue;
    }
    allMapped = false;
    break;
  }

  if (allMapped && mappedArgs.length === paramNames.length) {
    return mappedArgs;
  }

  return Object.values(inputObj);
}

/**
 * Evaluates the problem's JavaScript reference solution against 100% of generated test cases.
 * Returns a comprehensive diagnostic report containing pass/fail state, compilation errors,
 * and individual test case mismatch details (input, expected, actual, failure reason).
 */
export function evaluateProblemConsistency(problem) {
  if (
    !problem ||
    typeof problem !== "object" ||
    !problem.referenceSolution ||
    typeof problem.referenceSolution.code !== "string" ||
    !problem.referenceSolution.code.trim() ||
    !Array.isArray(problem.testCases) ||
    problem.testCases.length === 0
  ) {
    return {
      isValid: false,
      compilationError: null,
      failingCases: [],
      summary: "Missing reference solution or test cases",
    };
  }

  const code = problem.referenceSolution.code;
  const jsBoilerplate = problem.boilerplates?.javascript || "";
  const fnName = extractPrimaryFunctionName(code, jsBoilerplate);

  if (!fnName) {
    return {
      isValid: false,
      compilationError: null,
      failingCases: [],
      summary: "Could not find a valid primary function name in reference solution",
    };
  }

  const FORBIDDEN_EXECUTION_TOKENS =
    /\b(process|child_process|fs|require|import|globalThis|global)\b|constructor\s*\[\s*['"`]constructor['"`]\s*\]/;
  if (FORBIDDEN_EXECUTION_TOKENS.test(code)) {
    return {
      isValid: false,
      compilationError: "Security violation: forbidden execution tokens detected in solution code",
      failingCases: [],
      summary: "Security violation: forbidden execution tokens detected",
    };
  }

  const paramNames = extractParameterNames(code, fnName);

  let script;
  try {
    script = new vm.Script(`
      ${code}
      ;(() => {
        return ${fnName}(...__args);
      })()
    `);
  } catch (err) {
    return {
      isValid: false,
      compilationError: err.message,
      failingCases: [],
      summary: `Reference solution compilation error: ${err.message}`,
    };
  }

  const allowUnordered = isUnorderedContract(problem.description, problem.title);
  const failingCases = [];

  for (let i = 0; i < problem.testCases.length; i++) {
    const tc = problem.testCases[i];
    if (!tc || typeof tc !== "object" || !tc.input || typeof tc.input !== "object") {
      failingCases.push({
        testCaseIndex: i,
        input: tc?.input,
        expectedOutput: tc?.expectedOutput,
        actualOutput: null,
        reason: "Test case is malformed or missing input object",
      });
      continue;
    }

    const args = mapArgumentsToParameters(tc.input, paramNames);

    try {
      const sandbox = Object.assign(Object.create(null), {
        Math,
        Number,
        String,
        Array,
        Boolean,
        Object,
        Set,
        Map,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        JSON,
        console: Object.freeze({ log: () => {}, warn: () => {}, error: () => {} }),
        __args: JSON.parse(JSON.stringify(args)),
      });
      const actual = script.runInNewContext(sandbox, { timeout: 250 });

      if (actual === undefined && tc.expectedOutput !== undefined) {
        failingCases.push({
          testCaseIndex: i,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: undefined,
          reason: `Reference solution returned undefined (expected ${JSON.stringify(tc.expectedOutput)})`,
        });
        continue;
      }

      let matches = valuesEqual(actual, tc.expectedOutput, { strictTypes: true });

      if (!matches && allowUnordered) {
        if (unorderedValuesEqual(actual, tc.expectedOutput)) {
          matches = true;
        }
      }

      if (!matches) {
        failingCases.push({
          testCaseIndex: i,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: actual,
          reason: `Expected ${JSON.stringify(tc.expectedOutput)}, got ${JSON.stringify(actual)}`,
        });
      }
    } catch (execErr) {
      failingCases.push({
        testCaseIndex: i,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: null,
        reason: `Runtime error during execution: ${execErr.message}`,
      });
    }
  }

  const isValid = failingCases.length === 0;
  return {
    isValid,
    compilationError: null,
    failingCases,
    summary: isValid
      ? "Passed all test cases"
      : `Reference solution mismatch on ${failingCases.length} testcase(s): ${failingCases[0]?.reason}`,
  };
}

/**
 * Deterministically checks that the problem's JavaScript reference solution
 * executes without runtime errors and produces the exact expectedOutput for every test case.
 * Runs locally inside an isolated node:vm sandbox.
 */
export function verifyReferenceSolutionMatchesTestCases(problem) {
  const report = evaluateProblemConsistency(problem);
  if (!report.isValid) {
    if (report.compilationError) {
      console.warn(
        "[Problem Consistency Gate] Reference solution compilation error:",
        report.compilationError
      );
    } else if (report.failingCases.length > 0) {
      const first = report.failingCases[0];
      console.warn(
        `[Problem Consistency Gate] Reference solution mismatch on testCase ${first.testCaseIndex}: ${first.reason}`
      );
    }
    return false;
  }
  return true;
}

/**
 * Performs a targeted diagnostic repair of an invalid DSA problem candidate.
 * Supplies Gemini with the failing test cases, inputs, expected outputs, and actual outputs,
 * requesting an accurate fix of either the reference solution code or the test case expected outputs.
 */
/**
 * Merges a constrained repair patch or full problem update into the original candidate.
 * Returns a complete candidate problem for independent schema and consistency revalidation.
 */
export function applyRepairPatch(candidate, patch) {
  if (!candidate || typeof candidate !== "object") return null;
  if (!patch || typeof patch !== "object") return candidate;

  // If the model returned a complete problem object (legacy / full schema)
  if (
    typeof patch.title === "string" &&
    patch.boilerplates &&
    Array.isArray(patch.testCases)
  ) {
    return patch;
  }

  // Clone candidate to avoid mutating original in place
  const repaired = JSON.parse(JSON.stringify(candidate));

  // 1. Update reference solution code if provided
  if (typeof patch.referenceSolutionCode === "string" && patch.referenceSolutionCode.trim()) {
    if (!repaired.referenceSolution) repaired.referenceSolution = {};
    repaired.referenceSolution.code = patch.referenceSolutionCode.trim();
  } else if (
    patch.referenceSolution &&
    typeof patch.referenceSolution.code === "string" &&
    patch.referenceSolution.code.trim()
  ) {
    if (!repaired.referenceSolution) repaired.referenceSolution = {};
    repaired.referenceSolution.code = patch.referenceSolution.code.trim();
  }

  // 2. Update expected outputs for failing test cases if provided
  if (Array.isArray(patch.correctedOutputs) && Array.isArray(repaired.testCases)) {
    for (const item of patch.correctedOutputs) {
      if (
        item &&
        typeof item.testCaseIndex === "number" &&
        item.testCaseIndex >= 0 &&
        item.testCaseIndex < repaired.testCases.length &&
        Object.prototype.hasOwnProperty.call(item, "expectedOutput")
      ) {
        repaired.testCases[item.testCaseIndex].expectedOutput = item.expectedOutput;
      }
    }
  }

  // 3. Optional description update (e.g. adding unordered return clarification)
  if (typeof patch.descriptionUpdate === "string" && patch.descriptionUpdate.trim()) {
    repaired.description = patch.descriptionUpdate.trim();
  }

  // 4. Optional JavaScript boilerplate update if signature changed
  if (
    patch.boilerplates?.javascript &&
    typeof patch.boilerplates.javascript === "string"
  ) {
    if (!repaired.boilerplates) repaired.boilerplates = {};
    repaired.boilerplates.javascript = patch.boilerplates.javascript;
  }

  return repaired;
}

/**
 * Performs a targeted diagnostic repair of an invalid DSA problem candidate.
 * Supplies Gemini with the failing test cases, inputs, expected outputs, and actual outputs,
 * requesting a constrained, low-complexity repair patch (either reference solution fix,
 * corrected expectedOutputs, or both). Merges the patch and returns the complete candidate.
 */
export async function repairDsaProblem({
  candidate,
  consistencyReport,
  normalizedTopic,
  matchedDifficulty,
}) {
  const failingDetails = (consistencyReport.failingCases || [])
    .slice(0, 5)
    .map(
      (fc) =>
        `- Test Case ${fc.testCaseIndex}:
   Input: ${JSON.stringify(fc.input)}
   Claimed expectedOutput: ${JSON.stringify(fc.expectedOutput)}
   Actual reference solution output: ${JSON.stringify(fc.actualOutput)}
   Reason: ${fc.reason}`
    )
    .join("\n");

  const repairPrompt = `You are a principal algorithmic problem setter and verifier for an interview coding platform.
A generated DSA problem failed automated correctness validation because the reference solution contradicts the test cases.

PROBLEM TITLE: ${candidate.title || "Untitled"}
TOPIC: ${normalizedTopic}
DIFFICULTY: ${matchedDifficulty}

PROBLEM DESCRIPTION:
${candidate.description || ""}

FUNCTION SIGNATURE (JavaScript):
${candidate.boilerplates?.javascript || ""}

CURRENT JAVASCRIPT REFERENCE SOLUTION:
${candidate.referenceSolution?.code || ""}

VALIDATION FAILURE REPORT:
${consistencyReport.compilationError ? `Compilation Error: ${consistencyReport.compilationError}\n` : ""}${failingDetails}

REPAIR INSTRUCTIONS:
1. DIAGNOSE THE ROOT CAUSE:
   - Determine whether the reference solution has a bug, or the test cases have incorrect expected outputs, or both.
2. PROVIDE A CONSTRAINED REPAIR PATCH:
   - Return a JSON object with ONLY the necessary corrections.
   - If the reference solution is buggy, provide the complete, working "referenceSolutionCode".
   - If test cases have wrong expected outputs, provide "correctedOutputs" with the testCaseIndex and true expectedOutput.
   - You do NOT need to repeat unchanged boilerplates or valid test cases.

REQUIRED JSON PATCH SCHEMA:
{
  "diagnosis": "Concise explanation of the bug and fix",
  "patchType": "code" | "testCases" | "both",
  "referenceSolutionCode": "function primaryFn(...) { ... }", // include if reference solution was fixed
  "correctedOutputs": [ // include if test cases were fixed
    {
      "testCaseIndex": 0,
      "expectedOutput": 0
    }
  ]
}

Return ONLY this valid JSON object without surrounding commentary.`;

  const repairResponse = await generateText(repairPrompt, {
    stage: "problem_repair",
    timeout: 35000,
    maxAttempts: 2,
    responseMimeType: "application/json",
  });

  const patch = extractJson(repairResponse);
  return applyRepairPatch(candidate, patch);
}

export async function createDsaProblem({
  topic,
  difficulty,
  excludeTitle,
  allowFallback = false,
  recentTitles = [],
  recentBlueprints = [],
  recentTopics = [],
}) {
  const allowedDifficulties = ["Easy", "Medium", "Hard"];
  const matchedDifficulty =
    allowedDifficulties.find(
      (d) => d.toLowerCase() === String(difficulty || "").trim().toLowerCase()
    ) || "Medium";

  let normalizedTopic = String(topic || "Arrays").trim();
  if (!normalizedTopic || normalizedTopic.length > 100) {
    normalizedTopic = "Arrays";
  }

  // Treat generic intents ("Any", "Mixed", "DSA", "coding", "practice") as Arrays
  const isGeneric = [
    "any",
    "mixed",
    "dsa",
    "coding",
    "algo",
    "algorithm",
    "algorithms",
    "practice",
  ].includes(normalizedTopic.toLowerCase());
  if (isGeneric) {
    normalizedTopic = "Arrays";
  }

  const trimmedExclude = typeof excludeTitle === "string" ? excludeTitle.trim() : "";
  const exclusionDirective = trimmedExclude
    ? `\nCRITICAL DEDUPLICATION REQUIREMENT:\nDo NOT generate, reproduce, or title this problem "${trimmedExclude}". Generate a completely different problem with a distinct algorithmic task, title, and function name.\n`
    : "";

  const prompt = `
You are a professional Data Structures and Algorithms problem setter
for a programming interview practice platform.

Generate ONE original, self-contained function-based DSA problem.

TOPIC: ${normalizedTopic}
DIFFICULTY: ${matchedDifficulty}
${exclusionDirective}
PROBLEM REQUIREMENTS:
1. Generate a clear title and an unambiguous problem description.
2. Include at least two valid examples, each with input, output and explanation.
3. Include meaningful constraints and edge cases.
4. Match the requested topic and difficulty.
5. Do not copy a well-known problem verbatim.
6. Keep the problem suitable for function-based coding interviews.
7. The user implements a function or class method. They do NOT parse stdin
   or print the answer themselves.
8. Define exactly one primary function or method signature.
9. All four languages must represent the same algorithmic interface.
10. Do not put the solution or its algorithm explanation in the description.
11. Every test case input must strictly satisfy all stated constraints (array lengths, value bounds).
12. The JavaScript reference solution must be fully correct, match the stated problem, and handle all boundary conditions.

FUNCTION INTERFACE:
- JavaScript: a named function that returns the answer.
- Python: a named function that returns the answer.
- Java: a public method in class Solution that returns the answer.
- C++: a public method in class Solution that returns the answer.
- Choose suitable parameter and return types for the problem.
- Use standard JSON-compatible values for test inputs and expected outputs.
- Arrays map to language-appropriate arrays/lists/vectors.
- Strings map to strings.
- Integers and booleans map to equivalent primitive types.
- Use nested arrays or objects only if the problem needs them.
- Do not use custom data structures unless their interface is fully defined.

TEST CASE REQUIREMENTS:
1. Generate between 6 and 10 test cases.
2. Every test case must contain:
   - input: an object whose keys match the function parameters.
   - expectedOutput: the exact expected return value.
   - isHidden: a boolean.
3. Include at least two visible cases and at least three hidden cases.
4. Cover normal cases, boundary cases and relevant edge cases.
5. Ensure each expectedOutput is mathematically correct for its input.
   CRITICAL MATHEMATICAL CONSISTENCY:
   - Your reference solution MUST execute and compute the EXACT expectedOutput for EVERY test case and example.
   - Do NOT guess, approximate, or output off-by-one values.
   - If the problem defines a condition over ANY pair of elements (e.g. at most k elements strictly between occurrences), you MUST evaluate all valid pairs according to that exact mathematical rule, not merely adjacent pairs.
6. Test inputs and expected outputs must be JSON-serializable.
7. Do not use undefined, NaN, Infinity, functions, or language-specific objects.
8. Every test case must match the same function signature.
9. Do not make hidden test cases visible in the problem description or examples.
10. Examples must agree with their corresponding visible test cases.

BOILERPLATES:
- Provide valid starter code for JavaScript, Python, Java and C++.
- Include the function or method signature and a placeholder body.
- Do not include a complete solution.
- Use the exact same logical parameter names and return behavior in all languages.
- Java and C++ must use class Solution.
- Avoid unsupported or ambiguous types.

REFERENCE SOLUTION:
- Provide a complete, fully working reference solution in JavaScript.
- The reference solution MUST implement the exact same function name and parameters as boilerplates.javascript.
- The primary function must be declared first.
- The function must directly return the answer.
- The reference solution MUST execute cleanly and pass 100% of the generated test cases. If referenceSolution(input) !== expectedOutput on ANY test case, the problem is rejected.
- Time Complexity: State the honest asymptotic time complexity (e.g. O(n), O(n log n)).
  CRITICAL: Do NOT claim O(n) or O(1) complexity if your implementation contains nested loops or quadratic operations.
- Space Complexity: State the true space complexity (e.g. O(1), O(n)).

OUTPUT:
Return ONLY one valid JSON object without Markdown fences.

Use exactly this schema:
{
  "title": "Problem title",
  "description": "Complete problem statement",
  "examples": [
    {
      "input": "Human-readable input",
      "output": "Human-readable output",
      "explanation": "Why the output is correct"
    },
    {
      "input": "Human-readable input",
      "output": "Human-readable output",
      "explanation": "Why the output is correct"
    }
  ],
  "constraints": [
    "Constraint 1",
    "Constraint 2"
  ],
  "boilerplates": {
    "javascript": "function exampleName(arg) {\\n  // Your code here\\n}",
    "python": "def example_name(arg):\\n    pass",
    "java": "class Solution { public ReturnType exampleName(Type arg) { } }",
    "cpp": "class Solution { public: ReturnType exampleName(Type arg) { } };"
  },
  "referenceSolution": {
    "language": "javascript",
    "code": "function exampleName(arg) {\\n  // complete working solution\\n}",
    "timeComplexity": "O(n)",
    "spaceComplexity": "O(1)"
  },
  "testCases": [
    {
      "input": {
        "arg": 10
      },
      "expectedOutput": 20,
      "isHidden": false
    },
    {
      "input": {
        "arg": 30
      },
      "expectedOutput": 60,
      "isHidden": true
    }
  ]
}

The schema examples are illustrative. Generate the correct parameter names,
types, boilerplates, examples and expected outputs for the actual problem.

FINAL SELF-CHECK:
- JSON syntax is valid.
- Every test case input has the correct parameters.
- All expected outputs match the problem's intended behavior and reference solution.
- At least two test cases are visible and at least three are hidden.
- Reference solution compiles and passes every test case.
- No false complexity claims.
`;

  let problem = null;
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const responseText = await generateText(prompt, {
        stage: "problem_generation",
        timeout: 45000,
        maxAttempts: 2,
        responseMimeType: "application/json",
      });
      let parsed = extractJson(responseText);

      if (!validateGeneratedProblem(parsed)) {
        throw new Error("Generated problem failed structural validation.");
      }

      let consistency = evaluateProblemConsistency(parsed);

      if (!consistency.isValid) {
        console.warn(
          `[Problem Consistency Gate] Attempt ${attempt}: Candidate consistency check failed (${consistency.summary}). Initiating diagnostic repair...`
        );
        try {
          const repaired = await repairDsaProblem({
            candidate: parsed,
            consistencyReport: consistency,
            normalizedTopic,
            matchedDifficulty,
          });

          if (validateGeneratedProblem(repaired)) {
            const repairedConsistency = evaluateProblemConsistency(repaired);
            if (repairedConsistency.isValid) {
              console.log(
                `[Problem Consistency Gate] Attempt ${attempt}: Diagnostic repair successful!`
              );
              parsed = repaired;
              consistency = repairedConsistency;
            } else {
              console.warn(
                `[Problem Consistency Gate] Attempt ${attempt}: Diagnostic repair still inconsistent (${repairedConsistency.summary}).`
              );
            }
          } else {
            console.warn(
              `[Problem Consistency Gate] Attempt ${attempt}: Repaired problem failed structural validation.`
            );
          }
        } catch (repairErr) {
          console.warn(
            `[Problem Consistency Gate] Attempt ${attempt}: Diagnostic repair encountered error:`,
            repairErr.message
          );
        }
      }

      if (!consistency.isValid) {
        throw new Error(
          `Generated problem failed consistency validation (${consistency.summary}).`
        );
      }

      // Check deduplication against excluded title
      if (
        trimmedExclude &&
        parsed.title &&
        parsed.title.trim().toLowerCase() === trimmedExclude.toLowerCase()
      ) {
        throw new Error(
          `Duplicate problem title generated: "${parsed.title}" matches current problem`
        );
      }

      // Check complexity claim honesty
      if (parsed.referenceSolution && hasComplexityMismatch(parsed.referenceSolution)) {
        console.warn(
          "[Problem Validation Gate] Correcting complexity claim: solution contains nested loops but claimed O(n) or O(1)."
        );
        parsed.referenceSolution.timeComplexity = "O(n^2)";
      }

      problem = parsed;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`Problem generation attempt ${attempt} failed:`, err.message);

      // Only break immediately if the error is permanent (e.g. invalid API key or bad auth).
      // Transient transport/timeout errors should allow attempt 2 to execute.
      const isPermanent =
        /API key not valid|PERMISSION_DENIED|INVALID_ARGUMENT|unregistered project/i.test(
          err.message || ""
        );
      if (isPermanent) {
        break;
      }
    }
  }

  if (!problem) {
    if (allowFallback) {
      if (!isGeneric && !isTopicSupported(normalizedTopic)) {
        const available = getAvailableTopics().join(", ");
        throw new Error(
          `Practice problems for topic "${normalizedTopic}" are not available in our library. Available topics: ${available}.`
        );
      }

      try {
        const blueprint = selectNextBlueprint({
          requestedTopic: isGeneric ? "Any" : normalizedTopic,
          requestedDifficulty: matchedDifficulty,
          excludeTitles: [trimmedExclude, ...recentTitles].filter(Boolean),
          recentBlueprintIds: recentBlueprints,
          recentTopics,
        });

        if (blueprint) {
          console.warn(
            `[Problem Generation] Candidate generation failed (${lastError?.message}). Recovering with verified blueprint '${blueprint.title}'.`
          );
          const canonicalProblem = buildCanonicalProblemFromBlueprint(blueprint);
          const clientSafeProblem = sanitizeProblemForClient(canonicalProblem);
          clientSafeProblem.difficulty = blueprint.difficulty;
          clientSafeProblem.topic = blueprint.topic;
          clientSafeProblem.isFallback = true;
          clientSafeProblem.fallbackReason = lastError?.message || "Verified blueprint fallback loaded";
          if (canonicalProblem.referenceSolution) {
            clientSafeProblem.referenceSolution = canonicalProblem.referenceSolution;
          }
          return {
            problem: clientSafeProblem,
            topic: blueprint.topic,
            difficulty: blueprint.difficulty,
            isFallback: true,
            fallbackReason: lastError?.message || "Verified blueprint fallback loaded",
            blueprintId: blueprint.id,
          };
        }
      } catch (bpErr) {
        if (bpErr.message && bpErr.message.includes("not available")) {
          throw bpErr;
        }
        console.warn("Blueprint fallback selection encountered issue:", bpErr.message);
      }
    }

    console.error("Invalid generated DSA problem:", lastError);
    throw new Error(
      lastError?.message || "The AI generated an invalid problem. Please try again."
    );
  }

  // Sanitize problem so hidden test inputs/outputs are never sent to the browser
  const clientSafeProblem = sanitizeProblemForClient(problem);
  clientSafeProblem.difficulty = matchedDifficulty;
  clientSafeProblem.topic = normalizedTopic;
  clientSafeProblem.isFallback = false;
  if (problem.referenceSolution) {
    clientSafeProblem.referenceSolution = problem.referenceSolution;
  }

  return {
    problem: clientSafeProblem,
    topic: normalizedTopic,
    difficulty: matchedDifficulty,
    isFallback: false,
  };
}

export async function generateProblem(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    let { topic, difficulty, excludeTitle, currentTitle, recentTitles } = req.body;

    const allowedDifficulties = ["Easy", "Medium", "Hard"];

    let normalizedTopic = String(topic || "Any").trim();
    if (!normalizedTopic || normalizedTopic.length > 100) {
      normalizedTopic = "Any";
    }

    if (!difficulty || !allowedDifficulties.includes(difficulty)) {
      let userSubmissions = [];
      if (mongoose.connection.readyState === 1) {
        userSubmissions = await DsaSubmission.find({ user: req.user.id });
      }
      const adaptive = evaluateAdaptiveDifficulty({
        submissions: userSubmissions,
        topic: normalizedTopic === "Any" ? "Arrays" : normalizedTopic,
      });
      difficulty = adaptive.targetDifficulty;
    }

    const effectiveExclude = excludeTitle || currentTitle || null;
    const userHistory = getUserRecentProblemData(req.user.id);
    const combinedRecentTitles = Array.from(
      new Set(
        [
          effectiveExclude,
          ...(Array.isArray(recentTitles) ? recentTitles : []),
          ...userHistory.recentTitles,
        ].filter(Boolean)
      )
    );

    const result = await createDsaProblem({
      topic: normalizedTopic,
      difficulty,
      excludeTitle: effectiveExclude,
      allowFallback: true,
      recentTitles: combinedRecentTitles,
      recentBlueprints: userHistory.recentBlueprints,
      recentTopics: userHistory.recentTopics,
    });

    recordUserProblemLoad(req.user.id, {
      blueprintId: result.blueprintId,
      topic: result.topic,
      title: result.problem.title,
    });

    result.problem.isFallback = Boolean(result.isFallback);
    if (result.fallbackReason) {
      result.problem.fallbackReason = result.fallbackReason;
    }

    return res.status(200).json(result.problem);
  } catch (error) {
    console.error("Error generating problem:", error);

    if (error.message && error.message.includes("not available")) {
      return res.status(404).json({
        error: error.message,
      });
    }

    if (error.message && error.message.includes("invalid problem")) {
      return res.status(502).json({
        error: error.message,
      });
    }

    const isNetworkOrTimeout =
      error.status === 503 ||
      error.name === "TimeoutError" ||
      /timed? out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(error.message || "");

    return res.status(isNetworkOrTimeout ? 503 : 500).json({
      error: isNetworkOrTimeout
        ? "Problem generation service is temporarily unavailable. Please try again shortly."
        : error.message || "Failed to generate problem. Please try again.",
    });
  }
}

/**
 * Executes candidate code against visible sample test cases only.
 * 
 * Used by the editor's "Run Code" button for quick feedback:
 * - Omits hidden test cases so edge-case inputs cannot be discovered prematurely.
 * - Does not create a persistent DsaSubmission database record or modify streak/analytics stats.
 */
export async function runCode(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    const { problem, code, language, problemId: bodyProblemId } = req.body;
    const supportedLanguages = ["javascript", "python", "java", "cpp"];

    const problemId =
      (problem && (problem.id || problem.problemId || problem._id)) ||
      bodyProblemId;

    console.log(`[DSA Controller Dev] runCode received problem ID: ${problemId}`);

    if (problem && problemId) {
      problem.id = problemId;
      problem.problemId = problemId;
    }

    if (
      !problem ||
      !problemId ||
      typeof problem.title !== "string" ||
      typeof code !== "string" ||
      !code.trim() ||
      !supportedLanguages.includes(language)
    ) {
      return res.status(400).json({
        error:
          "A valid problem with an ID, non-empty code, and supported language are required.",
      });
    }

    // Authoritatively resolve visible sample test cases only
    const visibleTestCases = resolveAuthoritativeTestCases(problem, {
      visibleOnly: true,
    });
    const strictlyVisible = visibleTestCases.filter((tc) => !tc.isHidden);

    if (strictlyVisible.length === 0) {
      return res.status(400).json({
        error: "No sample test cases found for this problem.",
      });
    }

    const executionResult = await executeCode({
      code,
      language,
      testCases: strictlyVisible,
      isRunCode: true,
    });

    return res.status(200).json(executionResult);
  } catch (error) {
    console.error("Error running code:", error.message);
    return res.status(400).json({
      error: error.message || "Failed to execute code against sample test cases.",
    });
  }
}

/**
 * Submits solution for full evaluation against ALL test cases (visible + hidden),
 * obtains AI code review feedback, persists the submission, and returns combined results.
 */
export async function evaluateCode(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    const { problem, code, language, topic, problemId: bodyProblemId } = req.body;

    const supportedLanguages = ["javascript", "python", "java", "cpp"];

    const problemId =
      (problem && (problem.id || problem.problemId || problem._id)) ||
      bodyProblemId;

    console.log(`[DSA Controller Dev] evaluateCode received problem ID: ${problemId}`);

    if (problem && problemId) {
      problem.id = problemId;
      problem.problemId = problemId;
    }

    if (
      !problem ||
      !problemId ||
      typeof problem.title !== "string" ||
      typeof problem.description !== "string" ||
      typeof code !== "string" ||
      !code.trim() ||
      typeof topic !== "string" ||
      !topic.trim() ||
      !supportedLanguages.includes(language)
    ) {
      return res.status(400).json({
        error:
          "A valid problem with an ID, non-empty code, topic, and supported language are required.",
      });
    }

    // Step 1: Authoritatively resolve the complete test suite (visible + hidden)
    const fullTestCases = resolveAuthoritativeTestCases(problem, {
      visibleOnly: false,
    });

    if (!Array.isArray(fullTestCases) || fullTestCases.length === 0) {
      return res.status(400).json({
        error:
          "Authoritative test cases could not be verified. Please regenerate the problem.",
      });
    }

    // Step 2: Execute solution against authoritative test cases
    let executionResult;
    try {
      executionResult = await executeCode({
        code,
        language,
        testCases: fullTestCases,
        isRunCode: false,
      });
    } catch (execErr) {
      console.error("Execution error during evaluation:", execErr.message);
      return res.status(400).json({
        error: execErr.message || "Failed to execute code against test cases.",
      });
    }

    // Step 3: Run Gemini code review (kept separate from test verdict determination)
    let aiFeedback = {
      correctness:
        executionResult.verdict === "Accepted"
          ? "All test cases passed successfully."
          : `Solution resulted in verdict '${executionResult.verdict}' (${executionResult.passed}/${executionResult.total} test cases passed).`,
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      optimization: "No optimizations required.",
    };

    try {
      const prompt = `
You are a careful DSA interview code reviewer.

Review the submitted code against the problem statement.
Be technically precise, explain mistakes constructively.

EXECUTION RESULT:
Verdict: ${executionResult.verdict}
Passed test cases: ${executionResult.passed} / ${executionResult.total}

PROBLEM TITLE:
${problem.title}

PROBLEM DESCRIPTION:
${problem.description}

EXAMPLES:
${JSON.stringify(problem.examples ?? [], null, 2)}

CONSTRAINTS:
${JSON.stringify(problem.constraints ?? [], null, 2)}

PROGRAMMING LANGUAGE:
${language}

USER CODE:
<user_code>
${code.slice(0, 20000)}
</user_code>

REVIEW REQUIREMENTS:
1. Correctness:
   Assess whether the code is logically correct. If tests failed with verdict ${executionResult.verdict}, explain the likely bug or logic mismatch.
2. Time complexity: Big O complexity and justification.
3. Space complexity: Auxiliary space complexity and justification.
4. Optimization: Specific actionable recommendations.

Return only one valid JSON object:
{
  "correctness": "Assessment",
  "timeComplexity": "Big O and justification",
  "spaceComplexity": "Big O and justification",
  "optimization": "Recommendations"
}
`;

      const responseText = await generateText(prompt, { stage: "code_review" });
      const parsed = extractJson(responseText);

      if (
        parsed &&
        typeof parsed === "object" &&
        ["correctness", "timeComplexity", "spaceComplexity", "optimization"].every(
          (field) => typeof parsed[field] === "string" && parsed[field].trim()
        )
      ) {
        aiFeedback = {
          correctness: parsed.correctness.trim(),
          timeComplexity: parsed.timeComplexity.trim(),
          spaceComplexity: parsed.spaceComplexity.trim(),
          optimization: parsed.optimization.trim(),
        };
      }
    } catch (geminiError) {
      console.error(
        "Gemini review error (proceeding with execution result):",
        geminiError.message
      );
    }

    // Step 4: Persist submission to database using DsaSubmission model
    try {
      const submissionDifficulty =
        problem.difficulty || req.body.difficulty || "Medium";
      const hintsUsed = Number(req.body.hintsUsed) || 0;

      const newSubmission = new DsaSubmission({
        user: req.user.id,
        problemId: problemId ? String(problemId) : null,
        problem: {
          id: problemId ? String(problemId) : null,
          title: problem.title,
          description: problem.description,
          difficulty: submissionDifficulty,
        },
        difficulty: submissionDifficulty,
        hintsUsed,
        topic,
        language,
        code,
        verdict: executionResult.verdict,
        passed: executionResult.passed,
        total: executionResult.total,
        executionTime: executionResult.executionTime,
        feedback: aiFeedback,
      });

      await newSubmission.save();
    } catch (saveError) {
      console.error("Error saving DSA submission to database:", saveError);
    }

    // Step 5: Return response with execution results and backward-compatible feedback
    return res.status(200).json({
      verdict: executionResult.verdict,
      passed: executionResult.passed,
      total: executionResult.total,
      testResults: executionResult.testResults,
      executionTime: executionResult.executionTime,
      error: executionResult.error || null,
      correctness: aiFeedback.correctness,
      timeComplexity: aiFeedback.timeComplexity,
      spaceComplexity: aiFeedback.spaceComplexity,
      optimization: aiFeedback.optimization,
      feedback: aiFeedback,
    });
  } catch (error) {
    console.error("Error evaluating code:", error);

    return res.status(500).json({
      error: "Failed to evaluate code. Please try again.",
    });
  }
}



const SUPPORTED_LANGUAGES = ["javascript", "python", "java", "cpp"];

function validateCoachInput(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).json({
      message: "Authentication required. Please sign in.",
    });
    return null;
  }

  const { problem, language } = req.body;

  if (
    !problem ||
    typeof problem.title !== "string" ||
    typeof problem.description !== "string" ||
    !problem.title.trim() ||
    !problem.description.trim()
  ) {
    res.status(400).json({
      error: "A valid problem title and description are required.",
    });
    return null;
  }

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    res.status(400).json({
      error: "A supported programming language is required.",
    });
    return null;
  }

  return { problem, language };
}


async function generateCoachResponse(res, prompt, stage = "coach_response") {
  try {
    const answer = await generateText(prompt, { stage });

    if (!answer || !answer.trim()) {
      return res.status(502).json({
        error: "The AI returned an empty response. Please try again.",
      });
    }

    return res.status(200).json({
      answer: answer.trim(),
    });
  } catch (error) {
    console.error("DSA Coach AI error:", error);

    return res.status(500).json({
      error: "Failed to generate a response. Please try again.",
    });
  }
}

export async function getHint(req, res) {
  const validated = validateCoachInput(req, res);
  if (!validated) return;

  const { problem, language } = validated;
  const { code = "", hintLevel = 1, previousHints = [] } = req.body;

  const levelDescriptions = {
    1: "Hint 1: A small conceptual nudge pointing toward the underlying pattern or suitable data structure.",
    2: "Hint 2: A more specific observation, key mathematical property, invariant, or subproblem structure.",
    3: "Hint 3: The key algorithmic insight or direction that unlocks the solution without giving away raw code.",
  };

  const levelInstruction =
    levelDescriptions[hintLevel] || levelDescriptions[1];

  const prompt = `
You are Pepe, a concise and encouraging DSA interview coach.

PROBLEM:
Title: ${problem.title}
Description: ${problem.description}

Examples:
${JSON.stringify(problem.examples ?? [])}

Language: ${language}

Learner's current code:
${String(code).slice(0, 12000) || "No code written yet."}

CURRENT COACHING STAGE:
${levelInstruction}

PREVIOUS HINTS ALREADY PROVIDED:
${Array.isArray(previousHints) && previousHints.length > 0
      ? previousHints.map((h, i) => `Hint ${i + 1}: ${h}`).join("\n")
      : "None yet."
    }

CRITICAL RULES:
1. Provide exactly ONE distinct hint for this stage in 2-3 short sentences.
2. DO NOT repeat or simply rephrase any previous hints. Add a genuinely new, more specific insight.
3. If user code exists, you may note a high-level issue or missing check without rewriting the code.
4. Do NOT reveal the complete algorithm or give full solution code.
5. Use plain text or simple Markdown only. No LaTeX ($ or $$).
6. Return only the hint text.
`;

  return generateCoachResponse(res, prompt);
}


export async function explainApproach(req, res) {
  const validated = validateCoachInput(req, res);
  if (!validated) return;

  const { problem, language } = validated;

  const prompt = `
You are Pepe, an experienced and articulate DSA interview coach.
Explain the recommended approach clearly and concisely.

PROBLEM:
Title: ${problem.title}
Description: ${problem.description}

Examples:
${JSON.stringify(problem.examples ?? [])}

Target language: ${language}

Use exactly these four sections:

### Core idea
Explain the main insight in 2-3 sentences.

### Algorithm
Give 3-5 numbered steps. Explain what the algorithm does conceptually,
not the complete implementation.

### Complexity
State time and auxiliary space complexity using plain text,
for example O(n) or O(1), with one short justification each.

### Correctness intuition
Explain in 1-2 sentences why the approach solves the problem and handles boundary conditions.

STRICT OUTPUT RULES:
1. Keep the complete response under 250 words.
2. Do not include a dry run unless essential.
3. Do not provide the full code block.
4. Do not repeat the problem statement.
5. If the problem involves subarrays or peaks/valleys, clarify that subarray endpoints only have one neighbor within the subarray and cannot be peaks or valleys.
6. Use normal Markdown headings, numbered lists, and inline code where useful.
7. Write mathematical expressions in plain text (e.g. nums[i] = target - nums[j]).
8. Never use LaTeX, $$, \\text{}, or escaped Markdown.
9. Return only the explanation.
`;

  return generateCoachResponse(res, prompt);
}


export async function showSolution(req, res) {
  const validated = validateCoachInput(req, res);
  if (!validated) return;

  const { problem, language } = validated;

  const prompt = `
You are an expert competitive programmer and DSA interview coach.

PROBLEM:
Title: ${problem.title}
Description: ${problem.description}

Examples:
${JSON.stringify(problem.examples ?? [])}

Constraints:
${JSON.stringify(problem.constraints ?? [])}

Required language: ${language}

Available boilerplate:
${JSON.stringify(problem.boilerplates?.[language] ?? null)}

SPECIAL PROBLEM ACCURACY RULES:
1. If the problem involves subarrays with peak/valley conditions (such as Max Peak-Valley Balance):
   - By definition, an element in a subarray is a peak only if it has two neighbors in that subarray and is strictly greater than both.
   - An element in a subarray is a valley only if it has two neighbors in that subarray and is strictly smaller than both.
   - Therefore, elements at the endpoints of the selected subarray (first and last elements) CANNOT be peaks or valleys of that subarray.
   - Any transformed score array must never count subarray boundary endpoints.
   - Empty or length < 3 subarrays have 0 interior elements and balance 0.
2. Ensure the code is strictly correct, handles edge cases (empty array, single element, negative numbers, duplicates), and respects the given function signature.
3. Never claim the code was executed in a sandbox.

RESPONSE FORMAT:

### Approach
Explain the core idea in no more than 3 sentences.

### Code
Provide the complete implementation in exactly one fenced code block (\`\`\`${language} ... \`\`\`).
Use the requested language and respect the provided function signature.

### Complexity
State time and auxiliary space complexity, each with a brief justification.

Return only the formatted Markdown response.
`;

  return generateCoachResponse(res, prompt);
}

/**
 * Wraps a promise with a client-side timeout to prevent hanging on stalled network/driver calls.
 * Ensures that timers are cleaned up immediately when the promise settles.
 */
export function withBoundedTimeout(promise, ms = 3000, operationName = "Operation") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${operationName} timed out after ${ms}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });

  return Promise.race([
    Promise.resolve(promise),
    timeoutPromise,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Detects unambiguous user requests to create or load a new DSA problem in the Arena
 * (e.g., "give me a new problem", "another problem", "next question", "generate an easy array problem").
 * Excludes conversational queries, company-catalog inquiries, and coaching requests (hints, solutions, approach).
 */
export function isUnambiguousProblemRequest(message, action = "chat", isCompanyCatalogRequest = false) {
  if (action !== "chat" || isCompanyCatalogRequest) {
    return false;
  }

  const text = String(message || "").trim();
  if (!text) return false;

  // If the user is asking for hints, approaches, explanations, solutions, or debugging of an existing problem
  if (/\b(?:hint|approach|solution|explain|explanation|clue|answer|review|fix|bug|test case|debug)\b/i.test(text)) {
    return false;
  }

  // Quick follow-ups: "another problem", "next problem", "next question", "another problem, please"
  if (/^(?:please\s+)?(?:another|next|new)\s+(?:problem|question)(?:[,\s]+please)?[.!?]?$/i.test(text)) {
    return true;
  }

  // Explicit creation/generation request:
  // "give me a new problem", "generate a hard tree problem", "create another question", "give me a problem"
  if (/\b(?:give me|generate|create|load)\s+(?:a|an|another|the|next)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*[\w\s]*?(?:problem|question)\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Loads a newly created DSA problem and generates Pepe's confirmation message.
 * Shared between direct generation requests and conversational tool calls.
 */
async function loadAndConfirmDsaProblem({
  targetTopic,
  targetDifficulty,
  trimmedMessage,
  detectedCompany,
  updatedProfile,
  adaptiveAssessment,
  problem,
  res,
  userId,
}) {
  try {
    const userHistory = getUserRecentProblemData(userId);
    const combinedRecentTitles = Array.from(
      new Set([problem?.title, ...userHistory.recentTitles].filter(Boolean))
    );

    const result = await createDsaProblem({
      topic: targetTopic,
      difficulty: targetDifficulty,
      excludeTitle: problem?.title,
      allowFallback: true,
      recentTitles: combinedRecentTitles,
      recentBlueprints: userHistory.recentBlueprints,
    });

    recordUserProblemLoad(userId, {
      blueprintId: result.blueprintId,
      topic: result.topic,
      title: result.problem.title,
    });

    const isHinglish = /\b(bhai|karo|do|kuch|sawaal|chahiye|agla|naya|dikhao|batao|khel|shuru|problem)\b/i.test(trimmedMessage || "");
    const reasonText = adaptiveAssessment?.reason ? `(${adaptiveAssessment.reason})` : "";

    let confirmationAnswer = "";
    if (result.isFallback) {
      confirmationAnswer = isHinglish
        ? `Live variation me validation delay tha, toh aapki practice smooth rakhne ke liye maine verified problem **"${result.problem.title}"** [${result.difficulty} • ${result.topic}] DSA Arena me load kar diya hai! ${reasonText} Shuru ho jao, aur hint chahiye ho toh batao!`
        : `To guarantee 100% test accuracy and uninterrupted practice, I've loaded our verified practice problem **"${result.problem.title}"** [${result.difficulty} • ${result.topic}] into your DSA Arena. ${reasonText} Give it your best shot, and ask me whenever you need a hint!`;
    } else {
      confirmationAnswer = isHinglish
        ? `Maine aapke DSA Arena me ek naya practice problem load kar diya hai: **"${result.problem.title}"** [${result.difficulty} • ${result.topic}]! ${reasonText} Code likhna shuru karo, Pepe bhai hamesha saath hai!`
        : `I've generated a fresh practice problem **"${result.problem.title}"** [${result.difficulty} • ${result.topic}] and loaded it into your DSA Arena. ${reasonText} Try solving it, and ask me for a hint whenever you need one!`;
    }

    confirmationAnswer = sanitizeAiProblemConfirmation(
      confirmationAnswer,
      result,
      detectedCompany
    );

    return res.status(200).json({
      answer: confirmationAnswer,
      action: "load_problem",
      problem: result.problem,
      topic: result.topic,
      difficulty: result.difficulty,
      isFallback: Boolean(result.isFallback),
      blueprintId: result.blueprintId,
      onboardingProfile: updatedProfile,
      adaptiveAssessment: {
        currentDifficulty: adaptiveAssessment?.currentDifficulty || "Medium",
        targetDifficulty: result.difficulty,
        action: adaptiveAssessment?.action || "maintain",
        reason: adaptiveAssessment?.reason || "Practicing at standard difficulty.",
        isExplicit: Boolean(adaptiveAssessment?.isExplicit),
      },
    });
  } catch (err) {
    console.error("Execution failed for createDsaProblem:", err);
    let errorAnswer = `I tried to generate a ${targetDifficulty} ${targetTopic} problem for your DSA Arena, but encountered an error: ${err.message}. Please try asking again.`;
    if (err.message && err.message.includes("not available")) {
      const available = getAvailableTopics().join(", ");
      errorAnswer = `Currently, practice problems for **${targetTopic}** are not available in our verified library. You can practice with any of these topics: **${available}**! Which one would you like to try?`;
    }
    return res.status(200).json({
      answer: errorAnswer,
      action: "chat",
      onboardingProfile: updatedProfile,
      adaptiveAssessment: {
        currentDifficulty: adaptiveAssessment?.currentDifficulty || "Medium",
        targetDifficulty: targetDifficulty || "Medium",
        action: adaptiveAssessment?.action || "maintain",
        reason: adaptiveAssessment?.reason || "Practicing at standard difficulty.",
        isExplicit: Boolean(adaptiveAssessment?.isExplicit),
      },
    });
  }
}

/**
 * Unified multi-turn conversational chat, onboarding, study plan generation,
 * progressive coaching, and failed-test debugging for Pepe AI Coach.
 */
export async function coachChat(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    const {
      message = "",
      action = "chat", // "chat" | "hint" | "approach" | "solution" | "debug" | "plan"
      history = [],
      problem = null,
      code = "",
      language = "javascript",
      hintLevel = 1,
      previousHints = [],
      onboardingProfile = null,
      plan = null,
      execution = null,
      evaluationError = null,
    } = req.body;

    const trimmedMessage = String(message || "").trim();

    if (!trimmedMessage && !action) {
      return res.status(400).json({
        error: "A message or coach action is required.",
      });
    }

    // Auto-detect debugging intent if action was sent as general chat but user specifically asks to debug failing code
    let effectiveAction = action;
    const isExplicitDebugMessage =
      /\b(?:debug|why did my (?:code|test|submission) fail|why is my (?:code|solution) (?:wrong|failing)|where is the bug|what is wrong with my code)\b/i.test(
        trimmedMessage
      );
    if (effectiveAction === "chat" && (execution || evaluationError) && isExplicitDebugMessage) {
      effectiveAction = "debug";
    }

    const userId = req.user?.id;
    let activeProfile = onboardingProfile;
    let activePlan = plan;

    // Load persisted study plan if client didn't supply full profile/plan
    if (userId && mongoose.Types.ObjectId.isValid(userId) && mongoose.connection.readyState === 1) {
      try {
        const persistedDoc = await withBoundedTimeout(
          StudyPlan.findOne({ user: userId }).maxTimeMS(3000),
          3000,
          "StudyPlan.findOne"
        );
        if (!activeProfile && persistedDoc?.onboardingProfile) {
          activeProfile = persistedDoc.onboardingProfile;
        }
        if (!activePlan && persistedDoc?.plan) {
          activePlan = persistedDoc.plan;
        }
      } catch (err) {
        console.warn("Failed to load user StudyPlan for coach context:", err.message);
      }
    }

    // Fetch user submission history to ground personalized plans in real performance
    let userStats = null;
    let userSubmissionsList = [];
    if (userId && mongoose.Types.ObjectId.isValid(userId) && mongoose.connection.readyState === 1) {
      try {
        const userSubmissions = await withBoundedTimeout(
          DsaSubmission.find({ user: userId }).maxTimeMS(3000),
          3000,
          "DsaSubmission.find"
        );
        userSubmissionsList = userSubmissions;
        userStats = calculateDsaStats(userSubmissions);
      } catch (statsErr) {
        console.warn("Failed to fetch user submissions for coach context:", statsErr.message);
      }
    }

    if (userSubmissionsList.length === 0 && Array.isArray(req.body?.submissions) && req.body.submissions.length > 0) {
      userSubmissionsList = req.body.submissions;
      if (!userStats) {
        userStats = calculateDsaStats(userSubmissionsList);
      }
    }

    // Detect company question intent, difficulty, and topic filters if present in message
    let detectedCompany = null;
    let companyQuestionsResult = null;
    let filterDifficulty = null;
    let filterTopic = null;

    const companyRegex = /\b(amazon|amzn|google|goog|microsoft|msft|meta|facebook|fb|apple|aapl|netflix|nflx|uber|lyft|salesforce|adobe|bloomberg|goldman\s*sachs|goldman|jpmorgan|jp\s*morgan|morgan\s*stanley|stripe|bytedance|tiktok|atlassian|palantir|twitter|x|linkedin|walmart|oracle|cisco|airbnb|amd|nvidia|intel|snowflake|databricks|spotify|pinterest|snap|snapchat|dropbox|coinbase|robinhood|barclays|blackrock|blackstone)\b/i;
    const companyMatch = trimmedMessage.match(companyRegex);

    if (companyMatch) {
      detectedCompany = normalizeCompanyName(companyMatch[1]);
    }

    const diffMatch = trimmedMessage.match(/\b(easy|medium|hard)\b/i);
    if (diffMatch) {
      filterDifficulty = diffMatch[1][0].toUpperCase() + diffMatch[1].slice(1).toLowerCase();
    }

    const topicMatch = trimmedMessage.match(/\b(array|arrays|string|strings|dynamic programming|dp|tree|trees|graph|graphs|binary search|hash table|hash map|two pointers|stack|queue|recursion|greedy|heap|linked list)\b/i);
    if (topicMatch) {
      filterTopic = topicMatch[1];
    }

    // Evaluate adaptive difficulty based on user's real performance history
    const explicitDiffFromMsg = extractExplicitDifficulty(trimmedMessage);
    const targetTopicForAssessment = filterTopic || (problem?.topic || "Arrays");
    let adaptiveAssessment = null;

    try {
      adaptiveAssessment = evaluateAdaptiveDifficulty({
        submissions: userSubmissionsList,
        topic: targetTopicForAssessment,
        requestedDifficulty: explicitDiffFromMsg || filterDifficulty,
        message: trimmedMessage,
        userProfile: activeProfile,
        activePlan,
      });
    } catch (evalErr) {
      console.warn("Adaptive difficulty evaluation encountered a recoverable issue, using safe default:", evalErr);
      const fallbackDiff = explicitDiffFromMsg || filterDifficulty || "Medium";
      adaptiveAssessment = {
        targetDifficulty: fallbackDiff,
        currentDifficulty: fallbackDiff,
        action: "maintain",
        reason: "Practicing at standard difficulty.",
        isExplicit: Boolean(explicitDiffFromMsg || filterDifficulty),
        recentSummary: {
          consecutiveSolves: 0,
          consecutiveFailures: 0,
          averageHints: 0,
          averagePassRatio: 0,
        },
      };
    }

    if (companyMatch) {
      const excludeSlugs = userSubmissionsList
        .map((s) => s.problemId || (s.problem?.title ? s.problem.title.toLowerCase().replace(/\s+/g, "-") : null))
        .filter(Boolean)
        .slice(-20);

      const requestedCount = extractQuestionCount(trimmedMessage);
      const effectiveCompanyDifficulty = filterDifficulty || adaptiveAssessment.targetDifficulty;

      try {
        if (mongoose.connection.readyState === 1) {
          companyQuestionsResult = await withBoundedTimeout(
            getCompanyQuestions({
              company: detectedCompany,
              difficulty: effectiveCompanyDifficulty,
              topic: filterTopic,
              limit: requestedCount,
              excludeSlugs,
            }),
            3000,
            "getCompanyQuestions"
          );
        }
      } catch (catErr) {
        console.warn("Failed to retrieve company questions for prompt:", catErr.message);
      }
    }

    const isExplicitAiGenRequest =
      /\b(?:ai-generated|ai generated|ai practice|generate an? ai|create an? ai|original ai|synthetic)\b/i.test(trimmedMessage);

    const isCompanyQuestionQuery =
      /\b(?:question|questions|problem|problems|interview questions|dsa questions|leetcode|give me|show me|find|list|tag|tags|catalog)\b/i.test(trimmedMessage) ||
      Boolean(filterDifficulty) ||
      Boolean(filterTopic);

    const isCompanyCatalogRequest =
      Boolean(detectedCompany) &&
      !isExplicitAiGenRequest &&
      isCompanyQuestionQuery;

    let updatedProfile = onboardingProfile ? { ...onboardingProfile } : null;

    // Finding 2: Direct routing for unambiguous problem generation requests
    // (e.g. "give me a new problem", "another problem, please", "next question", "generate an easy array problem")
    // Avoids an unnecessary multi-second general conversational LLM call before problem creation.
    const isDirectProblemRequest = isUnambiguousProblemRequest(
      trimmedMessage,
      effectiveAction,
      isCompanyCatalogRequest
    );

    if (isDirectProblemRequest) {
      let extractedTopic = filterTopic;
      if (!extractedTopic) {
        const topicMatch = trimmedMessage.match(
          /\b(array|arrays|string|strings|dynamic programming|dp|tree|trees|graph|graphs|binary search|hash table|hash map|two pointers|stack|queue|recursion|greedy|heap|linked list|trie|tries|bit manipulation|segment tree|disjoint set|union find)\b/i
        );
        if (topicMatch) {
          extractedTopic = topicMatch[1];
        } else {
          const generalMatch = trimmedMessage.match(/\b(?:give me|load|generate)\s+(?:an?|the)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*([a-zA-Z\s]+?)\s*(?:problem|question)\b/i);
          if (generalMatch && generalMatch[1].trim()) {
            const candidateTopic = generalMatch[1].trim().toLowerCase();
            if (!["dsa", "coding", "practice", "programming", "algo", "algorithm", "good", "next", "another", "new"].includes(candidateTopic)) {
              extractedTopic = generalMatch[1].trim();
            }
          }
        }
      }
      const targetTopic = extractedTopic || "Any";
      const targetDifficulty =
        explicitDiffFromMsg ||
        filterDifficulty ||
        adaptiveAssessment?.targetDifficulty ||
        "Medium";

      return await loadAndConfirmDsaProblem({
        targetTopic,
        targetDifficulty,
        trimmedMessage,
        detectedCompany,
        updatedProfile,
        adaptiveAssessment,
        problem,
        res,
        userId: req.user?.id,
      });
    }

    // Build context
    let contextPrompt = `You are Pepe, PrepAI's intelligent, friendly, encouraging, and technically sharp DSA coach.
Your mission is to guide users through DSA interview preparation:
- Help users onboard and craft personalized, realistic weekly study plans based on their goals, weak topics, and daily study time.
- Answer general questions, small talk, and interview prep queries naturally and engagingly.
- When an active problem is provided, deliver progressive hints, approach explanations, solution code, or diagnosis of failed code.
- Respond naturally to greetings (e.g. "Hi, my name is Aman"), small talk, doubts, frustration, or conversational prompts (e.g. "You can't talk").
- NEVER reply with a rigid generic error or canned refusal menu when the user speaks naturally.
- Never claim you ran code or verified tests when you did not.
- Never invent expected outputs or reveal confidential hidden test cases.
`;

    if (activeProfile && typeof activeProfile === "object" && Object.keys(activeProfile).length > 0) {
      contextPrompt += `\nUSER ONBOARDING PROFILE:
- Target Companies: ${activeProfile.targetCompanies || "Not specified yet"}
- Topics Covered: ${activeProfile.topicsCovered || "Not specified yet"}
- Skill Level / Weak Topics: ${activeProfile.weakTopics || activeProfile.skillLevel || "Not specified yet"}
- Daily Study Time: ${activeProfile.dailyTime || "Not specified yet"}
- Preferred Schedule: ${activeProfile.schedule || "Not specified yet"}
`;
      if (activeProfile.targetCompanies || activeProfile.dailyTime) {
        contextPrompt += `NOTE: The user has already completed onboarding. DO NOT re-ask the initial onboarding questions unless the user explicitly asks to restart or change them.\n`;
      }
    }

    if (activePlan && typeof activePlan === "object" && (activePlan.schedule?.length || activePlan.title)) {
      contextPrompt += `\nCURRENT STUDY PLAN:
${JSON.stringify(activePlan, null, 2)}
`;
    }

    if (userStats) {
      if (userStats.totalAttempts > 0) {
        contextPrompt += `\nREAL USER SUBMISSION PERFORMANCE (AUTHORITATIVE HISTORICAL STATS):
- Total Attempts: ${userStats.totalAttempts}
- Total Successful Attempts (Accepted): ${userStats.acceptedAttempts}
- Unique Successfully Solved Problems: ${userStats.uniqueSolved}
- Overall Acceptance Rate: ${userStats.acceptanceRate}%
- Topic Breakdown:
${userStats.topicBreakdown.map((t) => `  * ${t.topic}: ${t.uniqueSolved} unique solved / ${t.attempts} attempts (${t.acceptanceRate}% acceptance rate)${t.needsImprovement ? " [NEEDS IMPROVEMENT]" : ""}`).join("\n")}

INSTRUCTIONS FOR STUDY PLAN CREATION / UPDATES:
- Use the real submission data above to personalize the plan. Allocate more focus/days to topics marked [NEEDS IMPROVEMENT] or with 0 solved problems.
- Acknowledge their strengths where acceptance rate is high.
`;
      } else {
        contextPrompt += `\nREAL USER SUBMISSION PERFORMANCE:
- User is new and has 0 submissions so far.
- Formulate a balanced starter plan based on their stated target companies, weak topics, and daily available study time without mentioning negative stats.
`;
      }
    }

    if (adaptiveAssessment) {
      contextPrompt += `\nADAPTIVE DIFFICULTY ASSESSMENT:
- Current Demonstrated Level: ${adaptiveAssessment.currentDifficulty}
- Recommended Next Difficulty: ${adaptiveAssessment.targetDifficulty} (${adaptiveAssessment.action.toUpperCase()} action)
- Performance Context: ${adaptiveAssessment.reason}
- Recent Performance Metrics: ${adaptiveAssessment.recentSummary.consecutiveSolves} consecutive solves, ${adaptiveAssessment.recentSummary.consecutiveFailures} consecutive failures, ${adaptiveAssessment.recentSummary.averageHints} avg hints used, ${Math.round(adaptiveAssessment.recentSummary.averagePassRatio * 100)}% test pass ratio.
${adaptiveAssessment.isExplicit ? "- NOTE: User explicitly specified difficulty or requested to maintain level. Honor their preference." : "- Apply this recommended difficulty when generating or selecting practice problems."}
`;
    }

    if (problem && problem.title) {
      contextPrompt += `\nACTIVE DSA PROBLEM:
Title: ${problem.title}
Description: ${problem.description}
Examples: ${JSON.stringify(problem.examples ?? [])}
Constraints: ${JSON.stringify(problem.constraints ?? [])}
Language: ${language}
User's Code in Editor:
${String(code).slice(0, 10000) || "No code written yet."}
`;
    }

    // Handle specific actions or construct conversation
    if (effectiveAction === "debug") {
      // Normalize execution diagnostics from either execution object or evaluationError string/object
      let resolvedExecution = execution;
      if (!resolvedExecution && evaluationError) {
        resolvedExecution = {
          verdict: typeof evaluationError === "string" && /syntax|compile|compilation|syntaxerror/i.test(evaluationError)
            ? "Compilation Error"
            : "Runtime Error",
          error: typeof evaluationError === "string" ? evaluationError : (evaluationError.error || JSON.stringify(evaluationError)),
          passed: 0,
          total: problem?.testCases?.length || 0,
        };
      } else if (typeof resolvedExecution === "string") {
        resolvedExecution = {
          verdict: /syntax|compile|compilation|syntaxerror/i.test(resolvedExecution)
            ? "Compilation Error"
            : "Runtime Error",
          error: resolvedExecution,
          passed: 0,
          total: problem?.testCases?.length || 0,
        };
      }

      let failureDetails = "";
      if (resolvedExecution) {
        failureDetails += `Verdict: ${resolvedExecution.verdict || "Evaluation Failed"}\n`;
        failureDetails += `Passed Test Cases: ${resolvedExecution.passed ?? 0} / ${resolvedExecution.total ?? 0}\n`;
        if (resolvedExecution.error) {
          failureDetails += `Error Output / Diagnostics: ${resolvedExecution.error}\n`;
        }
        if (Array.isArray(resolvedExecution.testResults)) {
          const visibleFailed = resolvedExecution.testResults.filter(
            (t) => !t.passed && !t.isHidden
          );
          if (visibleFailed.length > 0) {
            failureDetails += `Visible failed test cases:\n${JSON.stringify(
              visibleFailed.map((t) => ({
                input: t.input,
                expected: t.expected !== undefined ? t.expected : t.expectedOutput,
                actual: t.actual,
                runtimeError: t.runtimeError,
              })),
              null,
              2
            )}\n`;
          }
          const hiddenFailed = resolvedExecution.testResults.filter(
            (t) => !t.passed && t.isHidden
          );
          if (hiddenFailed.length > 0) {
            failureDetails += `${hiddenFailed.length} hidden test case(s) failed. (Hidden test inputs/outputs are private and must NEVER be guessed, invented, or revealed).\n`;
          }
        }
      }

      contextPrompt += `\nDEBUGGING TASK:
The user has requested debugging assistance for their current code in the editor.
Execution Diagnostics:
${failureDetails || "No execution results available yet (code has not been run or no failures recorded)."}

USER QUERY:
${trimmedMessage || "Please debug my code and explain why it failed."}

CRITICAL DEBUGGING INSTRUCTIONS:
1. PINPOINT THE USER'S CODE: Focus directly on 'User's Code in Editor'. Cite the exact function, line, variable names, conditions, or loop boundaries (e.g. \`nums[i] + nums[i+1]\`, \`i < nums.length\`) that cause the issue.
2. DO NOT GIVE A GENERIC LECTURE: Do NOT re-explain the entire problem statement or give a broad theoretical lecture on algorithms. Stay laser-focused on their code and why it produced the failure.
3. GROUND IN THE EXECUTION DETAILS:
   - If visible test cases failed with Wrong Answer: Walk through the first failing input step-by-step with their code, showing why it produced \`actual\` instead of \`expected\`.
   - If Verdict is Compilation Error or Runtime Error: Point directly to the syntax/runtime error in their code indicated by the error diagnostics.
   - If only hidden test cases failed: Explain unhandled edge cases in their algorithmic logic (e.g. single element, negatives, duplicates, boundary indices) without inventing or revealing hidden inputs.
   - If no execution details are available: Check if the user wrote code in the editor. If empty, ask them to write code. If code exists, analyze it for likely syntax or algorithmic flaws and suggest running the code to verify.
4. TARGETED GUIDANCE: Explain what logical adjustment is needed concisely. Do not dump the entire solution code unless specifically requested.
5. DECISIVE DIAGNOSIS WITHOUT SELF-CONTRADICTION: Deliver a single, clear diagnosis in Pepe's encouraging voice. Do not debate yourself, repeat internal monologues, or loop through rhetorical self-questions ("Wait! Why did it expect X?"). Ground the explanation strictly in the code and provided diagnostics.
6. HONEST LIMITATIONS: If execution details or code are missing, state that limitation clearly and suggest running the code, rather than inventing imaginary failing inputs or line numbers.
`;
    } else if (effectiveAction === "hint") {
      const hintTitles = {
        1: "Hint 1: Conceptual nudge on problem pattern and structure.",
        2: "Hint 2: Specific observation, mathematical invariant, or boundary property.",
        3: "Hint 3: Key algorithmic insight, recurrence, or data structure direction.",
      };
      contextPrompt += `\nHINT REQUEST (Stage ${hintLevel}):
${hintTitles[hintLevel] || hintTitles[1]}
Previous hints already provided:
${Array.isArray(previousHints) && previousHints.length > 0
          ? previousHints.map((h, i) => `Hint ${i + 1}: ${h}`).join("\n")
          : "None yet."
        }
RULES:
1. Give exactly ONE useful hint in 2-3 sentences.
2. DO NOT repeat or rephrase previous hints.
3. Point out new direction without giving away complete code.
`;
    } else if (effectiveAction === "approach") {
      contextPrompt += `\nAPPROACH EXPLANATION REQUEST:
The user is asking for a clear conceptual explanation of the algorithm/approach to solve this problem.
RULES:
1. Explain the intuition step-by-step (e.g. brute force vs optimal).
2. Outline the algorithmic steps clearly.
3. Mention time and space complexities.
4. DO NOT provide the full solution code yet (leave implementation to the user).
`;
    } else if (effectiveAction === "solution") {
      let refSolutionNote = "";
      if (problem?.referenceSolution?.code) {
        refSolutionNote = `\nVALIDATED REFERENCE ALGORITHM:\n${problem.referenceSolution.code}\nTime Complexity: ${problem.referenceSolution.timeComplexity || "O(n)"}\nSpace Complexity: ${problem.referenceSolution.spaceComplexity || "O(1)"}\nUse this verified algorithm as the foundation for your solution in \`${language}\`.\n`;
      }

      contextPrompt += `\nCOMPLETE SOLUTION REQUEST:
The user has requested the full reference solution.
${refSolutionNote}
RULES:
1. State the optimal approach and honest time/space complexity accurately.
2. Provide the complete, working, optimal solution in \`${language}\`.
3. Wrap the solution code in a \`\`\`${language} markdown code block.
4. Ensure the function signature exactly matches the active problem's requirement.
5. Explain key lines or edge cases handled in the code.
6. Do NOT claim O(n) complexity if your implementation contains nested loops or quadratic operations.
`;
    } else {
      // General conversation or onboarding
      if (Array.isArray(history) && history.length > 0) {
        contextPrompt += `\nRECENT CONVERSATION HISTORY:\n`;
        const recent = history.slice(-8);
        for (const item of recent) {
          contextPrompt += `${item.role === "user" ? "User" : "Pepe"}: ${item.text}\n`;
        }
      }

      contextPrompt += `\nUSER'S LATEST MESSAGE:
${trimmedMessage}

INSTRUCTIONS:
1. If the user is introducing themselves, greeting, asking how you can help, or making small talk, respond warmly as Pepe.
2. If the user mentions target companies, available daily time, or topics covered/weak:
   - Acknowledge those details warmly.
   - Enclose updated profile fields in \`[PROFILE_JSON]{"targetCompanies": "...", "weakTopics": "...", "dailyTime": "...", "topicsCovered": "..."}[/PROFILE_JSON]\`.
   - Never re-ask questions that are already answered in USER ONBOARDING PROFILE.
3. If the user asks to generate, create, load, or practice a general DSA problem (and is NOT asking for questions from a specific company catalog):
   - Choose topic from user message, weak topics, or study plan (default to Arrays).
   - Adapt to the recommended difficulty (${adaptiveAssessment.targetDifficulty}) unless user explicitly requested another.
   - YOU MUST call the generate_problem tool:
     [TOOL_CALL:generate_problem]
     {"topic": "<extracted topic or Arrays>", "difficulty": "${adaptiveAssessment.targetDifficulty}"}
     [/TOOL_CALL]
   - Explain the difficulty choice naturally, briefly, and warmly in Pepe's voice based on their performance: "${adaptiveAssessment.reason}".
   - DO NOT write a problem statement, description, or test cases in your chat text. The arena will load it automatically!
4. If the user asks for a study plan or to personalize/revise their plan:
   - Provide a concise conversational overview.
   - Enclose a structured JSON study plan in \`[PLAN_JSON]...[/PLAN_JSON]\` tag using this schema:
     {
       "title": "Personalized Weekly Plan Title",
       "dailyTarget": "e.g. 60 min daily",
       "focusAreas": "e.g. Graphs & DP for FAANG",
       "schedule": [
         {"day": "Monday", "topic": "...", "task": "..."},
         {"day": "Tuesday", "topic": "...", "task": "..."},
         {"day": "Wednesday", "topic": "...", "task": "..."},
         {"day": "Thursday", "topic": "...", "task": "..."},
         {"day": "Friday", "topic": "...", "task": "..."},
         {"day": "Saturday", "topic": "...", "task": "..."},
         {"day": "Sunday", "topic": "...", "task": "..."}
       ],
       "dailyRoutine": "Brief daily advice"
     }
5. If the user asks a question about the active problem or code, answer directly and contextually.
6. If the user asks conceptual questions (e.g. "What is a hash map?"), explain clearly without altering the active problem.
7. If the user expresses frustration or says "You can't talk", reply politely, humorously, and helpfully.
8. Keep conversational text clear, concise, and formatted in standard Markdown.
`;

      if (isCompanyCatalogRequest && companyQuestionsResult && companyQuestionsResult.questions && companyQuestionsResult.questions.length > 0) {
        const isSingleQuestionRequest = extractQuestionCount(trimmedMessage) === 1;

        if (isSingleQuestionRequest) {
          const selectedQ = companyQuestionsResult.questions[0];
          contextPrompt += `\nCOMPANY-SPECIFIC DSA QUESTION FOUND FOR ${detectedCompany}:
The user asked for a single company question for ${detectedCompany}.
Selected matching community-tracked LeetCode question from our MongoDB catalog:
- Title: ${selectedQ.title}
- Difficulty: ${selectedQ.difficulty}
- LeetCode URL: ${selectedQ.url}
- Topics: ${selectedQ.topics?.length ? selectedQ.topics.join(", ") : "General"}

INSTRUCTIONS FOR PRESENTING THIS COMPANY QUESTION:
1. Feature this single selected question with its clean clickable link: [${selectedQ.title}](${selectedQ.url}) and difficulty badge \`${selectedQ.difficulty}\`. Do NOT use malformed nested markdown like **[Title](url)** or escaped brackets.
2. DO NOT invent, substitute, or hallucinate any other questions.
3. Respond warmly in your natural Pepe voice and conversational style (match the user's language: Hindi, Hinglish, or English).
4. Clearly explain that because this catalog entry contains reference metadata/links rather than complete runnable test cases and starter code, it cannot yet be loaded as a runnable problem into the DSA Arena. They can solve it on LeetCode via the link above.
5. Offer to generate an original AI practice problem on this topic if they would like to practice writing and executing code right here in the DSA Arena.
6. Include this concise attribution on its own line:
   *(Source: Community LeetCode catalog • Not an official ${detectedCompany} endorsement)*
7. DO NOT call [TOOL_CALL:generate_problem] or attempt to load a problem into the DSA Arena. The response action must be chat only.
`;
        } else {
          contextPrompt += `\nCOMPANY-SPECIFIC DSA QUESTIONS FOUND FOR ${detectedCompany}:
The user asked about interview questions for ${detectedCompany}.
Here are the actual matching community-tracked LeetCode questions retrieved from our MongoDB catalog:
${JSON.stringify(companyQuestionsResult.questions, null, 2)}

INSTRUCTIONS FOR PRESENTING COMPANY QUESTIONS:
1. List ONLY the actual matching catalog records provided above (${companyQuestionsResult.questions.map((q) => `"${q.title}"`).join(", ")}).
2. DO NOT invent, substitute, or hallucinate any other questions.
3. Use clean clickable links: [Title](url) and difficulty badges. Do NOT use malformed nested markdown like **[Title](url)**, and do NOT dump raw database debug fields (like slug, frequency, recency).
4. State clearly that these reference questions contain metadata/links and cannot yet be loaded as runnable Arena problems without complete test cases.
5. Offer to generate an original AI practice problem on any of these topics if they want to code in the DSA Arena.
6. Include this concise attribution on its own line:
   *(Source: Community LeetCode catalog • Not an official ${detectedCompany} endorsement)*
7. DO NOT call [TOOL_CALL:generate_problem] or attempt to load a problem into the DSA Arena. The response action must be chat only.
`;
        }
      } else if (isCompanyCatalogRequest) {
        contextPrompt += `\nCOMPANY-SPECIFIC QUESTION CATALOG MISS FOR ${detectedCompany}:
The user asked about questions for ${detectedCompany}${filterDifficulty ? ` (${filterDifficulty})` : ""}, but no matching questions currently exist in our MongoDB catalog.
INSTRUCTIONS FOR CATALOG MISS:
1. Explicitly inform the user that our question catalog currently has no matching ${filterDifficulty ? filterDifficulty + " " : ""}questions for ${detectedCompany} in the database.
2. DO NOT invent, hallucinate, or fabricate any questions.
3. Mention popular companies available in the catalog (e.g. Amazon, Google, Meta, Microsoft, Apple, Uber).
4. Explicitly ask the user whether they would like you to generate a separately labelled, original AI practice problem on this topic for your DSA Arena.
5. Under NO circumstances call [TOOL_CALL:generate_problem] or silently generate a problem.
6. Never describe or claim that an AI-generated problem was retrieved from the ${detectedCompany} catalog or is a verified interview question.
`;
      } else if (companyMatch) {
        contextPrompt += `\nCOMPANY MENTION NOTE:
The user mentioned ${detectedCompany} in conversation. Acknowledge it warmly.
`;
      }
    }

    const aiResponse = await generateText(contextPrompt, { stage: "coach_chat" });

    if (!aiResponse || !aiResponse.trim()) {
      return res.status(502).json({
        error: "The AI returned an empty response. Please try again.",
      });
    }

    let finalAnswer = aiResponse.trim();
    let generatedPlan = null;

    // Extract profile updates if present
    const profileMatch = finalAnswer.match(/\[PROFILE_JSON\]([\s\S]*?)\[\/PROFILE_JSON\]/);
    if (profileMatch) {
      try {
        const parsedProfile = JSON.parse(profileMatch[1].trim());
        updatedProfile = { ...(updatedProfile || {}), ...parsedProfile };
        finalAnswer = finalAnswer.replace(/\[PROFILE_JSON\][\s\S]*?\[\/PROFILE_JSON\]/, "").trim();
      } catch (err) {
        console.warn("Failed to parse PROFILE_JSON block:", err.message);
      }
    }

    // Problem generation is ONLY permitted when this is NOT a company catalog lookup
    let toolCallMatch = null;
    let isExplicitGenRequest = false;

    if (!isCompanyCatalogRequest) {
      toolCallMatch = finalAnswer.match(/\[TOOL_CALL:generate_problem\]([\s\S]*?)\[\/TOOL_CALL\]/i);
      isExplicitGenRequest =
        !toolCallMatch &&
        effectiveAction === "chat" &&
        /\b(?:generate|create|give me|load|another|next)\s+(?:a|an)?\s*(?:new\s+)?(?:easy|medium|hard)?\s*[\w\s]*?(?:problem|question)\b/i.test(trimmedMessage);
    } else {
      // For company catalog requests, suppress and strip any unintended tool calls emitted by AI
      finalAnswer = finalAnswer.replace(/\[TOOL_CALL:generate_problem\][\s\S]*?\[\/TOOL_CALL\]/i, "").trim();

      // Guardrail: Ensure company retrieval responses are accurate and adhere to catalog contract
      if (companyQuestionsResult && companyQuestionsResult.questions && companyQuestionsResult.questions.length > 0) {
        const isSingleQuestionRequest = extractQuestionCount(trimmedMessage) === 1;
        const requiredQuestions = isSingleQuestionRequest
          ? companyQuestionsResult.questions.slice(0, 1)
          : companyQuestionsResult.questions;

        const hasRequiredQuestion = requiredQuestions.some(
          (q) => finalAnswer.includes(q.title)
        );

        if (!hasRequiredQuestion || !finalAnswer.trim()) {
          finalAnswer = formatCatalogQuestionsResponse(
            detectedCompany,
            filterDifficulty,
            companyQuestionsResult,
            isSingleQuestionRequest
          );
        } else {
          // Normalize any accidental nested bold links or escaped brackets in AI response
          finalAnswer = finalAnswer
            .replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, "[$1]($2)")
            .replace(/\\([\[\]()])/g, "$1");
        }
      } else {
        // Catalog miss: enforce explicit catalog miss message and prompt for separately labelled AI practice problem
        const hasCatalogMissNotice = /\b(?:no\s+matching|not\s+found|no\s+community\s+tags|no\s+records|catalog\s+has\s+no)\b/i.test(finalAnswer);
        const asksAiGeneration = /\b(?:ai-generated|practice problem|generate|separately labelled)\b/i.test(finalAnswer);
        if (!hasCatalogMissNotice || !asksAiGeneration || !finalAnswer.trim()) {
          finalAnswer = formatCatalogMissResponse(detectedCompany, filterDifficulty, filterTopic);
        }
      }
    }

    if (toolCallMatch || isExplicitGenRequest) {
      let targetTopic = "Any";
      let targetDifficulty = "Medium";

      if (toolCallMatch) {
        try {
          const parsedArgs = JSON.parse(toolCallMatch[1].trim());
          if (parsedArgs.topic && typeof parsedArgs.topic === "string") {
            targetTopic = parsedArgs.topic.trim();
          }
          if (parsedArgs.difficulty && typeof parsedArgs.difficulty === "string") {
            targetDifficulty = parsedArgs.difficulty.trim();
          }
        } catch (err) {
          console.warn("Failed to parse tool call args:", err.message);
        }
      } else {
        const diffMatch = trimmedMessage.match(/\b(easy|medium|hard)\b/i);
        if (diffMatch) {
          targetDifficulty = diffMatch[1][0].toUpperCase() + diffMatch[1].slice(1).toLowerCase();
        } else if (companyQuestionsResult?.questions?.[0]?.difficulty) {
          targetDifficulty = companyQuestionsResult.questions[0].difficulty;
        } else {
          targetDifficulty = adaptiveAssessment?.targetDifficulty || "Medium";
        }

        const topicMatch = trimmedMessage.match(/\b(array|arrays|string|strings|dynamic programming|dp|tree|trees|graph|graphs|binary search|hash table|hash map|two pointers|stack|queue|recursion|greedy|heap|linked list|trie|tries|bit manipulation|segment tree|disjoint set|union find)\b/i);
        if (topicMatch) {
          targetTopic = topicMatch[1];
        } else if (companyQuestionsResult?.questions?.[0]?.topics?.[0]) {
          targetTopic = companyQuestionsResult.questions[0].topics[0];
        } else {
          targetTopic = "Any";
        }
      }

      // CRITICAL ADAPTIVE DIFFICULTY ENFORCEMENT:
      // If user explicitly specified a difficulty in their message, honor that explicit choice.
      // Otherwise, targetDifficulty MUST strictly adhere to the engine recommendation (adaptiveAssessment.targetDifficulty),
      // preventing arbitrary model tool arguments from suppressing promotion to Hard or demotion.
      if (explicitDiffFromMsg || filterDifficulty) {
        targetDifficulty = explicitDiffFromMsg || filterDifficulty;
      } else if (adaptiveAssessment?.targetDifficulty) {
        targetDifficulty = adaptiveAssessment.targetDifficulty;
      }

      return await loadAndConfirmDsaProblem({
        targetTopic,
        targetDifficulty,
        trimmedMessage,
        detectedCompany,
        updatedProfile,
        adaptiveAssessment,
        problem,
        res,
        userId: req.user?.id,
      });
    }

    const planMatch = finalAnswer.match(/\[PLAN_JSON\]([\s\S]*?)\[\/PLAN_JSON\]/);
    if (planMatch) {
      try {
        generatedPlan = JSON.parse(planMatch[1].trim());
        finalAnswer = finalAnswer.replace(/\[PLAN_JSON\][\s\S]*?\[\/PLAN_JSON\]/, "").trim();
      } catch (parseErr) {
        console.error("Failed to parse PLAN_JSON block:", parseErr.message);
      }
    }

    // Persist updated study plan / onboarding profile changes to MongoDB
    if (userId && mongoose.Types.ObjectId.isValid(userId) && mongoose.connection.readyState === 1) {
      try {
        const updateFields = {};
        if (updatedProfile && typeof updatedProfile === "object") {
          updateFields.onboardingProfile = updatedProfile;
        }
        if (generatedPlan && typeof generatedPlan === "object") {
          updateFields.plan = generatedPlan;
        }
        if (Object.keys(updateFields).length > 0) {
          await withBoundedTimeout(
            StudyPlan.findOneAndUpdate(
              { user: userId },
              { $set: updateFields },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            ).maxTimeMS(3000),
            3000,
            "StudyPlan.findOneAndUpdate"
          );
        }
      } catch (savePlanErr) {
        console.warn("Error auto-persisting StudyPlan in coachChat:", savePlanErr.message);
      }
    }

    return res.status(200).json({
      answer: finalAnswer,
      action: "chat",
      plan: generatedPlan,
      onboardingProfile: updatedProfile,
      companyQuestions: companyQuestionsResult,
      adaptiveAssessment: {
        currentDifficulty: adaptiveAssessment.currentDifficulty,
        targetDifficulty: adaptiveAssessment.targetDifficulty,
        action: adaptiveAssessment.action,
        reason: adaptiveAssessment.reason,
        isExplicit: adaptiveAssessment.isExplicit,
      },
    });
  } catch (error) {
    console.error("Error in Pepe coachChat:", error);

    const isUpstreamUnavailable =
      error.status === 503 ||
      error.status === 429 ||
      error.name === "TimeoutError" ||
      (error.name === "TypeError" && error.message?.includes("fetch failed")) ||
      /ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET/i.test(error.message || "");

    const statusCode = isUpstreamUnavailable ? 503 : 500;
    const errorMessage = isUpstreamUnavailable
      ? "AI Coach service is temporarily unavailable. Please try again shortly."
      : "Failed to process chat message with Pepe AI Coach. Please try again.";

    return res.status(statusCode).json({
      error: errorMessage,
    });
  }
}

/**
 * Clears coach memory records for the authenticated user from the database.
 */
export async function clearCoachData(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    const userId = req.user.id;
    if (mongoose.Types.ObjectId.isValid(userId) && mongoose.connection.readyState === 1) {
      await UserMemory.deleteMany({ user: userId, source: "dsa" });
      await StudyPlan.deleteMany({ user: userId });
    }
    return res.status(200).json({
      success: true,
      message: "Pepe Coach saved records successfully cleared.",
    });
  } catch (error) {
    console.error("Error in clearCoachData:", error);
    return res.status(500).json({
      error: "Failed to clear coach data from database.",
    });
  }
}

/**
 * Endpoint handler for retrieving company-specific DSA questions with ranking and filters.
 */
export async function getCompanyQuestionsHandler(req, res) {
  try {
    const { company, difficulty, topic, limit } = req.query;
    if (!company || typeof company !== "string" || !company.trim()) {
      return res.status(400).json({ error: "Company query parameter is required." });
    }

    let excludeSlugs = [];
    if (req.user?.id && mongoose.Types.ObjectId.isValid(req.user.id) && mongoose.connection.readyState === 1) {
      try {
        const subs = await DsaSubmission.find({ user: req.user.id })
          .select("problemId problem.title")
          .lean();
        excludeSlugs = subs
          .map((s) => s.problemId || (s.problem?.title ? s.problem.title.toLowerCase().replace(/\s+/g, "-") : null))
          .filter(Boolean)
          .slice(-30);
      } catch (subErr) {
        console.warn("Could not fetch user submission slugs:", subErr.message);
      }
    }

    const result = await getCompanyQuestions({
      company: company.trim(),
      difficulty: difficulty ? String(difficulty).trim() : undefined,
      topic: topic ? String(topic).trim() : undefined,
      limit: parseInt(limit, 10) || 10,
      excludeSlugs,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCompanyQuestionsHandler:", error);
    return res.status(500).json({
      error: "Failed to fetch company questions from catalog.",
    });
  }
}

/**
 * Endpoint handler for listing available companies in the catalog.
 */
export async function getAvailableCompaniesHandler(req, res) {
  try {
    const companies = await getAvailableCompanies();
    return res.status(200).json({
      companies,
      disclaimer: COMPANY_CATALOG_DISCLAIMER,
    });
  } catch (error) {
    console.error("Error in getAvailableCompaniesHandler:", error);
    return res.status(500).json({
      error: "Failed to fetch available companies from catalog.",
    });
  }
}

/**
 * Endpoint handler for inspecting the user's current adaptive difficulty standing.
 */
export async function getAdaptiveStatusHandler(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        message: "Authentication required. Please sign in.",
      });
    }

    const { topic } = req.query;
    let submissions = [];
    if (mongoose.connection.readyState === 1) {
      submissions = await DsaSubmission.find({ user: req.user.id }).sort({ createdAt: -1 });
    }

    let studyPlanDoc = null;
    try {
      studyPlanDoc = await StudyPlan.findOne({ user: req.user.id }).lean();
    } catch {
      // Graceful fallback if study plan not yet created
    }

    const assessment = evaluateAdaptiveDifficulty({
      submissions,
      topic: topic || null,
      userProfile: studyPlanDoc?.onboardingProfile,
      activePlan: studyPlanDoc?.plan,
    });

    return res.status(200).json({
      adaptiveDifficulty: assessment,
      config: ADAPTIVE_DIFFICULTY_CONFIG,
    });
  } catch (error) {
    console.error("Error in getAdaptiveStatusHandler:", error);
    return res.status(500).json({
      error: "Failed to evaluate adaptive difficulty status.",
    });
  }
}



