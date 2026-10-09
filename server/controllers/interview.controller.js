import {
    startInterview,
    submitInterviewAnswer,
} from "../services/ai.service.js";

import {
    saveMemory,
    getMemoryContext,
} from "../services/memory.service.js";


export async function startInterviewController(req, res) {
    try {
        const {
            sessionId,
            documentId,
            targetRole,
            targetCompany,
            firstQuestion,
        } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                error: "sessionId is required.",
            });
        }

        if (!firstQuestion) {
            return res.status(400).json({
                error: "firstQuestion is required.",
            });
        }

        // Retrieve the user's existing persistent memories
        const memoryContext = await getMemoryContext(
            req.user.id
        );

        const result = await startInterview({
            session_id: sessionId,

            // Authenticated Node user
            user_id: req.user.id,

            document_id: documentId || "",

            target_role: targetRole || null,

            target_company: targetCompany || null,

            // Pass previous memories into the interview graph
            memory_context: memoryContext,

            first_question: firstQuestion,
        });

        res.status(200).json(result);

    } catch (error) {
        console.error(
            "Error starting interview:",
            error
        );

        res.status(500).json({
            error: "Failed to start interview.",
        });
    }
}


export async function submitInterviewAnswerController(
    req,
    res
) {
    try {
        const { sessionId } = req.params;
        const { answer } = req.body;

        if (!answer) {
            return res.status(400).json({
                error: "Answer is required.",
            });
        }

        const result = await submitInterviewAnswer(
            sessionId,
            answer
        );

        // LangGraph returns memories extracted from this answer
        const memories =
            result?.result?.memories || [];

        // Persist extracted memories in MongoDB
        for (const memory of memories) {
            await saveMemory({
                userId: req.user.id,
                category: memory.category,
                content: memory.content,
                source: "interview",
                confidence: memory.confidence ?? 0.8,
            });
        }

        res.status(200).json(result);

    } catch (error) {
        console.error(
            "Error submitting interview answer:",
            error
        );

        res.status(500).json({
            error: "Failed to process interview answer.",
        });
    }
}