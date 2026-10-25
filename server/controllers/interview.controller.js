import crypto from "node:crypto";
import {
    startInterview,
    submitInterviewAnswer,
    uploadResume,
} from "../services/ai.service.js";

import {
    saveMemory,
    getMemoryContext,
} from "../services/memory.service.js";
import { generateText } from "../services/gemini.service.js";
import User from "../models/User.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import ResumeReview from "../models/ResumeReview.model.js";

/**
 * Generates an adaptive stage plan based on candidate experience level,
 * interview type (Technical, Behavioral, Mixed), and baseline difficulty.
 */
export function buildAdaptiveStagePlan(experienceLevel = "fresher", interviewType = "Behavioral", difficulty = "Medium") {
    const exp = (experienceLevel || "fresher").toLowerCase();
    const type = (interviewType || "Behavioral").toLowerCase();

    const isFresher = exp.includes("student") || exp.includes("intern") || exp.includes("fresher") || exp.includes("entry");
    const isJunior = exp.includes("junior");
    const isSenior = exp.includes("senior") || exp.includes("lead") || exp.includes("staff") || exp.includes("principal");

    if (isFresher) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Fundamentals and Core CS",
                "Problem Solving",
                "Academic Projects or Practical Experience",
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Academic, Teamwork or Internship Experience",
                "Communication, Adaptability and Learning",
                "Situational Questions",
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Fundamentals & Problem Solving",
                "Academic Projects or Practical Experience",
                "Teamwork & Situational Scenarios",
                "Wrap-up"
            ];
        }
    } else if (isJunior) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Practical Problem Solving",
                "Feature Implementation & Debugging",
                "Component Design & Trade-offs",
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Professional Experience",
                "Teamwork & Communication",
                "Ownership & Delivery",
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional or Project Experience",
                "Practical Problem Solving & Debugging",
                "Design Decisions & Trade-offs",
                "Collaboration & Behavioral Scenarios",
                "Wrap-up"
            ];
        }
    } else if (isSenior) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Advanced Problem Solving",
                "Distributed System Design & Architecture",
                "Reliability, Scale & Technical Leadership",
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Technical Ownership & Influence",
                "High-Stakes Decision Making",
                "Team Mentorship & Conflict Resolution",
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional Experience & Technical Ownership",
                "Advanced Problem Solving",
                "System Design & Architecture",
                "Leadership, Trade-offs & Behavioral Scenarios",
                "Wrap-up"
            ];
        }
    } else {
        // Mid-Level
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Technical Problem Solving",
                "Component Architecture & Modularity",
                "Performance Optimization & Edge Cases",
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Project Ownership & Execution",
                "Cross-Functional Collaboration",
                "Decision-Making & Trade-offs",
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional & Project Experience",
                "Technical Problem Solving",
                "System Design & Applied Architecture",
                "Behavioral Questions & Trade-offs",
                "Wrap-up"
            ];
        }
    }
}

export async function startInterviewController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                error: "Unauthorized. Please log in to start an interview.",
                message: "Unauthorized. Please log in to start an interview.",
            });
        }

        const {
            sessionId,
            documentId,
            targetRole,
            targetCompany,
            interviewType = "Behavioral",
            difficulty = "Medium",
            experienceLevel,
            yearsOfExperience,
            focusAreas,
            firstQuestion,
        } = req.body;

        const effectiveSessionId = sessionId || crypto.randomUUID();
        const expLevel = (experienceLevel || "fresher").toLowerCase();
        const normInterviewType = interviewType ? String(interviewType).trim() : "Behavioral";
        const normDifficulty = difficulty ? String(difficulty).trim() : "Medium";
        const parsedYears = (yearsOfExperience !== undefined && yearsOfExperience !== null && yearsOfExperience !== "") ? Number(yearsOfExperience) : null;
        const expYears = parsedYears !== null ? ` (${parsedYears} years)` : "";
        const focus = focusAreas ? ` Candidate focus areas: ${focusAreas}.` : "";

        // Resolve candidate resume document ID if requested
        let resolvedDocId = documentId || "";
        if (!resolvedDocId && req.body.useResumeContext !== false) {
            try {
                const user = await User.findById(req.user.id).select("resumeDocumentId");
                resolvedDocId = user?.resumeDocumentId || "";

                if (!resolvedDocId) {
                    const latestReview = await ResumeReview.findOne({
                        user: req.user.id,
                        documentId: { $ne: null }
                    }).sort({ createdAt: -1 }).select("documentId");

                    if (latestReview?.documentId) {
                        resolvedDocId = latestReview.documentId;
                        await User.findByIdAndUpdate(req.user.id, { resumeDocumentId: resolvedDocId });
                    }
                }
            } catch (e) {
                console.warn("Could not look up user resume document ID:", e.message);
            }
        }

        // Build adaptive stage plan based on experience level, interview type, and difficulty
        const stagePlan = buildAdaptiveStagePlan(expLevel, normInterviewType, normDifficulty);

        // Generate opening welcome & introduction question dynamically if not provided
        let openingQuestion = (firstQuestion || "").trim();
        const role = targetRole || "Software Engineer";
        const company = targetCompany || "Tech Company";

        const isFresher = expLevel.includes("student") || expLevel.includes("intern") || expLevel.includes("fresher") || expLevel.includes("entry");
        const isJunior = expLevel.includes("junior");
        const isSenior = expLevel.includes("senior") || expLevel.includes("lead") || expLevel.includes("staff") || expLevel.includes("principal");
        const levelLabel = isFresher ? "entry-level" : isJunior ? "junior" : isSenior ? "senior" : "mid-level";

        if (!openingQuestion) {
            const prompt = `You are Pepe, a friendly, professional, and encouraging AI interviewer conducting an interview for ${company} for the position of ${role}.
Candidate declared experience level: ${expLevel}${expYears}.${focus}
Interview Type: ${normInterviewType}
Difficulty: ${normDifficulty}
Current Stage: ${stagePlan[0] || "Welcome and Introduction"}

Goal: Generate a concise, natural, and welcoming opening message from Pepe to begin the interview.

Requirements:
1. Introduce yourself warmly as Pepe, their AI interviewer.
2. Naturally welcome the candidate to their ${company} ${normInterviewType.toLowerCase()} interview for the ${role} position.
3. Weave in the interview context naturally (e.g., tailored for their ${levelLabel} background at a ${normDifficulty.toLowerCase()} difficulty level) without sounding like a robotic configuration readout.
4. Conclude with a warm invitation for the candidate to introduce themselves as the first interview question (e.g. asking them to share a brief overview of their background, what they've worked on, or what brings them to this role).
5. Do NOT ask complex technical questions, coding problems, or deep situational scenarios yet—this turn is strictly for the welcome and introduction.
6. Do not make false claims that this is an official or proprietary question from ${company}.
7. Keep it conversational, encouraging, and under 3-4 sentences total.
8. Return ONLY Pepe's spoken greeting and introductory question.`;

            try {
                openingQuestion = (await generateText(prompt)).trim();
            } catch (geminiErr) {
                console.warn("Could not generate opening question via Gemini, using standard opening:", geminiErr.message);
                openingQuestion = `Hi, I'm Pepe, your AI interviewer! Welcome to your ${company} ${normInterviewType.toLowerCase()} interview for the ${role} position. We'll be working at a ${normDifficulty.toLowerCase()} difficulty level tailored to your ${levelLabel} background. Let's start with a brief introduction—could you tell me a little about yourself and what you've been working on recently?`;
            }
        }

        // Retrieve the user's existing persistent memories
        const memoryContext = await getMemoryContext(req.user.id);

        const result = await startInterview({
            session_id: effectiveSessionId,
            user_id: req.user.id,
            document_id: resolvedDocId,
            target_role: targetRole || null,
            target_company: targetCompany || null,
            interview_type: normInterviewType,
            difficulty: normDifficulty,
            stage_plan: stagePlan,
            current_stage_index: 0,
            experience_level: expLevel,
            years_of_experience: parsedYears,
            focus_areas: focusAreas || "",
            memory_context: memoryContext,
            first_question: openingQuestion,
        });

        // Record session ownership in MongoDB
        await ChatSession.findOneAndUpdate(
            { sessionId: effectiveSessionId },
            {
                $set: {
                    user: req.user.id,
                    sessionId: effectiveSessionId,
                    targetRole: targetRole || null,
                    targetCompany: targetCompany || null,
                    interviewType: normInterviewType,
                    difficulty: normDifficulty,
                    stagePlan: stagePlan,
                    currentStageIndex: 0,
                    experienceLevel: expLevel,
                    yearsOfExperience: parsedYears,
                    focusAreas: focusAreas || null,
                    status: "active",
                    messages: [
                        { sender: "ai", text: openingQuestion },
                    ],
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.status(200).json({
            sessionId: effectiveSessionId,
            status: result?.status || "waiting_for_answer",
            question: openingQuestion,
            stagePlan,
            currentStageIndex: 0,
            totalStages: stagePlan.length,
            currentStage: stagePlan[0] || "Introduction",
            interviewType: normInterviewType,
            difficulty: normDifficulty,
            resumeDocumentId: resolvedDocId || null,
        });

    } catch (error) {
        console.error("Error starting interview:", error);
        const isTimeout =
            error.name === "TimeoutError" ||
            error.name === "AbortError" ||
            error.code === 23 ||
            error.message?.includes("aborted due to timeout") ||
            error.message?.includes("timed out");

        const isUnavailable =
            error.message?.includes("ECONNREFUSED") ||
            error.message?.includes("fetch failed") ||
            error.status === 502 ||
            error.status === 503;

        let statusCode = 500;
        let errorMsg = "Failed to start interview.";

        if (isTimeout) {
            statusCode = 504;
            errorMsg = "Starting the interview timed out while initializing the AI workflow. Please try again.";
        } else if (isUnavailable) {
            statusCode = 503;
            errorMsg = "AI interview service is temporarily unavailable. Please try again shortly.";
        } else if (error.message) {
            errorMsg = error.message;
        }

        return res.status(statusCode).json({
            error: errorMsg,
            message: errorMsg,
            isTimeout,
        });
    }
}

export async function submitInterviewAnswerController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                error: "Unauthorized. Please log in.",
                message: "Unauthorized. Please log in.",
            });
        }

        const { sessionId } = req.params;
        const { answer } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                error: "sessionId is required.",
                message: "sessionId is required.",
            });
        }

        if (!answer || typeof answer !== "string" || !answer.trim()) {
            return res.status(400).json({
                error: "Answer is required.",
                message: "Answer is required.",
            });
        }

        // Enforce session ownership: verify this session belongs to the authenticated user
        const session = await ChatSession.findOne({
            sessionId,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({
                error: "Interview session not found or unauthorized.",
                message: "Interview session not found or you do not have permission to access it.",
            });
        }

        const result = await submitInterviewAnswer(
            sessionId,
            answer.trim()
        );

        // LangGraph returns memories extracted from this answer
        const memories = result?.memories || result?.result?.memories || [];

        // Persist extracted memories in MongoDB
        for (const memory of memories) {
            if (memory?.content && memory?.category) {
                await saveMemory({
                    userId: req.user.id,
                    category: memory.category,
                    content: memory.content,
                    source: "interview",
                    confidence: memory.confidence ?? 0.8,
                });
            }
        }

        // Update stage progression
        const existingStages = Array.isArray(session.stagePlan) && session.stagePlan.length > 0
            ? session.stagePlan
            : buildAdaptiveStagePlan(session.experienceLevel, session.interviewType, session.difficulty);
        session.stagePlan = existingStages;

        let nextStageIndex = session.currentStageIndex || 0;
        if (typeof result?.current_stage_index === "number") {
            nextStageIndex = result.current_stage_index;
        } else if (result?.final_report || result?.status === "completed") {
            nextStageIndex = Math.max(0, existingStages.length - 1);
        } else {
            nextStageIndex = Math.min((session.currentStageIndex || 0) + 1, existingStages.length - 1);
        }
        session.currentStageIndex = nextStageIndex;

        // Update MongoDB chat session history
        session.messages.push({ sender: "user", text: answer.trim() });
        if (result?.final_report || result?.status === "completed") {
            session.status = "completed";
            session.finalReport = result.final_report;
            session.messages.push({
                sender: "ai",
                text: result.final_report || "Interview completed. Great job!",
            });
        } else if (result?.question) {
            session.messages.push({
                sender: "ai",
                text: result.question,
            });
        }
        await session.save();

        return res.status(200).json({
            ...result,
            stagePlan: session.stagePlan,
            currentStageIndex: session.currentStageIndex,
            totalStages: session.stagePlan.length,
            currentStage: session.stagePlan[session.currentStageIndex] || "Interview",
            completedStages: session.status === "completed" ? session.stagePlan.length : session.currentStageIndex,
            interviewType: session.interviewType || "Behavioral",
            difficulty: session.difficulty || "Medium",
        });

    } catch (error) {
        console.error("Error submitting interview answer:", error);
        const isTimeout =
            error.name === "TimeoutError" ||
            error.name === "AbortError" ||
            error.code === 23 ||
            error.message?.includes("aborted due to timeout") ||
            error.message?.includes("timed out");

        const isUnavailable =
            error.message?.includes("ECONNREFUSED") ||
            error.message?.includes("fetch failed") ||
            error.status === 502 ||
            error.status === 503;

        let statusCode = 500;
        let errorMsg = "Failed to process interview answer.";

        if (isTimeout) {
            statusCode = 504;
            errorMsg = "The AI interview workflow took longer than expected to process your answer. Please submit again.";
        } else if (isUnavailable) {
            statusCode = 503;
            errorMsg = "AI interview service is temporarily unavailable. Please try again shortly.";
        } else if (error.message) {
            errorMsg = error.message;
        }

        return res.status(statusCode).json({
            error: errorMsg,
            message: errorMsg,
            isTimeout,
        });
    }
}

export async function getInterviewSessionController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                error: "Unauthorized. Please log in.",
                message: "Unauthorized. Please log in.",
            });
        }

        const { sessionId } = req.params;
        const session = await ChatSession.findOne({
            sessionId,
            user: req.user.id,
        });

        if (!session) {
            return res.status(404).json({
                error: "Interview session not found or unauthorized.",
                message: "Interview session not found or unauthorized.",
            });
        }

        const stages = Array.isArray(session.stagePlan) && session.stagePlan.length > 0
            ? session.stagePlan
            : buildAdaptiveStagePlan(session.experienceLevel, session.interviewType, session.difficulty);

        return res.status(200).json({
            sessionId: session.sessionId,
            status: session.status,
            targetRole: session.targetRole,
            targetCompany: session.targetCompany,
            interviewType: session.interviewType || "Behavioral",
            difficulty: session.difficulty || "Medium",
            stagePlan: stages,
            currentStageIndex: session.currentStageIndex || 0,
            totalStages: stages.length,
            currentStage: stages[session.currentStageIndex || 0] || "Interview",
            completedStages: session.status === "completed" ? stages.length : (session.currentStageIndex || 0),
            experienceLevel: session.experienceLevel,
            yearsOfExperience: session.yearsOfExperience,
            focusAreas: session.focusAreas,
            finalReport: session.finalReport,
            messages: session.messages,
        });
    } catch (error) {
        console.error("Error retrieving interview session:", error);
        return res.status(500).json({
            error: "Failed to retrieve interview session.",
        });
    }
}

/**
 * Checks if the authenticated user has an active resume document ID (from User or ResumeReview)
 */
export async function getResumeStatusController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in."
            });
        }

        const user = await User.findById(req.user.id).select("resumeDocumentId");
        let documentId = user?.resumeDocumentId || null;

        // Fallback to latest ResumeReview if user record is missing it
        if (!documentId) {
            const latestReview = await ResumeReview.findOne({
                user: req.user.id,
                documentId: { $ne: null }
            }).sort({ createdAt: -1 }).select("documentId");

            if (latestReview?.documentId) {
                documentId = latestReview.documentId;
                await User.findByIdAndUpdate(req.user.id, { resumeDocumentId: documentId });
            }
        }

        return res.status(200).json({
            hasResume: Boolean(documentId),
            documentId: documentId
        });
    } catch (error) {
        console.error("Error retrieving resume status:", error);
        return res.status(500).json({
            error: "Failed to retrieve resume status."
        });
    }
}

/**
 * Uploads a resume PDF specifically for interview context and indexes it via Qdrant/FastAPI
 */
export async function uploadInterviewResumeController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in."
            });
        }

        if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({
                error: "No resume file uploaded. Please upload a PDF file."
            });
        }

        if (req.file.mimetype !== "application/pdf") {
            return res.status(400).json({
                error: "Only PDF files are supported. Please upload a PDF resume."
            });
        }

        const ragResult = await uploadResume(req.file);
        const documentId = ragResult?.document_id || null;

        if (documentId) {
            await User.findByIdAndUpdate(req.user.id, {
                resumeDocumentId: documentId
            });
        }

        return res.status(200).json({
            documentId: documentId,
            message: "Resume uploaded and indexed successfully for interview context."
        });
    } catch (error) {
        console.error("Error uploading interview resume:", error);
        return res.status(500).json({
            error: error.message || "Failed to process and index resume."
        });
    }
}