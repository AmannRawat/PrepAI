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
export function buildAdaptiveStagePlan(experienceLevel = "fresher", interviewType = "Behavioral", difficulty = "Medium", focusAreas = "") {
    const exp = (experienceLevel || "fresher").toLowerCase();
    const type = (interviewType || "Behavioral").toLowerCase();
    const cleanFocus = (typeof focusAreas === "string" ? focusAreas.trim() : "");
    const focusSnippet = cleanFocus.length > 0 ? (cleanFocus.length > 30 ? cleanFocus.slice(0, 28) + "..." : cleanFocus) : "";

    const isFresher = exp.includes("student") || exp.includes("intern") || exp.includes("fresher") || exp.includes("entry");
    const isJunior = exp.includes("junior");
    const isLead = exp.includes("lead") || exp.includes("staff") || exp.includes("principal");
    const isSenior = (exp.includes("senior") || isLead) && !isJunior && !isFresher;

    const withFocus = (baseTitle, customTitle) => {
        if (!focusSnippet) return baseTitle;
        return customTitle || `${baseTitle} (${focusSnippet})`;
    };

    if (isFresher) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Fundamentals and Core CS",
                "Problem Solving",
                withFocus("Academic Projects or Practical Experience", focusSnippet ? `Projects & Applied Coding: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Academic, Teamwork or Internship Experience",
                "Communication, Adaptability and Learning",
                withFocus("Situational Questions", focusSnippet ? `Situational Questions: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Fundamentals & Problem Solving",
                "Academic Projects or Practical Experience",
                withFocus("Teamwork & Situational Scenarios", focusSnippet ? `Teamwork & Focus: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        }
    } else if (isJunior) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Practical Problem Solving",
                "Feature Implementation & Debugging",
                withFocus("Component Design & Trade-offs", focusSnippet ? `Component Implementation: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Professional Experience",
                "Teamwork & Communication",
                withFocus("Ownership & Delivery", focusSnippet ? `Ownership & Delivery: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional or Project Experience",
                "Practical Problem Solving & Debugging",
                withFocus("Design Decisions & Trade-offs", focusSnippet ? `Applied Trade-offs: ${focusSnippet}` : null),
                "Collaboration & Behavioral Scenarios",
                "Wrap-up"
            ];
        }
    } else if (isLead) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Advanced Problem Solving & Algorithmic Trade-offs",
                "Enterprise & Cross-System Architecture",
                withFocus("Reliability, Scale & Technical Leadership", focusSnippet ? `Technical Strategy: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Technical Ownership & Influence",
                "High-Stakes Decision Making",
                withFocus("Team Mentorship & Conflict Resolution", focusSnippet ? `Organizational Leadership: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional Experience & Technical Ownership",
                "Advanced Problem Solving",
                "System Design & Architecture",
                withFocus("Leadership, Trade-offs & Behavioral Scenarios", focusSnippet ? `Strategic Leadership: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        }
    } else if (isSenior) {
        if (type.includes("tech")) {
            return [
                "Welcome and Introduction",
                "Advanced Problem Solving",
                "Distributed System Design & Architecture",
                withFocus("Reliability, Scale & Technical Leadership", focusSnippet ? `Architecture & Scale: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Technical Ownership & Influence",
                "High-Stakes Decision Making",
                withFocus("Team Mentorship & Conflict Resolution", focusSnippet ? `Mentorship & Leadership: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional Experience & Technical Ownership",
                "Advanced Problem Solving",
                "System Design & Architecture",
                withFocus("Leadership, Trade-offs & Behavioral Scenarios", focusSnippet ? `Leadership & Trade-offs: ${focusSnippet}` : null),
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
                withFocus("Performance Optimization & Edge Cases", focusSnippet ? `Deep Dive: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else if (type.includes("behav")) {
            return [
                "Welcome and Introduction",
                "Project Ownership & Execution",
                "Cross-Functional Collaboration",
                withFocus("Decision-Making & Trade-offs", focusSnippet ? `Decision-Making: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        } else {
            // Mixed
            return [
                "Welcome and Introduction",
                "Professional & Project Experience",
                "Technical Problem Solving",
                "System Design & Applied Architecture",
                withFocus("Behavioral Questions & Trade-offs", focusSnippet ? `Applied Trade-offs: ${focusSnippet}` : null),
                "Wrap-up"
            ];
        }
    }
}

/**
 * Structured diagnostic logger for interview operations.
 * Never logs credentials, API keys, tokens, or resume contents.
 */
function logInterviewDiagnostic({ req, action, durationMs, status, error = null, correlationId: explicitCorrelationId = null }) {
    const correlationId =
        explicitCorrelationId ||
        req?.headers?.["x-request-id"] ||
        req?.headers?.["x-correlation-id"] ||
        crypto.randomUUID();

    const diagnostic = {
        timestamp: new Date().toISOString(),
        correlationId,
        action,
        userId: req.user?.id ? String(req.user.id) : "unauthenticated",
        durationMs,
        httpStatus: status,
        ...(error ? {
            errorName: error.name || "Error",
            errorMessage: error.message || "Unknown error",
            upstreamStatus: error.status || error.statusCode || null,
            upstreamEndpoint: error.endpoint || null,
            upstreamDetail: error.details?.detail || error.details?.error || null,
            isRateLimited: Boolean(error.isRateLimited || error.status === 429 || error.statusCode === 429),
            ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
            ...(error.headers && Object.keys(error.headers).length > 0 ? { upstreamHeaders: error.headers } : {}),
        } : {}),
    };

    if (status >= 500) {
        console.error(`[Interview Diagnostic ERROR]`, JSON.stringify(diagnostic));
    } else if (status >= 400) {
        console.warn(`[Interview Diagnostic WARN]`, JSON.stringify(diagnostic));
    } else {
        console.log(`[Interview Diagnostic INFO]`, JSON.stringify(diagnostic));
    }

    return correlationId;
}

export function resolveInterviewError(error, defaultMsg, timeoutMsg) {
    const upstreamStatus = error?.status || error?.statusCode;

    const isTimeout =
        error?.name === "TimeoutError" ||
        error?.name === "AbortError" ||
        error?.code === 23 ||
        upstreamStatus === 504 ||
        error?.message?.includes("aborted due to timeout") ||
        error?.message?.includes("timed out");

    const isRateLimited =
        upstreamStatus === 429 ||
        error?.isRateLimited === true ||
        error?.message?.includes("429") ||
        error?.message?.toLowerCase().includes("too many requests");

    const isUnavailable =
        error?.code === "ECONNREFUSED" ||
        error?.message?.includes("ECONNREFUSED") ||
        error?.message?.includes("fetch failed") ||
        upstreamStatus === 502 ||
        upstreamStatus === 503;

    const isForbidden =
        upstreamStatus === 403 ||
        error?.message?.includes("Invalid or missing internal service key") ||
        error?.message?.includes("Forbidden");

    const isNotFound = upstreamStatus === 404;

    let statusCode = 500;
    let errorMsg = defaultMsg;
    let retryAfter = error?.retryAfter || (isRateLimited ? 10 : undefined);

    if (isTimeout) {
        statusCode = 504;
        errorMsg = timeoutMsg || "The AI workflow timed out. Please try again.";
    } else if (isRateLimited) {
        statusCode = 429;
        errorMsg = error?.details?.detail || "AI interview service is temporarily receiving too many requests or warming up. Please retry shortly.";
    } else if (isUnavailable) {
        statusCode = 503;
        errorMsg = "AI interview service is temporarily unavailable or waking up. Please try again shortly.";
    } else if (isForbidden) {
        statusCode = 502;
        errorMsg = "AI service communication error: service authentication failure. Please check server configuration.";
    } else if (isNotFound) {
        statusCode = 502;
        errorMsg = "AI service communication error: interview endpoint not found. Please verify service configuration.";
    } else if (upstreamStatus === 500) {
        statusCode = 502;
        errorMsg = error?.details?.detail || error?.message || "Upstream AI service encountered an error.";
    } else if (error?.message) {
        errorMsg = error.message;
    }

    return { statusCode, errorMsg, isTimeout, isRateLimited, retryAfter };
}

export async function startInterviewController(req, res) {
    const startTime = Date.now();
    const correlationId =
        req?.headers?.["x-request-id"] ||
        req?.headers?.["x-correlation-id"] ||
        crypto.randomUUID();

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

        // Build adaptive stage plan based on experience level, interview type, difficulty, and focus areas
        const stagePlan = buildAdaptiveStagePlan(expLevel, normInterviewType, normDifficulty, focusAreas);

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
        }, { correlationId });

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
                    startingDifficulty: normDifficulty,
                    adaptiveDifficulty: normDifficulty,
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

        logInterviewDiagnostic({ req, action: "startInterview", durationMs: Date.now() - startTime, status: 200, correlationId });

        return res.status(200).json({
            sessionId: effectiveSessionId,
            status: result?.status || "waiting_for_answer",
            question: openingQuestion,
            stagePlan,
            currentStageIndex: 0,
            completedStages: 0,
            totalStages: stagePlan.length,
            currentStage: stagePlan[0] || "Welcome and Introduction",
            interviewType: normInterviewType,
            difficulty: normDifficulty,
            startingDifficulty: normDifficulty,
            adaptiveDifficulty: normDifficulty,
            resumeDocumentId: resolvedDocId || null,
        });

    } catch (error) {
        console.error("Error starting interview:", error);
        const { statusCode, errorMsg, isTimeout, isRateLimited, retryAfter } = resolveInterviewError(
            error,
            "Failed to start interview.",
            "Starting the interview timed out while initializing the AI workflow. Please try again."
        );

        logInterviewDiagnostic({
            req,
            action: "startInterview",
            durationMs: Date.now() - startTime,
            status: statusCode,
            error,
            correlationId,
        });

        if (statusCode === 429 && retryAfter) {
            res.setHeader("Retry-After", String(retryAfter));
        }

        return res.status(statusCode).json({
            error: errorMsg,
            message: errorMsg,
            isTimeout,
            isRateLimited: Boolean(isRateLimited),
            ...(retryAfter ? { retryAfter } : {}),
            correlationId,
        });
    }
}

export async function submitInterviewAnswerController(req, res) {
    const startTime = Date.now();
    const correlationId =
        req?.headers?.["x-request-id"] ||
        req?.headers?.["x-correlation-id"] ||
        crypto.randomUUID();

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
            answer.trim(),
            { correlationId }
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

        // Update adaptive difficulty progression
        const returnedAdaptiveDiff = result?.adaptive_difficulty || result?.difficulty;
        if (returnedAdaptiveDiff) {
            session.adaptiveDifficulty = returnedAdaptiveDiff;
            session.difficulty = returnedAdaptiveDiff;
        }

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

        logInterviewDiagnostic({ req, action: "submitInterviewAnswer", durationMs: Date.now() - startTime, status: 200, correlationId });

        return res.status(200).json({
            ...result,
            stagePlan: session.stagePlan,
            currentStageIndex: session.currentStageIndex,
            totalStages: session.stagePlan.length,
            currentStage: session.stagePlan[session.currentStageIndex] || "Interview",
            completedStages: session.status === "completed" ? session.stagePlan.length : session.currentStageIndex,
            interviewType: session.interviewType || "Behavioral",
            startingDifficulty: session.startingDifficulty || session.difficulty || "Medium",
            adaptiveDifficulty: session.adaptiveDifficulty || session.difficulty || "Medium",
            difficulty: session.adaptiveDifficulty || session.difficulty || "Medium",
        });

    } catch (error) {
        console.error("Error submitting interview answer:", error);
        const { statusCode, errorMsg, isTimeout, isRateLimited, retryAfter } = resolveInterviewError(
            error,
            "Failed to process interview answer.",
            "The AI interview workflow took longer than expected to process your answer. Please submit again."
        );

        logInterviewDiagnostic({
            req,
            action: "submitInterviewAnswer",
            durationMs: Date.now() - startTime,
            status: statusCode,
            error,
            correlationId,
        });

        if (statusCode === 429 && retryAfter) {
            res.setHeader("Retry-After", String(retryAfter));
        }

        return res.status(statusCode).json({
            error: errorMsg,
            message: errorMsg,
            isTimeout,
            isRateLimited: Boolean(isRateLimited),
            ...(retryAfter ? { retryAfter } : {}),
            correlationId,
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
            difficulty: session.adaptiveDifficulty || session.difficulty || "Medium",
            startingDifficulty: session.startingDifficulty || session.difficulty || "Medium",
            adaptiveDifficulty: session.adaptiveDifficulty || session.difficulty || "Medium",
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
    const startTime = Date.now();
    const correlationId =
        req?.headers?.["x-request-id"] ||
        req?.headers?.["x-correlation-id"] ||
        crypto.randomUUID();

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

        const ragResult = await uploadResume(req.file, { correlationId });
        const documentId = ragResult?.document_id || null;

        if (documentId) {
            await User.findByIdAndUpdate(req.user.id, {
                resumeDocumentId: documentId
            });
        }

        logInterviewDiagnostic({ req, action: "uploadResume", durationMs: Date.now() - startTime, status: 200, correlationId });

        return res.status(200).json({
            documentId: documentId,
            message: "Resume uploaded and indexed successfully for interview context."
        });
    } catch (error) {
        console.error("Error uploading interview resume:", error);
        const { statusCode, errorMsg, isTimeout, isRateLimited, retryAfter } = resolveInterviewError(
            error,
            "Failed to process and index resume.",
            "Resume indexing timed out. Please try again."
        );

        logInterviewDiagnostic({
            req,
            action: "uploadResume",
            durationMs: Date.now() - startTime,
            status: statusCode,
            error,
            correlationId,
        });

        if (statusCode === 429 && retryAfter) {
            res.setHeader("Retry-After", String(retryAfter));
        }

        return res.status(statusCode).json({
            error: errorMsg,
            message: errorMsg,
            isTimeout,
            isRateLimited: Boolean(isRateLimited),
            ...(retryAfter ? { retryAfter } : {}),
            correlationId,
        });
    }
}