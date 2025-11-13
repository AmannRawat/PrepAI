// backend/models/DsaSubmission.model.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const dsaSubmissionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // The problem the user was given
    problem: {
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
module.exports = DsaSubmission;