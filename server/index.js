require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Importing and configure the Google Gemini SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initializing the SDK with API key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//  Initialize BOTH models
// Model for fast tasks like problem generation
const flashModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
// More powerful model for complex reasoning like code evaluation
const proModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });

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

app.post('/api/behavioral-chat', async (req, res) => {
    try {
        const { messages } = req.body; // Expect an array of message objects

        if (!messages || messages.length === 0) {
            return res.status(400).json({ error: 'Chat history is required.' });
        }

        //  The "System Prompt" - This defines the AI's persona and rules
        const systemPrompt = `
            You are "Aman", a friendly, encouraging, and professional hiring manager at a top tech company. 
            Your goal is to conduct a behavioral interview with a computer science student.
            Follow these rules strictly:
            1. Your persona is helpful and insightful. Conduct the entire interview in professional English.
            2. Ask one behavioral question at a time. Start with an introduction and the first question.
            3. After the user answers, if their answer is too short, vague, or misses key details, ask one or two clarifying follow-up questions to encourage them to elaborate. 
            4. If the user's response is irrelevant or nonsensical, gently guide them back on topic.
            5. Once you have a complete answer, provide feedback based ONLY on the STAR method, then seamlessly transition to the next behavioral question.
            6. When the user sends the message "USER_ACTION: End interview", you must begin the conclusion. First, ask the user, "That brings us to the end of our session. Would you like a summary of your performance?"
            7. If the user's next response is "yes" or affirmative, your NEXT and FINAL message must be a comprehensive summary report of their performance. If their response is "no" or negative, your FINAL message should be a simple, polite closing.
            8. Your very final message (either the summary or the polite closing) MUST end with the special token: [SESSION_END]
            9. Never break character. Your responses should be conversational and professional.
        `;

        // Format the history for the Gemini API
        // The API expects a specific format of { role: 'user'/'model', parts: [{ text: '...' }] }
        const history = messages.map(msg => ({
            role: msg.sender === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }],
        }));

        // 3. Start a chat session with the system prompt and history
        // const chat = proModel.startChat({
        const chat = flashModel.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "Okay, I understand my role. I am Alex, a hiring manager. I will start the interview now." }] },
                ...history
            ],
        });

        // 4. Send the last message from the user to the AI
        const lastUserMessage = messages[messages.length - 1].text;
        const result = await chat.sendMessage(lastUserMessage);
        const responseText = result.response.text();

        // 5. Send the AI's reply back to the frontend
        res.status(200).json({ reply: responseText });

    } catch (error) {
        console.error("Error in behavioral chat:", error);
        res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
    }
});

// Start the Server
app.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});