import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  generateProblem,
  evaluateCode,
} from "../controllers/dsa.controller.js";

const router = Router();

router.post("/generate-problem", generateProblem);
router.post("/evaluate-code", authMiddleware, evaluateCode);

export default router;