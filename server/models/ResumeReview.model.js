import mongoose from "mongoose";
const { Schema } = mongoose;

const reviewSchema = new Schema({
    // Link this review to a specific user
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User', // This links it to our User model
        required: true
    },
    documentId: {
        type: String,
        default: null
    },
    // Store the feedback we got from the AI
    atsAssessment: {
        estimatedScore: String,
        explanation: String
    },
    strengths: [String],
    areasForImprovement: [String],
    actionVerbSuggestions: String,
    quantificationSuggestions: String
}, {
    timestamps: true // Adds createdAt and updatedAt
});

const ResumeReview = mongoose.model('ResumeReview', reviewSchema);
export default ResumeReview;