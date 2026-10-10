import express from "express";

import {
    startInterviewController,
    submitInterviewAnswerController,
} from "../controllers/interview.controller.js";

import authMiddleware from "../middleware/auth.middleware.js";

const router = express.Router();


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


export default router;