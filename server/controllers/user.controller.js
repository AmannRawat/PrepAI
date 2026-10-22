import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import DsaSubmission from "../models/DsaSubmission.model.js";
import StudyPlan from "../models/StudyPlan.model.js";
import { calculateDsaStats } from "../services/analytics.service.js";

/**
 * Returns dashboard user progress with recent submissions and high-level stats.
 */
export async function getUserProgress(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;

        const user = await User.findById(userId);

        const resumeReviews = await ResumeReview.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5);

        const chatSessions = await ChatSession.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5);

        // Fetch user's submissions (retrieving up to 25 for dashboard display)
        const dsaSubmissions = await DsaSubmission.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(25);

        // Fetch all submissions for accurate aggregate analytics
        const allUserSubmissions = await DsaSubmission.find({ user: userId });
        const dsaStats = calculateDsaStats(allUserSubmissions);

        res.status(200).json({
            resumeReviews,
            chatSessions,
            dsaSubmissions,
            dsaStats,
            currentStreak: user ? user.currentStreak : 0,
        });

    } catch (error) {
        console.error("Error fetching user progress:", error);

        res.status(500).json({
            message: "Server error fetching progress.",
        });
    }
}

/**
 * Returns comprehensive DSA submission analytics and breakdown.
 */
export async function getDsaStats(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;

        const user = await User.findById(userId);

        // Fetch full submission history to compute complete analytics
        const submissions = await DsaSubmission.find({ user: userId })
            .sort({ createdAt: -1 });

        const stats = calculateDsaStats(submissions);

        // Include recent 25 submissions with authoritative verdicts
        const recentSubmissions = submissions.slice(0, 25).map((s) => ({
            _id: s._id,
            problemId: s.problemId || s.problem?.id || null,
            problem: s.problem,
            topic: s.topic,
            language: s.language,
            verdict: s.verdict,
            passed: s.passed,
            total: s.total,
            executionTime: s.executionTime,
            feedback: s.feedback,
            createdAt: s.createdAt,
        }));

        res.status(200).json({
            ...stats,
            currentStreak: user ? user.currentStreak : 0,
            recentSubmissions,
        });
    } catch (error) {
        console.error("Error fetching DSA stats:", error);
        res.status(500).json({
            message: "Server error fetching DSA statistics.",
        });
    }
}

/**
 * Retrieves the user's persisted study plan and onboarding profile.
 */
export async function getStudyPlan(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;

        const studyPlanDoc = await StudyPlan.findOne({ user: userId });

        if (!studyPlanDoc) {
            return res.status(200).json({
                hasPlan: false,
                onboardingProfile: null,
                plan: null,
            });
        }

        res.status(200).json({
            hasPlan: Boolean(studyPlanDoc.plan && studyPlanDoc.plan.schedule?.length),
            onboardingProfile: studyPlanDoc.onboardingProfile || null,
            plan: studyPlanDoc.plan || null,
            updatedAt: studyPlanDoc.updatedAt,
        });
    } catch (error) {
        console.error("Error retrieving study plan:", error);
        res.status(500).json({
            message: "Server error fetching study plan.",
        });
    }
}

/**
 * Saves or updates the user's study plan and onboarding profile.
 */
export async function saveStudyPlan(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;
        const { onboardingProfile, plan } = req.body;

        const updateData = {};
        if (onboardingProfile && typeof onboardingProfile === "object") {
            updateData.onboardingProfile = onboardingProfile;
        }
        if (plan && typeof plan === "object") {
            updateData.plan = plan;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                message: "No valid onboardingProfile or plan data provided.",
            });
        }

        const updatedDoc = await StudyPlan.findOneAndUpdate(
            { user: userId },
            { $set: updateData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({
            success: true,
            hasPlan: Boolean(updatedDoc.plan && updatedDoc.plan.schedule?.length),
            onboardingProfile: updatedDoc.onboardingProfile || null,
            plan: updatedDoc.plan || null,
            updatedAt: updatedDoc.updatedAt,
        });
    } catch (error) {
        console.error("Error saving study plan:", error);
        res.status(500).json({
            message: "Server error saving study plan.",
        });
    }
}

export async function recordActivity(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

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