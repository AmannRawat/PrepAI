import { Router } from "express";
import multer from "multer";

import authMiddleware from "../middleware/auth.middleware.js";
import { reviewResume } from "../controllers/resume.controller.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
});

router.post(
    "/review-resume",
    authMiddleware,
    upload.single("resume"),
    reviewResume
);

export default router;