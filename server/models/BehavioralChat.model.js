import mongoose from "mongoose";
const { Schema } = mongoose;

// This schema defines a single message
const messageSchema = new Schema({
    sender: {
        type: String, // 'ai' or 'user'
        required: true
    },
    text: {
        type: String,
        required: true
    }
});

// This schema defines the full chat session
const chatSessionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sessionId: {
        type: String,
        sparse: true,
        index: true
    },
    targetRole: {
        type: String,
        default: null
    },
    targetCompany: {
        type: String,
        default: null
    },
    experienceLevel: {
        type: String,
        default: "fresher"
    },
    yearsOfExperience: {
        type: String,
        default: null
    },
    focusAreas: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ["active", "completed"],
        default: "active"
    },
    interviewType: {
        type: String,
        default: "Behavioral"
    },
    difficulty: {
        type: String,
        default: "Medium"
    },
    startingDifficulty: {
        type: String,
        default: "Medium"
    },
    adaptiveDifficulty: {
        type: String,
        default: "Medium"
    },
    stagePlan: {
        type: [String],
        default: []
    },
    currentStageIndex: {
        type: Number,
        default: 0
    },
    finalReport: {
        type: String,
        default: null
    },
    messages: [messageSchema] // An array of messages
}, {
    timestamps: true
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
export { ChatSession };
export default ChatSession;