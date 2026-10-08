import { PDFParse } from "pdf-parse";

import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";

import { uploadResume } from "../services/ai.service.js";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";

export async function reviewResume(req, res) {
    try {
        // Check if a file was actually uploaded
        if (!req.file) {
            return res.status(400).json({
                error: "No resume file uploaded.",
            });
        }

        // Get user ID from auth middleware
        const userId = req.user.id;

        // Send PDF to FastAPI → chunk → embed → Qdrant
        const ragResult = await uploadResume(req.file);

        console.log("RAG indexing result:", ragResult);

        // Store Qdrant document ID against the user
        await User.findByIdAndUpdate(
            userId,
            {
                resumeDocumentId: ragResult.document_id,
            }
        );

        console.log(`Reviewing resume for user: ${userId}`);

        // Extract text from PDF buffer for ATS review
        const parser = new PDFParse({
            data: req.file.buffer,
        });

        const result = await parser.getText();
        const resumeText = result.text;

        await parser.destroy();

        // Original ATS prompt
        const prompt = `
            You are an expert career coach specializing in software engineering resumes.
            Analyze the following resume text and provide constructive feedback as a clean, raw JSON object.

            **VALIDATION STEP:**
            - If the text looks like an academic assignment, homework, essay, research paper, or random gibberish, return ONLY this JSON:

              { "error": "The uploaded file does not appear to be a resume. It looks like an assignment or document." }

            - ONLY if it is a valid resume, proceed with the analysis below

            **RESUME ANALYSIS:**
            The JSON object must have this exact structure:

            {
              "atsAssessment": {
                 "estimatedScore": "Provide an estimated ATS compatibility score out of 100 (e.g., 75). Base this score on factors like keyword relevance (common software engineering terms), clear structure, standard formatting, and the absence of elements that confuse ATS (like tables or complex graphics).",

                 "explanation": "Briefly explain the score, mentioning specific strengths or weaknesses related to ATS readability. Suggest one key improvement."
              },

              "strengths": "List 2-3 key strengths of the resume (e.g., strong projects, relevant skills). Be specific.",

              "areasForImprovement": "Identify 2-3 major areas that need significant improvement (e.g., lack of quantification, weak action verbs, unclear objective).",

              "actionVerbSuggestions": "Analyze action verbs. Respond as a plain text string. List 3 strong verbs used. Then, list 3 weaker phrases found and suggest a stronger alternative for each (e.g., 'Instead of 'Built', try 'Engineered'.').",

              "quantificationSuggestions": "Analyze quantifiable results. Respond as a plain text string. Point out 2 examples where adding numbers/data would show more impact. Format suggestions clearly (e.g., 'Original: [phrase]. Suggestion: [phrase with numbers].')."
            }

            --- RESUME TEXT TO ANALYZE ---

            ${resumeText}

            ---
        `;

        const responseText = await generateText(prompt);

        const parsedResponse = extractJson(responseText);

        if (parsedResponse.error) {
            return res.status(400).json({
                error: parsedResponse.error,
            });
        }

        // Save resume review
        const newReview = new ResumeReview({
            user: userId,
            resumeText: resumeText,
            documentId: ragResult.document_id,
            atsAssessment: parsedResponse.atsAssessment,
            strengths: parsedResponse.strengths,
            areasForImprovement: parsedResponse.areasForImprovement,
            actionVerbSuggestions: parsedResponse.actionVerbSuggestions,
            quantificationSuggestions: parsedResponse.quantificationSuggestions,
        });

        await newReview.save();

        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error("Error reviewing resume:", error);

        res.status(500).json({
            error: "Failed to review resume. Please try again.",
        });
    }
}