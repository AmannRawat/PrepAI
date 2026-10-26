import { Router } from "express";
import multer from "multer";

import authMiddleware from "../middleware/auth.middleware.js";
import {
    reviewResume,
    getLatestResumeReview,
    getUserResumes,
    setPreferredResume,
} from "../controllers/resume.controller.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const isPdfMime = file.mimetype === "application/pdf" || file.mimetype === "application/x-pdf";
        const isPdfExt = file.originalname.toLowerCase().endsWith(".pdf");
        if (isPdfMime || isPdfExt) {
            cb(null, true);
        } else {
            const err = new Error("Only PDF files are supported. Please upload a PDF resume.");
            err.code = "INVALID_FILE_TYPE";
            cb(err, false);
        }
    },
});

// Middleware to catch Multer errors gracefully and return JSON responses
function handleResumeUpload(req, res, next) {
    upload.single("resume")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    error: "Resume file size exceeds the 5MB limit. Please upload a smaller PDF.",
                });
            }
            if (err.code === "INVALID_FILE_TYPE") {
                return res.status(400).json({
                    error: err.message,
                });
            }
            return res.status(400).json({
                error: err.message || "Failed to process uploaded file.",
            });
        }
        next();
    });
}

router.post(
    "/review-resume",
    authMiddleware,
    handleResumeUpload,
    reviewResume
);

router.get(
    "/review-resume/latest",
    authMiddleware,
    getLatestResumeReview
);

router.get(
    "/my-resumes",
    authMiddleware,
    getUserResumes
);

router.put(
    "/preferred",
    authMiddleware,
    setPreferredResume
);

export default router;