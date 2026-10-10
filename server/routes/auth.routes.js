// LEGACY AUTHENTICATION
// Kept for reference from the original PrepAI implementation.
// PrepAI 2.0 uses Clerk authentication instead.

import { Router } from "express";
import { signup, login } from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);

export default router;