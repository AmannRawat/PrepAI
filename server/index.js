import "dotenv/config";

import express from "express";
import cors from "cors";
import multer from "multer";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";

import User from "./models/User.model.js";
import ResumeReview from "./models/ResumeReview.model.js";
import ChatSession from "./models/BehavioralChat.model.js";
import DsaSubmission from "./models/DsaSubmission.model.js";

import authMiddleware from "./middleware/auth.middleware.js";
import { extractJson } from "./utils/extractJson.js";
// Importing and configure the Google Gemini SDK
import { GoogleGenerativeAI } from "@google/generative-ai";

import { uploadResume } from "./services/ai.service.js";
import { generateInterviewResponse } from "./services/ai.service.js";

// Initializing the SDK with API key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Model for fast tasks like problem generation
const flashModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
//  More powerful model for complex reasoning like code evaluation
const proModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage: storage });
const PORT = process.env.PORT || 8000;


const app = express();
// Middleware
app.use(cors({
    // In production, this set FRONTEND_URL in Vercel.
    // Locally, it defaults to localhost.
    origin: [
        "http://localhost:5173",
        "https://prepai-client-try.vercel.app",
        "https://prepai-app.vercel.app"
    ],
    credentials: true
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.status(200).json({ message: "PrepAI Backend is running!" });
});

app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

// User Signup Route
app.post('/api/auth/signup', async (req, res) => {
    try {
        // Get email and password from the request body
        const { name, email, password } = req.body;

        // Checks for missing fields
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password.' });
        }

        // Checks if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists.' });
        }

        // Creats the new user
        // Note: The password will be automatically hashed by the 'pre-save' hook in User.model.js
        const user = await User.create({
            name,
            email,
            password
        });

        // Sends a successful response
        res.status(201).json({ message: 'User created successfully!', userId: user._id });

    } catch (error) {
        // Handles validation errors (e.g., password too short)
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error("Error in signup:", error);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

// User Login Route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Checks if user provided email and password
        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password.' });
        }

        // Finds the user in the database
        const user = await User.findOne({ email });
        if (!user) {
            // sends a generic "invalid" message for security
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Compare the provided password with the hashed password in the DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Generic "invalid" message
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // User is valid! Create a JWT token
        const payload = {
            user: {
                id: user._id,
                email: user.email,
                name: user.name
            }
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET, // added this to .env file!
            { expiresIn: '1d' } // Token expires in 1 day
        );

        // Sends the token back to the user
        res.status(200).json({
            message: 'Login successful!',
            token,
            userId: user._id,
            email: user.email,
            name: user.name
        });

    } catch (error) {
        console.error("Error in login:", error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Route for generating problems (uses flashModel)
// app.post('/api/generate-problem', async (req, res) => {
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

// New route for code evaluation 
app.post('/api/evaluate-code', authMiddleware, async (req, res) => {
    try {
        const { problem, code, language, topic } = req.body;

        if (!problem || !code || !language || !topic) {
            return res.status(400).json({ error: 'Problem, code, and language are required.' });
        }

        const prompt = `
            You are a JSON-only API endpoint for code evaluation.
            Analyze the user's code for the given problem. Your entire response must be a single, clean, raw JSON object. Do not include any conversational text, introductions, or markdown formatting.
            
            **Problem:**
            Title: ${problem.title}
            Description: ${problem.description}7

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
        //Save the submission to the database ---
        const newSubmission = new DsaSubmission({
            user: req.user.id, // Get the user's ID
            problem: {
                title: problem.title,
                description: problem.description,
            },
            topic: topic,
            language: language,
            code: code,
            feedback: parsedResponse // Save the AI's feedback
        });
        await newSubmission.save();
        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error("Error evaluating code:", error);
        res.status(500).json({ error: 'Failed to evaluate code. Please try again.' });
    }
});

app.post('/api/behavioral-chat', authMiddleware, async (req, res) => {
    try {
        //We now extract 'targetRole', 'targetCompany', and 'useResumeContext' too
        const { messages, targetRole, targetCompany, useResumeContext } = req.body;

        if (!messages || messages.length === 0) {
            return res.status(400).json({ error: 'Chat history is required.' });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        const documentId = user.resumeDocumentId;

        //  Logic to handle Resume Context based on user preference
        let resumeContext = "";

        // Only fetch resume if useResumeContext is NOT false (default to true)
        if (useResumeContext !== false) {
            const latestResume = await ResumeReview.findOne({ user: req.user.id })
                .sort({ createdAt: -1 }); // Get the newest one

            if (latestResume && latestResume.resumeText) {
                // We limit text length to avoid token limits
                resumeContext = `
                 \n\nCRITICAL CONTEXT - CANDIDATE RESUME:
                 The candidate has uploaded a resume. USE THIS CONTEXT to ask personalized questions about their specific projects, skills, and work experience.
                 RESUME TEXT:
                 ${latestResume.resumeText.substring(0, 5000)}
                 `;
            }
        }

        // Define the dynamic Role and Company text
        const roleText = targetRole ? `the role of "${targetRole}"` : "a software engineering role";
        const companyText = targetCompany ? `at "${targetCompany}"` : "a top tech company";

        //  The "System Prompt" - This defines the AI's persona and rules
        const systemPromptOld = `
           You are "Aman", a friendly, encouraging, and professional hiring manager ${companyText}. 
            Your goal is to conduct a behavioral interview with a candidate for ${roleText}.
            
            ${resumeContext} 
            
            Follow these rules strictly:
            1. Your persona is helpful and insightful. Conduct the entire interview in professional English.
            2. Ask one behavioral question at a time. Start with an introduction and the first question.
            3. If the user has a resume (see Context above), ask questions specifically linking their past projects to ${roleText}.
            4. If the user provided a target company (${companyText}), tailor your questions to that company's culture (e.g., if Amazon, focus on Leadership Principles; if Google, focus on "Googliness").
            5. After the user answers, if their answer is too short, vague, or misses key details, ask one or two clarifying follow-up questions to encourage them to elaborate. 
            6. If the user's response is irrelevant or nonsensical, gently guide them back on topic.
            7. Once you have a complete answer, provide feedback based ONLY on the STAR method, then seamlessly transition to the next behavioral question.
            8. When the user sends the message "USER_ACTION: End interview", you must begin the conclusion. First, ask the user, "That brings us to the end of our session. Would you like a summary of your performance?"
            9. If the user's next response is "yes" or affirmative, your NEXT and FINAL message must be a comprehensive summary report of their performance. If their response is "no" or negative, your FINAL message should be a simple, polite closing.
            10. Your very final message (either the summary or the polite closing) MUST end with the special token: [SESSION_END]
            11. Never break character. Your responses should be conversational and professional.
        `;

        //More Strict Version
        const systemPrompt = `
        You are a Senior Technical Hiring Manager ${companyText}. 
            You are interviewing a candidate for the position of: ${roleText}.
            
            *** CRITICAL CONTEXT - CANDIDATE RESUME ***
            ${resumeContext}
            *******************************************
            
            **STRICT INSTRUCTIONS:**
            1. **NO HALLUCINATIONS:** You must ONLY reference skills and projects explicitly listed in the RESUME above. 
               - If the resume says "Node.js", ask about Node.js. 
               - DO NOT assume they know "Spring Boot" just because they listed "Java".
               - If you cannot find a specific technology, ask about their "C++" or "JavaScript" experience which IS listed.

            2. **START IMMEDIATELY (NO FLUFF):** - Do not say "Hello" or "Tell me about yourself."
               - START DIRECTLY with a hard technical question linking the resume to the target role.
               - Format: "I see you built [Project Name]. How did you implement [Specific Feature] using [Specific Tech]?"

            3. **ROLE & COMPANY ALIGNMENT:**
               - The candidate is applying for ${roleText} at ${companyText}.
               - Ask questions that prove they can do THIS specific job.
               - If applying for MongoDB, ask about their MongoDB schema design in "PrepAI".

            4. **HANDLING SHORT ANSWERS:**
               - If the user says "No" or "I can't", do not ask generic HR questions.
               - Instead, say: "Understood. Let's shift gears. In your 'University Bus Tracking' project, how did you handle the graph algorithms in C?"

            5. **SESSION END:**
               - Only when the user types "USER_ACTION: End interview", provide a structured STAR feedback report.
               - End with: [SESSION_END]
        `;

        // Format the history for the Gemini API
        // The API expects a specific format of { role: 'user'/'model', parts: [{ text: '...' }] }
        const history = messages.map(msg => ({
            role: msg.sender === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.text }],
        }));

        // Start a chat session with the system prompt and history
        // const chat = proModel.startChat({
        const chat = flashModel.startChat({
            history: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                { role: 'model', parts: [{ text: "Okay, I understand my role. I am Alex, a hiring manager. I will start the interview now." }] },
                ...history
            ],
        });

        //  Send the last message from the user to the AI
        const lastUserMessage = messages[messages.length - 1].text;
        const previousAiMessage = messages
            .slice(0, -1)
            .reverse()
            .find(message => message.sender === 'ai');

        const currentQuestion =
            previousAiMessage?.text || '';

        const aiResult = await generateInterviewResponse(
            documentId,
            currentQuestion,
            lastUserMessage
        );

        const responseText = aiResult.response;

        if (responseText.includes("[SESSION_END]")) {
            // The AI is about to send its final message. Save the whole chat.
            const finalMessages = [
                ...messages.map(msg => ({ sender: msg.sender, text: msg.text })),
                { sender: 'ai', text: responseText } // Include the final AI reply
            ];

            const newChatSession = new ChatSession({
                user: req.user.id, // Get user ID from authMiddleware
                messages: finalMessages
            });
            await newChatSession.save();
        }

        //  Send the AI's reply back to the frontend
        res.status(200).json({ reply: responseText });

    } catch (error) {
        console.error("Error in behavioral chat:", error);
        res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
    }
});

app.post('/api/review-resume', authMiddleware, upload.single('resume'), async (req, res) => {
    try {
        // Check if a file was actually uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded.' });
        }
        // Get user ID from authMiddleware
        const userId = req.user.id;
        // Send PDF to FastAPI → chunk → embed → Qdrant
        const { uploadResume } = await import(
            './services/ai.service.js'
        );

        const ragResult = await uploadResume(req.file);

        console.log("RAG indexing result:", ragResult);

        // Store Qdrant document ID against the userF
        await User.findByIdAndUpdate(
            userId,
            {
                resumeDocumentId: ragResult.document_id
            }
        );

        console.log(`Reviewing resume for user: ${userId}`);
        //  Extract text from the PDF buffer using pdf-parse
        const data = await pdf(req.file.buffer);
        const resumeText = data.text;

        //  Craft the prompt for the AI (using the model variable)
        const prompt = `
            You are an expert career coach specializing in software engineering resumes.
            Analyze the following resume text and provide constructive feedback as a clean, raw JSON object.

            **VALIDATION STEP:**
            - If the text looks like an academic assignment, homework, essay, research paper, or random gibberish, return ONLY this JSON:
              { "error": "The uploaded file does not appear to be a resume. It looks like an assignment or document." }
            
            - ONLY if it is a valid resume, proceed with the analysis below
            **RESUME ANALYSIS:**
            The JSON object must have this exact structure:
            {
              "atsAssessment": {
                 "estimatedScore": "Provide an estimated ATS compatibility score out of 100 (e.g., 75). Base this score on factors like keyword relevance (common software engineering terms), clear structure, standard formatting, and the absence of elements that confuse ATS (like tables or complex graphics).",
                 "explanation": "Briefly explain the score, mentioning specific strengths or weaknesses related to ATS readability. Suggest one key improvement."
              },
              "strengths": "List 2-3 key strengths of the resume (e.g., strong projects, relevant skills). Be specific.",
              "areasForImprovement": "Identify 2-3 major areas that need significant improvement (e.g., lack of quantification, weak action verbs, unclear objective).",
              "actionVerbSuggestions": "Analyze action verbs. Respond as a plain text string. List 3 strong verbs used. Then, list 3 weaker phrases found and suggest a stronger alternative for each (e.g., 'Instead of 'Built', try 'Engineered'.').",
              "quantificationSuggestions": "Analyze quantifiable results. Respond as a plain text string. Point out 2 examples where adding numbers/data would show more impact. Format suggestions clearly (e.g., 'Original: [phrase]. Suggestion: [phrase with numbers].')."
    }
            --- RESUME TEXT TO ANALYZE ---
            ${resumeText}
            ---
        `;

        //  Call the AI model (make sure 'model' uses 'gemini-pro')
        const result = await flashModel.generateContent(prompt);
        const responseText = result.response.text();
        const parsedResponse = extractJson(responseText); // Using existing helper function
        if (parsedResponse.error) {
            return res.status(400).json({ error: parsedResponse.error });
        }
        if (userId) {
            const newReview = new ResumeReview({
                user: userId, // Get the user's ID from our authMiddleware
                resumeText: resumeText, // <--- Saving the raw text for the Chatbot to use later!
                documentId: ragResult.document_id,
                atsAssessment: parsedResponse.atsAssessment,
                strengths: parsedResponse.strengths,
                areasForImprovement: parsedResponse.areasForImprovement,
                actionVerbSuggestions: parsedResponse.actionVerbSuggestions,
                quantificationSuggestions: parsedResponse.quantificationSuggestions
            });
            await newReview.save();
        }
        res.status(200).json(parsedResponse); // Send the structured feedback

    } catch (error) {
        console.error("Error reviewing resume:", error);
        res.status(500).json({ error: 'Failed to review resume. Please try again.' });
    }
});

//ROUTE TO GET USER PROGRESS FOR DASHBOARD 
app.get('/api/user/progress', authMiddleware, async (req, res) => {
    try {
        // Get the user's ID from our auth middleware
        const userId = req.user.id;
        const user = await User.findById(userId);
        //  Find all data linked to this user
        const resumeReviews = await ResumeReview.find({ user: userId })
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(5); // Get the 5 most recent reviews

        const chatSessions = await ChatSession.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5); // Get the 5 most recent chats

        // Fetch DSA submissions
        const dsaSubmissions = await DsaSubmission.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5); // Get the 5 most recent submissions
        // Send the data back to the frontend
        res.status(200).json({
            resumeReviews,
            chatSessions,
            dsaSubmissions,
            currentStreak: user ? user.currentStreak : 0
        });

    } catch (error) {
        console.error("Error fetching user progress:", error);
        res.status(500).json({ message: "Server error fetching progress." });
    }
});

// ROUTE TO RECORD USER ACTIVITY AND UPDATE STREAK
app.post('/api/user/record-activity', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find the user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        //  Streak Logic 
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to the start of the day (midnight)

        let lastActivity = user.lastActivityDate;
        let streak = user.currentStreak || 0;

        if (lastActivity) {
            lastActivity = new Date(lastActivity);
            lastActivity.setHours(0, 0, 0, 0); // Normalize last activity date

            const oneDay = 1000 * 60 * 60 * 24; // Milliseconds in a day
            const diff = today.getTime() - lastActivity.getTime();

            if (diff === 0) {
                if (streak === 0) {
                    streak = 1;
                }
                // Already did an activity today. Do nothing.
            } else if (diff === oneDay) {
                // Activity was yesterday. Increment streak!
                streak++;
            } else {
                // Missed a day (or more). Reset streak to 1.
                streak = 1;
            }
        } else {
            // First activity ever. Start streak at 1.
            streak = 1;
        }

        // Update the user in the database
        user.currentStreak = streak;
        user.lastActivityDate = new Date(); // Set to *now*
        await user.save();

        // Send back the new streak count
        res.status(200).json({ currentStreak: user.currentStreak });

    } catch (error) {
        console.error("Error recording activity:", error);
        res.status(500).json({ message: "Server error recording activity." });
    }
});

// MongoDB Connection
await connectDB();

// Start the Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});