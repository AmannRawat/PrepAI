import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { expensiveAiLimiter } from "../middleware/rateLimiter.js";

import {
  generateProblem,
  runCode,
  evaluateCode,
  getHint,
  explainApproach,
  showSolution,
  coachChat,
  clearCoachData,
  getCompanyQuestionsHandler,
  getAvailableCompaniesHandler,
  getAdaptiveStatusHandler,
} from "../controllers/dsa.controller.js";

const router = Router();

router.post("/generate-problem", authMiddleware, expensiveAiLimiter, generateProblem);

router.post("/run-code", authMiddleware, runCode);
router.post("/evaluate-code", authMiddleware, expensiveAiLimiter, evaluateCode);

// DSA Coach endpoints
router.post("/hint", authMiddleware, expensiveAiLimiter, getHint);
router.post("/explain-approach", authMiddleware, expensiveAiLimiter, explainApproach);
router.post("/show-solution", authMiddleware, expensiveAiLimiter, showSolution);
router.post("/coach-chat", authMiddleware, expensiveAiLimiter, coachChat);
router.post("/coach-clear", authMiddleware, clearCoachData);

// Adaptive Difficulty endpoint
router.get("/adaptive-status", authMiddleware, getAdaptiveStatusHandler);

// Company Questions Catalog endpoints
router.get("/company-questions", authMiddleware, getCompanyQuestionsHandler);
router.get("/company-catalog/companies", authMiddleware, getAvailableCompaniesHandler);

export default router;