import { Router } from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import { behavioralChat } from "../controllers/behavioral.controller.js";

const router = Router();

router.post("/behavioral-chat", authMiddleware, behavioralChat);

export default router;