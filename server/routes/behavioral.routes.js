import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { expensiveAiLimiter } from "../middleware/rateLimiter.js";
import { behavioralChat } from "../controllers/behavioral.controller.js";

const router = Router();

router.post("/behavioral-chat", authMiddleware, expensiveAiLimiter, behavioralChat);

export default router;