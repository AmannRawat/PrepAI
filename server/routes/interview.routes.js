import express from "express";
import multer from "multer";

import {
    startInterviewController,
    submitInterviewAnswerController,
    getInterviewSessionController,
    getResumeStatusController,
    uploadInterviewResumeController,
} from "../controllers/interview.controller.js";

import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.get(
    "/resume-status",
    authMiddleware,
    getResumeStatusController
);

router.post(
    "/upload-resume",
    authMiddleware,
    upload.single("resume"),
    uploadInterviewResumeController
);

router.post(
    "/start",
    authMiddleware,
    startInterviewController
);

router.post(
    "/:sessionId/answer",
    authMiddleware,
    submitInterviewAnswerController
);

router.get(
    "/:sessionId",
    authMiddleware,
    getInterviewSessionController
);

export default router;