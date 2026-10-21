import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";

import {
  generateProblem,
  runCode,
  evaluateCode,
  getHint,
  explainApproach,
  showSolution,
} from "../controllers/dsa.controller.js";

const router = Router();

router.post("/generate-problem", generateProblem);

router.post("/run-code", authMiddleware, runCode);
router.post("/evaluate-code", authMiddleware, evaluateCode);

// DSA Coach endpoints
router.post("/hint", authMiddleware, getHint);
router.post("/explain-approach", authMiddleware, explainApproach);
router.post("/show-solution", authMiddleware, showSolution);

export default router;