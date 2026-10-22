import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";

import {
  generateProblem,
  runCode,
  evaluateCode,
  getHint,
  explainApproach,
  showSolution,
  coachChat,
  clearCoachData,
} from "../controllers/dsa.controller.js";

const router = Router();

router.post("/generate-problem", authMiddleware, generateProblem);

router.post("/run-code", authMiddleware, runCode);
router.post("/evaluate-code", authMiddleware, evaluateCode);

// DSA Coach endpoints
router.post("/hint", authMiddleware, getHint);
router.post("/explain-approach", authMiddleware, explainApproach);
router.post("/show-solution", authMiddleware, showSolution);
router.post("/coach-chat", authMiddleware, coachChat);
router.post("/coach-clear", authMiddleware, clearCoachData);

export default router;