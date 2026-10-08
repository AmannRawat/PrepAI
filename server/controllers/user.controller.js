import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import DsaSubmission from "../models/DsaSubmission.model.js";

export async function getUserProgress(req, res) {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);

        const resumeReviews = await ResumeReview.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5);

        const chatSessions = await ChatSession.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5);

        const dsaSubmissions = await DsaSubmission.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            resumeReviews,
            chatSessions,
            dsaSubmissions,
            currentStreak: user ? user.currentStreak : 0,
        });

    } catch (error) {
        console.error("Error fetching user progress:", error);

        res.status(500).json({
            message: "Server error fetching progress.",
        });
    }
}

export async function recordActivity(req, res) {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found.",
            });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let lastActivity = user.lastActivityDate;
        let streak = user.currentStreak || 0;

        if (lastActivity) {
            lastActivity = new Date(lastActivity);
            lastActivity.setHours(0, 0, 0, 0);

            const oneDay = 1000 * 60 * 60 * 24;
            const diff =
                today.getTime() - lastActivity.getTime();

            if (diff === 0) {
                if (streak === 0) {
                    streak = 1;
                }
            } else if (diff === oneDay) {
                streak++;
            } else {
                streak = 1;
            }
        } else {
            streak = 1;
        }

        user.currentStreak = streak;
        user.lastActivityDate = new Date();

        await user.save();

        res.status(200).json({
            currentStreak: user.currentStreak,
        });

    } catch (error) {
        console.error("Error recording activity:", error);

        res.status(500).json({
            message: "Server error recording activity.",
        });
    }
}