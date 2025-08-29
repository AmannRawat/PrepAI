require('dotenv').config();
const express = require('express');
const cors = require('cors'); //middleware  between frontend and backend

// // Importing and configure the Google Gemini SDK
// const { GoogleGenerativeAI } = require('@google/generative-ai');
// // Initialize the SDK with your API key from the .env file
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// // Select the generative model
// const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// Importing and configuring the new Google Gemini SDK
const { GoogleGenerativeAI } = require('@google/genai');
// Initialize SDK
const genAI = new GoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
// Select the new 2.5 model
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });


//Setting up Express server
const app = express();
const PORT = process.env.PORT || 8000; //PORT is the port your backend will run on. Uses .env if defined, otherwise 8000.

// Middleware
app.use(cors());
app.use(express.json());


// Routes 
app.get('/', (req, res) => {
    res.status(200).json({ message: "PrepAI Backend is running!" });
});


//  Create the new route for generating problems 
app.post('/api/generate-problem', async (req, res) => {
    try {
        // Get the topic and difficulty from the frontend request body
        const { topic, difficulty } = req.body;

        if (!topic || !difficulty) {
            return res.status(400).json({ error: 'Topic and difficulty are required.' });
        }
        
        // Craft the detailed prompt for the AI 
        const prompt = `
            You are an expert DSA problem generator for a coding interview preparation platform.
            Your task is to generate a unique programming problem based on the following criteria:
            - Topic: ${topic}
            - Difficulty: ${difficulty}

            The response must be a clean, raw JSON object, without any surrounding text, explanations, or markdown formatting like \`\`\`json.
            
            The JSON object must have the following structure:
            {
              "title": "A concise and descriptive problem title",
              "description": "A detailed description of the problem. Use \\n for new lines. Explain the task, inputs, and expected outputs clearly.",
              "examples": [
                {
                  "input": "An example input as a string",
                  "output": "The corresponding example output as a string",
                  "explanation": "A brief explanation of the example (optional)"
                }
              ]
            }
        `;

        
        //  Call the Gemini API and parse the response
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Sometimes the model might still include markdown so we clean it
        const cleanedJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const parsedResponse = JSON.parse(cleanedJsonText);
        
        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error("Error generating problem:", error);
        res.status(500).json({ error: 'Failed to generate problem. Please try again.' });
    }
});


// Start the Server
app.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});