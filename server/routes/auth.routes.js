// LEGACY AUTHENTICATION
// Kept for reference from the original PrepAI implementation.
// PrepAI 2.0 uses Clerk authentication instead.

import { Router } from "express";
import { signup, login } from "../controllers/auth.controller.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/signup", authLimiter, signup);
router.post("/login", authLimiter, login);

export default router;