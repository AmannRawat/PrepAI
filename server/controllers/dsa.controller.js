import DsaSubmission from "../models/DsaSubmission.model.js";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";

export async function generateProblem(req, res) {
  try {
    const { topic, difficulty } = req.body;

    if (!topic || !difficulty) {
      return res.status(400).json({
        error: "Topic and difficulty are required.",
      });
    }

    const prompt = `
You are a JSON-only API endpoint.

Generate a unique programming problem based on:

- Topic: ${topic}
- Difficulty: ${difficulty}

Your entire response must be a single, clean, raw JSON object.

The JSON object must have this exact structure:
{
  "title": "Problem Title",
  "description": "Problem description",
  "examples": [
    {
      "input": "Example input",
      "output": "Example output",
      "explanation": "Optional explanation"
    }
  ],
  "boilerplates": {
    "javascript": "function solve(args) {}",
    "python": "def solve(args):",
    "java": "class Solution {}",
    "cpp": "class Solution {}"
  }
}
- Base the function names and arguments in the boilerplates on the problem's context. For example, a problem about a Zigzag Conversion should have a function like 'convert(s, numRows)'.

`;

    const responseText = await generateText(prompt);

    res.status(200).json(extractJson(responseText));
  } catch (error) {
    console.error("Error generating problem:", error);
    res.status(500).json({
      error: "Failed to generate problem. Please try again.",
    });
  }
}

export async function evaluateCode(req, res) {
    try {
        const { problem, code, language, topic } = req.body;

        if (!problem || !code || !language || !topic) {
            return res.status(400).json({
                error: "Problem, code, and language are required.",
            });
        }

        const prompt = `
            You are a JSON-only API endpoint for code evaluation.
            Analyze the user's code for the given problem. Your entire response must be a single, clean, raw JSON object. Do not include any conversational text, introductions, or markdown formatting.

            **Problem:**
            Title: ${problem.title}
            Description: ${problem.description}

            **User's Code (${language}):**
            \`\`\`${language}
            ${code}
            \`\`\`

            **Your Evaluation:**
            Analyze the code and provide feedback in a clean, raw JSON object, without any surrounding text or markdown.

            The JSON object must have the following structure:

            {
              "correctness": "Analyze if the code correctly solves the problem. Is it a valid solution? Are there any bugs or edge cases missed?",

              "timeComplexity": "Analyze the time complexity (Big O notation) of the solution and explain why.",

              "spaceComplexity": "Analyze the space complexity (Big O notation) of the solution and explain why.",

              "optimization": "Suggest specific, actionable ways the user could optimize their code for better performance or readability. If the solution is already optimal, state that."
            }

        `;

        const responseText = await generateText(prompt);
        const parsedResponse = extractJson(responseText);

        const newSubmission = new DsaSubmission({
            user: req.user.id,
            problem: {
                title: problem.title,
                description: problem.description,
            },
            topic: topic,
            language: language,
            code: code,
            feedback: parsedResponse,
        });

        await newSubmission.save();

        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error("Error evaluating code:", error);
        res.status(500).json({
            error: "Failed to evaluate code. Please try again.",
        });
    }
}