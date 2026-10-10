import "dotenv/config";

import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./config/db.js";

import authRoutes from "./routes/auth.routes.js";
import dsaRoutes from "./routes/dsa.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import behavioralRoutes from "./routes/behavioral.routes.js";
import userRoutes from "./routes/user.routes.js";
import interviewRoutes from "./routes/interview.routes.js";

const PORT = process.env.PORT || 8000;


const app = express();
// Initialize Clerk authentication
app.use(clerkMiddleware());

// app.use("/api/auth", authRoutes);
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

// Route for generating problems and code evaluation
app.use("/api", dsaRoutes);

app.use("/api", behavioralRoutes);

app.use("/api", resumeRoutes);

//ROUTE TO GET USER PROGRESS FOR DASHBOARD 
app.use("/api/user", userRoutes);

app.use("/api/interview", interviewRoutes);

// MongoDB Connection
await connectDB();

// Start the Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});