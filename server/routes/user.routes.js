import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
    getUserProgress,
    recordActivity,
    getStudyPlan,
    saveStudyPlan,
    getDsaStats,
} from "../controllers/user.controller.js";

const router = Router();

router.get(
    "/progress",
    authMiddleware,
    getUserProgress
);

router.post(
    "/record-activity",
    authMiddleware,
    recordActivity
);

router.get(
    "/study-plan",
    authMiddleware,
    getStudyPlan
);

router.put(
    "/study-plan",
    authMiddleware,
    saveStudyPlan
);

router.get(
    "/dsa-stats",
    authMiddleware,
    getDsaStats
);

export default router;