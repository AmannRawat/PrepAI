import DsaSubmission from "../models/DsaSubmission.model.js";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";


function validateGeneratedProblem(problem) {
  const languages = ["javascript", "python", "java", "cpp"];

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
        typeof example === "object" &&
        typeof example.input === "string" &&
        example.input.trim().length > 0 &&
        typeof example.output === "string" &&
        example.output.trim().length > 0 &&
        typeof example.explanation === "string" &&
        example.explanation.trim().length > 0
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(problem.constraints) ||
    problem.constraints.length === 0 ||
    !problem.constraints.every(
      (constraint) =>
        typeof constraint === "string" && constraint.trim().length > 0
    )
  ) {
    return false;
  }

  if (
    !problem.boilerplates ||
    typeof problem.boilerplates !== "object" ||
    !languages.every(
      (language) =>
        typeof problem.boilerplates[language] === "string" &&
        problem.boilerplates[language].trim().length > 0
    )
  ) {
    return false;
  }

  return true;
}

export async function generateProblem(req, res) {
  try {
    const { topic, difficulty } = req.body;

    const allowedDifficulties = ["Easy", "Medium", "Hard"];
    const allowedTopics = [
      "Arrays",
      "Binary Search",
      "Strings",
      "Linked List",
      "Recursion",
      "Trees",
      "Graphs",
      "Dynamic Programming",
      "Greedy",
      "Stack",
      "Queue",
      "Hashing",
      "Sorting",
      "Backtracking",
      "Heap",
      "Trie",
      "Bit Manipulation",
      "Math",
    ];

    if (
      typeof topic !== "string" ||
      !topic.trim() ||
      typeof difficulty !== "string" ||
      !allowedDifficulties.includes(difficulty)
    ) {
      return res.status(400).json({
        error: "A valid topic and difficulty (Easy, Medium, or Hard) are required.",
      });
    }

    // Accept topics outside this list if your frontend supports custom topics.
    const normalizedTopic = topic.trim();

    const prompt = `
You are a professional Data Structures and Algorithms problem setter
creating coding interview questions for a programming practice platform.

Generate ONE original, self-contained programming problem.

TOPIC: ${normalizedTopic}
DIFFICULTY: ${difficulty}

DIFFICULTY GUIDELINES:
- Easy: one fundamental concept, straightforward implementation.
- Medium: requires meaningful reasoning or combining a small number of concepts.
- Hard: requires deeper algorithmic insight or a more sophisticated technique.
Match the actual difficulty to the requested level.

PROBLEM QUALITY REQUIREMENTS:
1. The problem must be solvable using the requested topic.
2. Write a clear title and a complete, unambiguous description.
3. Include all necessary input details, output requirements, and constraints.
4. Include at least two valid examples with correct outputs.
5. Include an explanation for each example.
6. Cover important edge cases through examples or constraints.
7. Make constraints realistic and sufficient to reason about complexity.
8. Avoid relying on unstated assumptions.
9. Do not copy a well-known problem verbatim. Create a meaningfully distinct variant.
10. Ensure the examples agree with the description and constraints.
11. Use a consistent function name and parameter list across all four languages.
12. The function should return the expected result rather than print it,
    unless the problem explicitly requires otherwise.
13. Do not include solutions, hints, or algorithm explanations in the description.

BOILERPLATE REQUIREMENTS:
- JavaScript: valid function declaration.
- Python: valid function declaration with an appropriate body placeholder.
- Java: valid class and method signature.
- C++: valid class and public method signature.
- Use equivalent parameter types and return types across languages.
- Choose a signature that matches the problem's inputs and expected output.
- Avoid including a complete solution in the boilerplate.

RETURN ONLY A VALID JSON OBJECT.
Do not wrap the JSON in Markdown fences or add commentary.

Use exactly this schema:
{
  "title": "Problem title",
  "description": "Complete problem statement, including constraints",
  "examples": [
    {
      "input": "Input representation",
      "output": "Expected output",
      "explanation": "Why this output is correct"
    },
    {
      "input": "Input representation",
      "output": "Expected output",
      "explanation": "Why this output is correct"
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
  }
}

The boilerplate examples above are placeholders, not literal signatures to copy.
Replace them with signatures appropriate to the generated problem.

Before returning the JSON, internally check:
- The problem is complete and unambiguous.
- Each example output follows from the problem statement.
- Constraints are included and meaningful.
- All four boilerplates represent the same function.
- The JSON is syntactically valid.
`;

    const responseText = await generateText(prompt);
    const problem = extractJson(responseText);

    // Validate the shape before returning the AI-generated problem.

    if (!validateGeneratedProblem(problem)) {
      console.error("Invalid generated DSA problem:", problem);

      return res.status(502).json({
        error: "The AI generated an invalid problem. Please try again.",
      });
    }

    return res.status(200).json(problem);
  } catch (error) {
    console.error("Error generating problem:", error);

    return res.status(500).json({
      error: "Failed to generate problem. Please try again.",
    });
  }
}


export async function evaluateCode(req, res) {
  try {
    const { problem, code, language, topic } = req.body;

    const supportedLanguages = ["javascript", "python", "java", "cpp"];

    if (
      !problem ||
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
          "A valid problem, non-empty code, topic, and supported language are required.",
      });
    }

    const prompt = `
You are a careful DSA interview code reviewer.

Review the submitted code against the problem statement.
Be technically precise, explain mistakes constructively, and do not
claim that code has been compiled or executed.

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
   Assess whether the code appears logically correct for the stated
   problem. Consider boundary conditions, empty or minimal inputs where
   allowed, duplicates, negative values where allowed, and other relevant
   edge cases.

2. Time complexity:
   Give Big O complexity and a brief justification. If the code is
   incomplete or its behavior cannot be determined, state that limitation.

3. Space complexity:
   Give auxiliary space complexity and a brief justification.
   Distinguish auxiliary space from input storage when relevant.

4. Optimization:
   Give specific, actionable improvements. If the approach is already
   asymptotically optimal, say so.

IMPORTANT:
- Do not confuse plausible reasoning with executed test results.
- Do not say all test cases pass.
- Do not assume the code compiles successfully.
- Identify syntax errors or missing implementation when apparent.
- Do not invent problem constraints.
- If the statement is ambiguous, explain how that affects your assessment.
- Keep each field concise and useful for an interview candidate.
- Return only one valid JSON object, without Markdown fences or commentary.

Required JSON structure:
{
  "correctness": "Assessment and relevant edge cases",
  "timeComplexity": "Big O complexity and justification",
  "spaceComplexity": "Big O complexity and justification",
  "optimization": "Specific actionable recommendations"
}
`;

    const responseText = await generateText(prompt);
    const parsedResponse = extractJson(responseText);

    if (
      !parsedResponse ||
      typeof parsedResponse !== "object" ||
      Array.isArray(parsedResponse) ||
      !["correctness", "timeComplexity", "spaceComplexity", "optimization"]
        .every(
          (field) =>
            typeof parsedResponse[field] === "string" &&
            parsedResponse[field].trim().length > 0
        )
    ) {
      console.error("Invalid code evaluation response:", parsedResponse);

      return res.status(502).json({
        error: "The AI returned an invalid evaluation. Please try again.",
      });
    }

    const newSubmission = new DsaSubmission({
      user: req.user.id,
      problem: {
        title: problem.title,
        description: problem.description,
      },
      topic,
      language,
      code,
      feedback: parsedResponse,
    });

    await newSubmission.save();

    return res.status(200).json(parsedResponse);
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
