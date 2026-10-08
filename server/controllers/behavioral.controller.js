import User from "../models/User.model.js";
import ChatSession from "../models/BehavioralChat.model.js";

import { generateInterviewResponse } from "../services/ai.service.js";

export async function behavioralChat(req, res) {
    try {
        const {
            messages,
            targetRole,
            targetCompany,
            useResumeContext,
        } = req.body;

        if (!messages || messages.length === 0) {
            return res.status(400).json({
                error: "Chat history is required.",
            });
        }

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                error: "User not found.",
            });
        }

        const documentId = user.resumeDocumentId;

        // Last message = candidate's current answer
        const lastUserMessage =
            messages[messages.length - 1].text;

        // Previous AI message = current interview question
        const previousAiMessage = messages
            .slice(0, -1)
            .reverse()
            .find((message) => message.sender === "ai");

        const currentQuestion =
            previousAiMessage?.text || "";

        const aiResult = await generateInterviewResponse(
            documentId,
            currentQuestion,
            lastUserMessage,
            targetRole,
            targetCompany,
            useResumeContext
        );

        const responseText = aiResult.response;

        // Save completed interview session
        if (responseText.includes("[SESSION_END]")) {
            const finalMessages = [
                ...messages.map((message) => ({
                    sender: message.sender,
                    text: message.text,
                })),
                {
                    sender: "ai",
                    text: responseText,
                },
            ];

            const newChatSession = new ChatSession({
                user: req.user.id,
                messages: finalMessages,
            });

            await newChatSession.save();
        }

        res.status(200).json({
            reply: responseText,
        });

    } catch (error) {
        console.error("Error in behavioral chat:", error);

        res.status(500).json({
            error: "Failed to get AI response. Please try again.",
        });
    }
}