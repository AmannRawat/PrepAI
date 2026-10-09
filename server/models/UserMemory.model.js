import mongoose from "mongoose";

const userMemorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        category: {
            type: String,
            enum: [
                "technical_weakness",
                "technical_strength",
                "interview_feedback",
                "preference",
                "experience",
                "goal",
            ],
            required: true,
        },

        content: {
            type: String,
            required: true,
            trim: true,
        },

        source: {
            type: String,
            enum: [
                "interview",
                "resume",
                "dsa",
                "manual",
            ],
            required: true,
        },

        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.8,
        },

        lastConfirmedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

const UserMemory = mongoose.model(
    "UserMemory",
    userMemorySchema
);

export default UserMemory;