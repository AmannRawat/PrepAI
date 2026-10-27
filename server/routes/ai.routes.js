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

      return res.status(500).json({
        message: "Failed to process resume",
      });
    }
  }
);


export default router;