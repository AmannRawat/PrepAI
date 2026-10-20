import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";

import {
  generateProblem,
  evaluateCode,
  getHint,
  explainApproach,
  showSolution,
} from "../controllers/dsa.controller.js";

const router = Router();

router.post("/generate-problem", generateProblem);

router.post("/evaluate-code", authMiddleware, evaluateCode);

// DSA Coach endpoints
router.post("/hint", authMiddleware, getHint);
router.post("/explain-approach", authMiddleware, explainApproach);
router.post("/show-solution", authMiddleware, showSolution);

export default router;