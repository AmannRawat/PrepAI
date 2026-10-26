import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import {
    getUserProgress,
    recordActivity,
    getStudyPlan,
    saveStudyPlan,
    getDsaStats,
    getCalendarActivity,
    getUserPreferences,
    updateUserPreferences,
    getUserMemoriesController,
    createUserMemoryController,
    updateUserMemoryController,
    deleteUserMemoryController,
} from "../controllers/user.controller.js";

const router = Router();

router.get(
    "/progress",
    authMiddleware,
    getUserProgress
);

router.get(
    "/calendar",
    authMiddleware,
    getCalendarActivity
);

router.get(
    "/preferences",
    authMiddleware,
    getUserPreferences
);

router.put(
    "/preferences",
    authMiddleware,
    updateUserPreferences
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

router.get(
    "/memories",
    authMiddleware,
    getUserMemoriesController
);

router.post(
    "/memories",
    authMiddleware,
    createUserMemoryController
);

router.put(
    "/memories/:id",
    authMiddleware,
    updateUserMemoryController
);

router.delete(
    "/memories/:id",
    authMiddleware,
    deleteUserMemoryController
);

export default router;