import { PDFParse } from "pdf-parse";

import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";

import { uploadResume } from "../services/ai.service.js";
import { generateText } from "../services/gemini.service.js";
import { extractJson } from "../utils/extractJson.js";

export async function reviewResume(req, res) {
    try {
        // Enforce authentication
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;

        // Check if a file was uploaded
        if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({
                error: "No resume file uploaded. Please upload a PDF resume.",
            });
        }

        // Validate and sanitize the job description
        const jobDescription = String(req.body.jobDescription || "").trim();
        if (!jobDescription || jobDescription.length < 20) {
            return res.status(400).json({
                error: "Please provide a job description (at least 20 characters) for the role you are targeting.",
            });
        }

        const jobTitle = String(req.body.jobTitle || "").trim();
        const sanitizedJobDescription = jobDescription.slice(0, 12000);

        // Extract text from PDF buffer safely
        let resumeText = "";
        try {
            const parser = new PDFParse({
                data: req.file.buffer,
            });
            const result = await parser.getText();
            resumeText = (result.text || "").trim();
            await parser.destroy();
        } catch (pdfError) {
            console.warn("PDF extraction error:", pdfError.message);
            return res.status(400).json({
                error: "Could not read the PDF file. Please ensure it is a valid, unencrypted PDF containing selectable text.",
            });
        }

        if (!resumeText || resumeText.length < 50) {
            return res.status(400).json({
                error: "No readable text was found in the uploaded resume. If your resume is an image or scan, please convert it to selectable text before uploading.",
            });
        }

        const sanitizedResumeText = resumeText.slice(0, 20000);

        // Optional RAG indexing: index document if AI service is online, but do not block review if offline
        let documentId = null;
        try {
            const ragResult = await uploadResume(req.file);
            documentId = ragResult?.document_id || null;
            if (documentId) {
                await User.findByIdAndUpdate(userId, {
                    resumeDocumentId: documentId,
                });
            }
        } catch (ragError) {
            console.warn("RAG indexing skipped/unavailable:", ragError.message);
        }

        // Prompt for Job-Description-Based ATS Scoring & Gap Analysis
        const prompt = `
You are an expert technical recruiter, hiring manager, and ATS (Applicant Tracking System) specialist.
Perform a thorough, objective, and evidence-grounded ATS analysis of the candidate's resume strictly against the target job description.

**VALIDATION STEP:**
- If the resume text does NOT look like a resume (e.g., it is homework, an essay, research paper, terms of service, or gibberish), return ONLY this JSON:
  { "error": "The uploaded file does not appear to be a resume. Please upload a valid software engineering or professional resume." }

**ANALYSIS GUIDELINES & INTEGRITY RULES:**
1. ATS MATCH SCORE (0-100):
   Calculate an estimated match score out of 100 with clear subscore weights:
   - Relevant Skills match: 0-25
   - Required Qualifications match: 0-25
   - Relevant Experience match: 0-20
   - Keywords & Domain Terminology match: 0-15
   - Resume Structure, Readability & Formatting: 0-15
   The total estimatedScore must equal the sum of these subscores.
   Provide an explicit methodology explanation.
   State the limitations: This score is PrepAI's algorithmic estimate based on hiring criteria and keyword alignment; it is not an employer's proprietary ATS score (e.g. Workday, Greenhouse, Lever). Proprietary systems index and rank for human reviewers rather than applying a universal reject score.

2. EVIDENCE-BASED GAP ANALYSIS:
   Distinguish REQUIRED qualifications (must-haves) from PREFERRED qualifications (nice-to-haves, bonuses).
   For each requirement:
   - Identify whether it is Supported, Weakly Evidenced, or Missing.
   - For supported/weak items: cite the exact quote or specific evidence from the resume.
   - For missing items: state that it was present in the Job Description but absent from the Resume text.
   - CRITICAL: Add a clear note clarifying that absence from the resume text does NOT imply the candidate lacks personal ability in reality; if they have the experience, they should incorporate it truthfully.

3. SPECIFIC BULLET-POINT REWRITES:
   Identify 3 to 5 actual bullet points from the candidate's resume that could be rewritten for better alignment with this job description.
   For each bullet:
   - original: The exact original bullet from the candidate's resume.
   - improved: A concrete rewrite grounded strictly in the candidate's real experience and projects.
   - rationale: Why this rewrite improves alignment with the target job (e.g., highlights key technologies, uses active engineering verbs).
   - keywordsAdded: An array of 1-3 relevant keywords naturally and truthfully woven into the rewrite.
   - clarificationNeeded: If specific metrics, scale, or outcomes are missing, prompt the candidate to verify and insert their actual metrics. NEVER fabricate numbers, dates, fake employers, or false achievements.

4. PRIORITIZED ACTION PLAN:
   Group recommendations into three distinct priority tiers:
   - High Priority: Major missing required qualifications, core technical stack mismatches, or critical structural issues.
   - Medium Priority: Weakly evidenced achievements, passive bullet phrasing, or unhighlighted secondary skills.
   - Low Priority: Formatting, standard section headers, minor phrasing polish, or typography.
   For every action item, provide:
   - action: Short title
   - detail: Specific recommendation
   - expectedBenefit: Realistic expected benefit (e.g., "Improves keyword indexing for backend recruiter queries"). Never promise guaranteed ATS bypass or guaranteed interview offers.

5. BACKWARD-COMPATIBLE SUMMARY FIELDS:
   - strengths: Array of 3-4 top strengths for this specific job match.
   - areasForImprovement: Array of 3-4 main areas to improve.
   - actionVerbSuggestions: Text summary of 3 strong verbs used and 3 suggested replacements for weak verbs found.
   - quantificationSuggestions: Text summary of 2 specific places where adding measurable metrics would show greater impact.

**TARGET JOB ROLE:** ${jobTitle || "Software Engineer"}

**TARGET JOB DESCRIPTION:**
${sanitizedJobDescription}

**CANDIDATE'S RESUME TEXT:**
${sanitizedResumeText}

**OUTPUT FORMAT:**
Return ONLY one valid JSON object. No markdown code blocks, no backticks, no text before or after the JSON.
Follow this schema exactly:
{
  "atsAssessment": {
    "estimatedScore": 75,
    "explanation": "Summary explanation of the overall score and alignment with the target job.",
    "breakdown": {
      "skillsScore": 20,
      "skillsMax": 25,
      "qualificationsScore": 18,
      "qualificationsMax": 25,
      "experienceScore": 15,
      "experienceMax": 20,
      "keywordsScore": 11,
      "keywordsMax": 15,
      "structureScore": 11,
      "structureMax": 15
    },
    "methodology": "Score is calculated as a weighted composite across relevant technical skills (25%), required qualifications (25%), relevant project/work experience (20%), ATS keyword match (15%), and resume structure/readability (15%).",
    "limitationsDisclaimer": "This score is PrepAI's algorithmic estimate based on industry hiring criteria and keyword alignment. It is not an employer's proprietary ATS score (e.g. Workday, Greenhouse, Lever). Proprietary systems index and rank for human reviewers rather than applying a universal reject score."
  },
  "qualificationsAnalysis": {
    "required": [
      {
        "requirement": "Requirement title from JD",
        "status": "supported | weak | missing",
        "evidence": "Exact quote or specific resume evidence if supported/weak, or 'Not detected in resume text' if missing",
        "source": "Job Description"
      }
    ],
    "preferred": [
      {
        "requirement": "Preferred qualification from JD",
        "status": "supported | weak | missing",
        "evidence": "Evidence or explanation",
        "source": "Job Description"
      }
    ]
  },
  "gapAnalysis": [
    {
      "requirement": "Requirement name",
      "source": "Job Description",
      "status": "supported | weak | missing",
      "evidence": "Resume evidence or absence explanation",
      "notes": "Actionable insight. If missing from resume, emphasize that omission from text does not mean the user lacks the skill in reality."
    }
  ],
  "bulletImprovements": [
    {
      "original": "Original bullet from resume",
      "improved": "Concrete rewrite grounded in candidate's experience",
      "rationale": "Why this improves alignment",
      "keywordsAdded": ["Keyword1", "Keyword2"],
      "clarificationNeeded": "Prompt for user verification of metrics if missing"
    }
  ],
  "prioritizedActionPlan": {
    "highPriority": [
      {
        "action": "Action title",
        "detail": "Action detail",
        "expectedBenefit": "Expected impact"
      }
    ],
    "mediumPriority": [
      {
        "action": "Action title",
        "detail": "Action detail",
        "expectedBenefit": "Expected impact"
      }
    ],
    "lowPriority": [
      {
        "action": "Action title",
        "detail": "Action detail",
        "expectedBenefit": "Expected impact"
      }
    ]
  },
  "strengths": [
    "Key strength 1",
    "Key strength 2",
    "Key strength 3"
  ],
  "areasForImprovement": [
    "Area 1",
    "Area 2",
    "Area 3"
  ],
  "actionVerbSuggestions": "3 strong verbs used and 3 replacements for weaker phrases.",
  "quantificationSuggestions": "2 places where adding numbers/metrics would show more impact."
}
`;

        const responseText = await generateText(prompt);
        const parsedResponse = extractJson(responseText);

        if (parsedResponse.error) {
            return res.status(400).json({
                error: parsedResponse.error,
            });
        }

        // Normalize estimatedScore to ensure consistency
        let finalScore = 0;
        if (parsedResponse.atsAssessment?.breakdown) {
            const b = parsedResponse.atsAssessment.breakdown;
            const calculatedSum =
                (Number(b.skillsScore) || 0) +
                (Number(b.qualificationsScore) || 0) +
                (Number(b.experienceScore) || 0) +
                (Number(b.keywordsScore) || 0) +
                (Number(b.structureScore) || 0);
            finalScore = Math.max(0, Math.min(100, Math.round(calculatedSum)));
            parsedResponse.atsAssessment.estimatedScore = String(finalScore);
        } else {
            finalScore = Math.max(0, Math.min(100, Math.round(Number(parsedResponse.atsAssessment?.estimatedScore) || 50)));
            parsedResponse.atsAssessment.estimatedScore = String(finalScore);
        }

        // Ensure array structures exist
        if (!Array.isArray(parsedResponse.strengths)) {
            parsedResponse.strengths = parsedResponse.strengths ? [String(parsedResponse.strengths)] : [];
        }
        if (!Array.isArray(parsedResponse.areasForImprovement)) {
            parsedResponse.areasForImprovement = parsedResponse.areasForImprovement ? [String(parsedResponse.areasForImprovement)] : [];
        }

        // Save resume review to database
        try {
            const newReview = new ResumeReview({
                user: userId,
                documentId: documentId,
                fileName: req.file?.originalname || (jobTitle ? `${jobTitle} Resume.pdf` : "Resume.pdf"),
                jobTitle: jobTitle || "Target Role",
                jobDescription: sanitizedJobDescription,
                atsAssessment: parsedResponse.atsAssessment,
                qualificationsAnalysis: parsedResponse.qualificationsAnalysis || { required: [], preferred: [] },
                gapAnalysis: parsedResponse.gapAnalysis || [],
                bulletImprovements: parsedResponse.bulletImprovements || [],
                prioritizedActionPlan: parsedResponse.prioritizedActionPlan || { highPriority: [], mediumPriority: [], lowPriority: [] },
                strengths: parsedResponse.strengths,
                areasForImprovement: parsedResponse.areasForImprovement,
                actionVerbSuggestions: parsedResponse.actionVerbSuggestions || "",
                quantificationSuggestions: parsedResponse.quantificationSuggestions || "",
            });

            await newReview.save();
        } catch (dbError) {
            console.error("Error saving ResumeReview to database:", dbError.message);
        }

        return res.status(200).json(parsedResponse);
    } catch (error) {
        console.error("Error reviewing resume:", error.message);
        return res.status(500).json({
            error: "Failed to review resume against job description. Please try again.",
        });
    }
}

/**
 * Retrieves the latest saved resume review for the authenticated user.
 */
export async function getLatestResumeReview(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const latestReview = await ResumeReview.findOne({ user: req.user.id })
            .sort({ createdAt: -1 });

        if (!latestReview) {
            return res.status(200).json({ review: null });
        }

        return res.status(200).json({ review: latestReview });
    } catch (error) {
        console.error("Error retrieving latest resume review:", error);
        return res.status(500).json({
            error: "Failed to retrieve resume review.",
        });
    }
}

/**
 * Retrieves all uploaded resumes and reviews for the authenticated user with preferred status.
 */
export async function getUserResumes(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const user = await User.findById(req.user.id).select("careerPreferences resumeDocumentId");
        const reviews = await ResumeReview.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .select("fileName jobTitle atsAssessment documentId createdAt");

        const preferredId = user?.careerPreferences?.preferredResumeId || null;
        const currentDocId = user?.resumeDocumentId || null;

        let highestScore = -1;
        reviews.forEach((r) => {
            const score = Number(r.atsAssessment?.estimatedScore) || 0;
            if (score > highestScore) highestScore = score;
        });

        const formattedResumes = reviews.map((r, index) => {
            const score = Number(r.atsAssessment?.estimatedScore) || 0;
            const isPreferred = preferredId
                ? String(preferredId) === String(r._id)
                : Boolean(currentDocId && currentDocId === r.documentId);

            return {
                _id: r._id,
                fileName: r.fileName || (r.jobTitle ? `${r.jobTitle} Resume.pdf` : "Uploaded Resume.pdf"),
                jobTitle: r.jobTitle || "Target Role",
                atsScore: score,
                documentId: r.documentId,
                createdAt: r.createdAt,
                isPreferred,
                isNewest: index === 0,
                isHighestScore: score > 0 && score === highestScore,
            };
        });

        return res.status(200).json({
            success: true,
            preferredResumeId: preferredId,
            resumes: formattedResumes,
        });
    } catch (error) {
        console.error("Error fetching user resumes:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user resumes.",
        });
    }
}

/**
 * Designates an existing resume owned by the user as their preferred resume.
 */
export async function setPreferredResume(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const { resumeId } = req.body || {};
        if (!resumeId) {
            return res.status(400).json({
                success: false,
                message: "Please specify a resumeId to designate as preferred.",
            });
        }

        // Verify ownership: Resume must belong to authenticated user
        const review = await ResumeReview.findOne({
            _id: resumeId,
            user: req.user.id,
        });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Resume not found or does not belong to your account.",
            });
        }

        const updateFields = {
            "careerPreferences.preferredResumeId": review._id.toString(),
        };
        if (review.documentId) {
            updateFields.resumeDocumentId = review.documentId;
        }

        await User.findByIdAndUpdate(req.user.id, { $set: updateFields });

        return res.status(200).json({
            success: true,
            message: "Preferred resume updated successfully.",
            preferredResumeId: review._id.toString(),
            documentId: review.documentId || null,
        });
    } catch (error) {
        console.error("Error designating preferred resume:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to set preferred resume.",
        });
    }
}