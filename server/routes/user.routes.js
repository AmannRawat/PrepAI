import { Router } from "express";

import authMiddleware from "../middleware/auth.middleware.js";

import {
    getUserProgress,
    recordActivity,
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

export default router;