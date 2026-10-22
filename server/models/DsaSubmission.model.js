// backend/models/DsaSubmission.model.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const dsaSubmissionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // The problem the user was given
    problemId: {
        type: String,
        default: null,
        index: true,
    },
    problem: {
        id: String,
        title: String,
        description: String,
    },
    topic: {
        type: String,
        required: true,
        default: 'General'
    },
    // The user's code
    language: String,
    code: String,

    // Execution results
    verdict: {
        type: String,
        default: null,
    },
    passed: {
        type: Number,
        default: 0,
    },
    total: {
        type: Number,
        default: 0,
    },
    executionTime: {
        type: String,
        default: null,
    },
    
    // The AI's feedback
    feedback: {
        correctness: String,
        timeComplexity: String,
        spaceComplexity: String,
        optimization: String
    }
}, {
    timestamps: true 
});

const DsaSubmission = mongoose.model('DsaSubmission', dsaSubmissionSchema);
export default DsaSubmission;