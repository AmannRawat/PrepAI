import "dotenv/config";

import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import { connectDB } from "./config/db.js";
import { generalLimiter, parseTrustProxy } from "./middleware/rateLimiter.js";

import authRoutes from "./routes/auth.routes.js";
import dsaRoutes from "./routes/dsa.routes.js";
import resumeRoutes from "./routes/resume.routes.js";
import behavioralRoutes from "./routes/behavioral.routes.js";
import userRoutes from "./routes/user.routes.js";
import interviewRoutes from "./routes/interview.routes.js";

const PORT = process.env.PORT || 5000;

// Validate required service-to-service authentication secret at startup
if (!process.env.AI_SERVICE_SECRET || !process.env.AI_SERVICE_SECRET.trim()) {
    console.error("[Startup Configuration Error] Missing required environment variable: AI_SERVICE_SECRET must be configured to authenticate requests to the AI service.");
    process.exit(1);
}

const app = express();

// Configure trust proxy safely to ensure Express correctly parses client IPs behind reverse proxies (Render, Vercel).
const trustProxySetting = parseTrustProxy(process.env.TRUST_PROXY);
app.set("trust proxy", trustProxySetting);

// Run Clerk middleware early so getAuth(req) can extract user IDs for authenticated rate-limit buckets.
app.use(clerkMiddleware());

// General rate limiter protects against abusive request bursts; health probes (/ and /ping) are exempt.
app.use(generalLimiter);

app.use(cors({
    // Permitted client origins for local development and production Vercel deployments.
    origin: [
        "http://localhost:5173",
        "https://prepai-client-try.vercel.app",
        "https://prepai-app.vercel.app"
    ],
    credentials: true
}));
app.use(express.json());

// Health probes for deployment monitoring and uptime heartbeats
app.get('/', (req, res) => {
    res.status(200).json({ message: "PrepAI Backend is running!" });
});

app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

// DSA problem generation, test-case verification, and code execution endpoints
app.use("/api", dsaRoutes);

// Behavioral interview chat and audio analysis endpoints
app.use("/api", behavioralRoutes);

// Resume parsing, review generation, and PDF vector ingest routes
app.use("/api", resumeRoutes);
app.use("/api/resume", resumeRoutes);

// User profile, learning preferences, daily streaks, and aggregate progress
app.use("/api/user", userRoutes);

// Multi-turn LangGraph AI interview orchestration
app.use("/api/interview", interviewRoutes);

// Connect to MongoDB Atlas before binding to the network port
await connectDB();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});