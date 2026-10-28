import express from "express";
import multer from "multer";

import { uploadResume } from "../services/ai.service.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
});


router.post(
  "/upload-resume",
  upload.single("resume"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          message: "Resume file is required",
        });
      }

      const result = await uploadResume(req.file);

      return res.status(200).json(result);

    } catch (error) {
      console.error(
        "Resume AI processing error:",
        error
      );

      const status = error.status || error.statusCode || 500;
      if (status === 429) {
        const retryAfter = error.retryAfter || 10;
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
          message: "AI service is temporarily receiving too many requests or warming up. Please retry shortly.",
          retryAfter,
        });
      }

      return res.status(status >= 500 ? 502 : status).json({
        message: error.message || "Failed to process resume",
      });
    }
  }
);


export default router;