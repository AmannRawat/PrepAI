require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import and configure the Google Gemini SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the SDK with your API key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Step 1: Initialize BOTH models ---
// Model for fast tasks like problem generation
const flashModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
// More powerful model for complex reasoning like code evaluation
const proModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
// -----------------------------------------

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// A helper function to find and parse JSON from a string
function extractJson(text) {
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        const jsonString = text.substring(startIndex, endIndex + 1);
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse extracted JSON:", e);
            throw new Error("Invalid JSON format in the AI response.");
        }
    }
    throw new Error("No valid JSON object found in the AI response.");
}

// Routes
app.get('/', (req, res) => {
    res.status(200).json({ message: "PrepAI Backend is running!" });
});

// Route for generating problems (uses flashModel)
app.post('/api/generate-problem', async (req, res) => {
    try {
        const { topic, difficulty } = req.body;
        if (!topic || !difficulty) {
            return res.status(400).json({ error: 'Topic and difficulty are required.' });
        }
       const prompt = `
            You are a JSON-only API endpoint.
            Generate a unique programming problem based on the following criteria:
            - Topic: ${topic}
            - Difficulty: ${difficulty}
            Your entire response must be a single, clean, raw JSON object. Do not include any conversational text, introductions, or markdown formatting.
            The JSON object must have this exact structure:
            {
              "title": "Problem Title",
              "description": "Problem description with \\n for new lines.",
              "examples": [{"input": "Example input", "output": "Example output", "explanation": "Optional explanation"}],
              "boilerplates": {
                "javascript": "function solve(args) {\\n  // Your code here\\n}",
                "python": "def solve(args):\\n  # Your code here\\n  pass",
                "java": "class Solution {\\n  public ReturnType solve(args) {\\n    // Your code here\\n  }\\n}",
                "cpp": "#include <vector>\\n#include <string>\\nusing namespace std;\\n\\nclass Solution {\\npublic:\\n  ReturnType solve(args) {\\n    // Your code here\\n  }\\n};"
              }
            }
            - Base the function names and arguments in the boilerplates on the problem's context. For example, a problem about a Zigzag Conversion should have a function like 'convert(s, numRows)'.
        `;
        
        const result = await flashModel.generateContent(prompt);
        const responseText = result.response.text();
        // const cleanedJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResponse = extractJson(responseText);
        res.status(200).json(parsedResponse);
    } catch (error) {
        console.error("Error generating problem:", error);
        res.status(500).json({ error: 'Failed to generate problem. Please try again.' });
    }
});

//  Adding the new route for code evaluation 
app.post('/api/evaluate-code', async (req, res) => {
    try {
        const { problem, code, language } = req.body;

        if (!problem || !code || !language) {
            return res.status(400).json({ error: 'Problem, code, and language are required.' });
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
        
        // const result = await proModel.generateContent(prompt);
        const result = await flashModel.generateContent(prompt);
        const responseText = result.response.text();
        // const cleanedJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
       const parsedResponse = extractJson(responseText);
        
        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error("Error evaluating code:", error);
        res.status(500).json({ error: 'Failed to evaluate code. Please try again.' });
    }
});
// --------------------------------------------------

// Start the Server
app.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});