import { Router } from "express";
import {
  getHealthStatus,
  getNodeHealth,
  getAiHealth,
} from "../controllers/health.controller.js";

const router = Router();

// Primary health check (supports ?service=node and ?service=ai or combined)
router.get("/", getHealthStatus);

// Explicit sub-routes
router.get("/node", getNodeHealth);
router.get("/ai", getAiHealth);

export default router;

