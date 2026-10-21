import DsaSubmission from "../models/DsaSubmission.model.js";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";
import { executeCode } from "../services/codeExecution.service.js";
import {
  sanitizeProblemForClient,
  resolveAuthoritativeTestCases,
} from "../utils/testCaseSecurity.js";



function validateGeneratedProblem(problem) {
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
    if (
      typeof problem.boilerplates[language] !== "string" ||
      !problem.boilerplates[language].trim()
    ) {
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

    if (
      testCase.input === undefined ||
      testCase.expectedOutput === undefined
    ) {
      return false;
    }
  }

  if (!problem.testCases.some((testCase) => !testCase.isHidden)) {
    return false;
  }

  if (!problem.testCases.some((testCase) => testCase.isHidden)) {
    return false;
  }

  return true;
}

export async function generateProblem(req, res) {
  try {
    const { topic, difficulty } = req.body;

    const allowedDifficulties = ["Easy", "Medium", "Hard"];

    if (
      typeof topic !== "string" ||
      !topic.trim() ||
      topic.trim().length > 100 ||
      typeof difficulty !== "string" ||
      !allowedDifficulties.includes(difficulty)
    ) {
      return res.status(400).json({
        error:
          "A valid topic and difficulty (Easy, Medium, or Hard) are required.",
      });
    }

    const normalizedTopic = topic.trim();

    const prompt = `
You are a professional Data Structures and Algorithms problem setter
for a programming interview practice platform.

Generate ONE original, self-contained function-based DSA problem.

TOPIC: ${normalizedTopic}
DIFFICULTY: ${difficulty}

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
5. Ensure each expectedOutput is correct for its input.
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
  "testCases": [
    {
      "input": {
        "arg": "example value"
      },
      "expectedOutput": "expected result",
      "isHidden": false
    },
    {
      "input": {
        "arg": "another value"
      },
      "expectedOutput": "another result",
      "isHidden": true
    }
  ]
}

The schema examples are illustrative. Generate the correct parameter names,
types, boilerplates, examples and expected outputs for the actual problem.

FINAL SELF-CHECK:
- JSON syntax is valid.
- Every test case input has the correct parameters.
- All expected outputs match the problem's intended behavior.
- At least two test cases are visible and at least three are hidden.
- Every language has a compatible function-based starter.
- No solution code is included.
`;

    const responseText = await generateText(prompt);
    const problem = extractJson(responseText);

    if (!validateGeneratedProblem(problem)) {
      console.error("Invalid generated DSA problem:", problem);

      return res.status(502).json({
        error:
          "The AI generated an invalid problem. Please try again.",
      });
    }

    // Sanitize problem so hidden test inputs/outputs are never sent to the browser
    const clientSafeProblem = sanitizeProblemForClient(problem);
    return res.status(200).json(clientSafeProblem);
  } catch (error) {
    console.error("Error generating problem:", error);

    return res.status(500).json({
      error: "Failed to generate problem. Please try again.",
    });
  }
}

/**
 * Runs code against visible / sample test cases ONLY.
 * Does not execute hidden test cases, and does not save a final submission.
 */
export async function runCode(req, res) {
  try {
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

      const responseText = await generateText(prompt);
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
      const newSubmission = new DsaSubmission({
        user: req.user.id,
        problem: {
          title: problem.title,
          description: problem.description,
        },
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


async function generateCoachResponse(res, prompt) {
  try {
    const answer = await generateText(prompt);

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
  const { code = "" } = req.body;

  const prompt = `
You are a concise, supportive DSA interview coach.

PROBLEM:
Title: ${problem.title}
Description: ${problem.description}

Examples:
${JSON.stringify(problem.examples ?? [])}

Language: ${language}

Learner's code:
${String(code).slice(0, 12000) || "No code written yet."}

RULES:
1. Give exactly ONE useful hint in 2-3 short sentences.
2. Point toward the relevant data structure, algorithm, or next step.
3. If code exists, identify one likely issue without rewriting the code.
4. Do not reveal the complete algorithm or solution.
5. Do not include code blocks, lengthy explanations, or follow-up sections.
6. Use plain text or simple Markdown only.
7. Never use LaTeX, dollar signs for math, escaped Markdown symbols,
   or decorative headings.
8. Return only the hint.
`;

  return generateCoachResponse(res, prompt);
}


export async function explainApproach(req, res) {
  const validated = validateCoachInput(req, res);
  if (!validated) return;

  const { problem, language } = validated;

  const prompt = `
You are an experienced DSA interview coach.
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
Give 3-5 numbered steps. Explain what the algorithm does,
not the complete implementation.

### Complexity
State time and auxiliary space complexity using plain text,
for example O(n) or O(1), with one short justification each.

### Why it works
Explain in 1-2 sentences why the approach solves the problem.

STRICT OUTPUT RULES:
1. Keep the complete response under 250 words.
2. Do not include a dry run unless the user specifically asks for one.
3. Do not compare alternative approaches unless comparison is essential.
4. Do not provide the complete implementation.
5. Do not repeat the problem statement.
6. Use normal Markdown headings, numbered lists, and inline code where useful.
7. Write mathematical expressions in plain text, such as
   nums[i] = target - nums[j].
8. Never use LaTeX, $$, \\text{}, \\frac{}, or escaped Markdown
   such as \\###, \\---, or \\|.
9. Do not create tables, unnecessary headings, or a long introduction.
10. Return only the explanation.
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

Required language: ${language}

Available boilerplate:
${JSON.stringify(problem.boilerplates?.[language] ?? null)}

RESPONSE FORMAT:

### Approach
Explain the core idea in no more than 3 sentences.

### Code
Provide the complete implementation in exactly one fenced code block.
Use the requested language and respect the provided function signature
when possible.

### Complexity
State time and auxiliary space complexity, each with a brief justification.

RULES:
1. Make the implementation consistent with the problem statement and examples.
2. Handle relevant edge cases and avoid unnecessary code.
3. If constraints are missing, state any important assumption briefly.
4. Never claim the code was executed or tested in a sandbox.
5. Use plain text for mathematical expressions. Do not use LaTeX.
6. Do not escape Markdown headings, list markers, or code fences.
7. Do not add multiple solutions, lengthy dry runs, or unrelated explanations.
8. Return only the formatted Markdown response.
`;

  return generateCoachResponse(res, prompt);
}
