import mongoose from "mongoose";
const { Schema } = mongoose;

const reviewSchema = new Schema({
    // Link this review to a specific user
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User', // Links to User model
        required: true
    },
    documentId: {
        type: String,
        default: null
    },
    fileName: {
        type: String,
        default: ""
    },
    jobTitle: {
        type: String,
        default: ""
    },
    jobDescription: {
        type: String,
        default: ""
    },
    // ATS Assessment & Score
    atsAssessment: {
        estimatedScore: {
            type: Schema.Types.Mixed,
            default: "0"
        },
        explanation: {
            type: String,
            default: ""
        },
        breakdown: {
            skillsScore: { type: Number, default: 0 },
            skillsMax: { type: Number, default: 25 },
            qualificationsScore: { type: Number, default: 0 },
            qualificationsMax: { type: Number, default: 25 },
            experienceScore: { type: Number, default: 0 },
            experienceMax: { type: Number, default: 20 },
            keywordsScore: { type: Number, default: 0 },
            keywordsMax: { type: Number, default: 15 },
            structureScore: { type: Number, default: 0 },
            structureMax: { type: Number, default: 15 },
        },
        methodology: {
            type: String,
            default: ""
        },
        limitationsDisclaimer: {
            type: String,
            default: ""
        }
    },
    // Distinguish required vs preferred qualifications
    qualificationsAnalysis: {
        required: [{
            requirement: { type: String, default: "" },
            status: { type: String, default: "missing" }, // "supported" | "weak" | "missing"
            evidence: { type: String, default: "" },
            source: { type: String, default: "Job Description" }
        }],
        preferred: [{
            requirement: { type: String, default: "" },
            status: { type: String, default: "missing" }, // "supported" | "weak" | "missing"
            evidence: { type: String, default: "" },
            source: { type: String, default: "Job Description" }
        }],
    },
    // Evidence-based gap analysis
    gapAnalysis: [{
        requirement: { type: String, default: "" },
        source: { type: String, default: "Job Description" }, // "Job Description" | "Resume"
        status: { type: String, default: "missing" }, // "supported" | "weak" | "missing"
        evidence: { type: String, default: "" },
        notes: { type: String, default: "" }
    }],
    // Specific bullet-point rewrites
    bulletImprovements: [{
        original: { type: String, default: "" },
        improved: { type: String, default: "" },
        rationale: { type: String, default: "" },
        keywordsAdded: [{ type: String }],
        clarificationNeeded: { type: String, default: "" }
    }],
    // Prioritized action plan
    prioritizedActionPlan: {
        highPriority: [{
            action: { type: String, default: "" },
            detail: { type: String, default: "" },
            expectedBenefit: { type: String, default: "" }
        }],
        mediumPriority: [{
            action: { type: String, default: "" },
            detail: { type: String, default: "" },
            expectedBenefit: { type: String, default: "" }
        }],
        lowPriority: [{
            action: { type: String, default: "" },
            detail: { type: String, default: "" },
            expectedBenefit: { type: String, default: "" }
        }],
    },
    // Backward-compatible fields
    strengths: [String],
    areasForImprovement: [String],
    actionVerbSuggestions: String,
    quantificationSuggestions: String
}, {
    timestamps: true // Adds createdAt and updatedAt
});

const ResumeReview = mongoose.model('ResumeReview', reviewSchema);
export default ResumeReview;