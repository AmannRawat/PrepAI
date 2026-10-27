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

// Configure trust proxy safely (supports boolean, hop count, and validated subnet/IP lists)
const trustProxySetting = parseTrustProxy(process.env.TRUST_PROXY);
app.set("trust proxy", trustProxySetting);

// Initialize Clerk authentication first so getAuth(req) is available for rate-limit keying
app.use(clerkMiddleware());

// Apply general API rate limiter across all incoming endpoints (skips / and /ping)
app.use(generalLimiter);

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
app.use("/api/resume", resumeRoutes);

//ROUTE TO GET USER PROGRESS FOR DASHBOARD 
app.use("/api/user", userRoutes);

app.use("/api/interview", interviewRoutes);

// MongoDB Connection
await connectDB();

// Start the Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});