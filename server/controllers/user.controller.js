import mongoose from "mongoose";
import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import DsaSubmission from "../models/DsaSubmission.model.js";
import StudyPlan from "../models/StudyPlan.model.js";
import UserMemory from "../models/UserMemory.model.js";
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

/**
 * Helper to format a Date into 'YYYY-MM-DD' under a specific timezone.
 * Falls back to UTC ISO date string if timezone is invalid.
 */
function formatDateToTimezone(date, timeZone = 'UTC') {
    try {
        return new Date(date).toLocaleDateString('en-CA', { timeZone });
    } catch {
        return new Date(date).toISOString().split('T')[0];
    }
}

/**
 * Helper to compute consecutive streak and streak start date from a set of YYYY-MM-DD date strings.
 */
function calculateStreakFromDates(uniqueDateStrings, todayStr, yesterdayStr) {
    if (!uniqueDateStrings || uniqueDateStrings.length === 0) {
        return { currentStreak: 0, streakStartDate: null };
    }

    // Sort descending (latest dates first)
    const sorted = [...uniqueDateStrings].sort().reverse();
    const latestDate = sorted[0];

    // If the latest active date is neither today nor yesterday, the streak is broken
    if (latestDate !== todayStr && latestDate !== yesterdayStr) {
        return { currentStreak: 0, streakStartDate: null };
    }

    let streak = 1;
    let streakStartDate = latestDate;

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].split('-').map(Number);
        const curr = sorted[i].split('-').map(Number);

        const prevUtc = Date.UTC(prev[0], prev[1] - 1, prev[2]);
        const currUtc = Date.UTC(curr[0], curr[1] - 1, curr[2]);

        const diffDays = Math.round((prevUtc - currUtc) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            streak++;
            streakStartDate = sorted[i];
        } else {
            break;
        }
    }

    return { currentStreak: streak, streakStartDate };
}

/**
 * Retrieves per-user calendar activity history, monthly active dates,
 * current consecutive streak, and genuine milestones for today.
 */
export async function getCalendarActivity(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Authentication required. Please sign in.",
            });
        }

        const userId = req.user.id;
        const timeZone = req.query.timezone || 'UTC';

        const now = new Date();
        let targetYear = parseInt(req.query.year, 10);
        let targetMonth = parseInt(req.query.month, 10); // 1-12

        if (isNaN(targetYear)) targetYear = now.getFullYear();
        if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
            targetMonth = now.getMonth() + 1;
        }

        // Query authentic user activities scoped strictly to req.user.id
        const [dsaSubmissions, chatSessions, resumeReviews, userDoc] = await Promise.all([
            DsaSubmission.find({ user: userId })
                .select('createdAt problem topic verdict passed total executionTime')
                .sort({ createdAt: -1 })
                .lean(),
            ChatSession.find({ user: userId })
                .select('createdAt updatedAt targetRole targetCompany interviewType status messages')
                .sort({ createdAt: -1 })
                .lean(),
            ResumeReview.find({ user: userId })
                .select('createdAt jobTitle atsAssessment')
                .sort({ createdAt: -1 })
                .lean(),
            User.findById(userId).select('currentStreak lastActivityDate').lean(),
        ]);

        const todayStr = formatDateToTimezone(new Date(), timeZone);
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yesterdayStr = formatDateToTimezone(yesterday, timeZone);

        const uniqueDatesSet = new Set();
        const allEvents = [];

        // 1. Process DSA Submissions
        for (const sub of dsaSubmissions) {
            if (!sub.createdAt) continue;
            const dateStr = formatDateToTimezone(sub.createdAt, timeZone);
            uniqueDatesSet.add(dateStr);
            allEvents.push({
                type: 'dsa',
                title: sub.problem?.title || sub.topic || 'DSA Practice',
                status: sub.verdict === 'Accepted' ? 'Solved' : (sub.verdict || 'Attempted'),
                timestamp: sub.createdAt,
                dateStr,
            });
        }

        // 2. Process Behavioral Interview Chat Sessions
        for (const session of chatSessions) {
            const eventTime = session.updatedAt || session.createdAt;
            if (!eventTime) continue;
            const dateStr = formatDateToTimezone(eventTime, timeZone);
            uniqueDatesSet.add(dateStr);
            allEvents.push({
                type: 'interview',
                title: `${session.targetRole || 'Behavioral'} Interview (${session.interviewType || 'Mock'})`,
                status: session.status === 'completed' ? 'Completed' : 'In Progress',
                timestamp: eventTime,
                dateStr,
            });
        }

        // 3. Process Resume Reviews
        for (const review of resumeReviews) {
            if (!review.createdAt) continue;
            const dateStr = formatDateToTimezone(review.createdAt, timeZone);
            uniqueDatesSet.add(dateStr);
            allEvents.push({
                type: 'resume',
                title: `Resume Review${review.jobTitle ? ` - ${review.jobTitle}` : ''}`,
                status: 'Reviewed',
                timestamp: review.createdAt,
                dateStr,
            });
        }

        // 4. Incorporate user.lastActivityDate if present
        if (userDoc?.lastActivityDate) {
            const dateStr = formatDateToTimezone(userDoc.lastActivityDate, timeZone);
            uniqueDatesSet.add(dateStr);
        }

        // Compute consecutive streak across month and year boundaries
        const { currentStreak, streakStartDate } = calculateStreakFromDates(
            Array.from(uniqueDatesSet),
            todayStr,
            yesterdayStr
        );

        // Keep User.currentStreak in sync if it differs
        if (userDoc && userDoc.currentStreak !== currentStreak) {
            User.updateOne({ _id: userId }, { $set: { currentStreak } }).catch((err) => {
                console.error("Error updating user currentStreak:", err);
            });
        }

        // Filter active days strictly for requested year and month
        const targetPrefix = `${targetYear}-${String(targetMonth).padStart(2, '0')}-`;
        const activeDaysInMonth = [];
        const activeDatesInMonth = [];

        for (const d of uniqueDatesSet) {
            if (d.startsWith(targetPrefix)) {
                const dayNum = parseInt(d.split('-')[2], 10);
                activeDaysInMonth.push(dayNum);
                activeDatesInMonth.push(d);
            }
        }
        activeDaysInMonth.sort((a, b) => a - b);
        activeDatesInMonth.sort();

        // Today's real milestones: genuine events logged today
        const todayEvents = allEvents.filter((e) => e.dateStr === todayStr);
        todayEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const todayMilestones = todayEvents.slice(0, 10).map((e, idx) => ({
            id: `milestone-${e.type}-${idx}-${new Date(e.timestamp).getTime()}`,
            type: e.type,
            title: e.title,
            status: e.status,
            time: new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));

        res.status(200).json({
            year: targetYear,
            month: targetMonth,
            activeDays: activeDaysInMonth,
            activeDates: activeDatesInMonth,
            currentStreak,
            streakStartDate,
            todayMilestones,
            totalActiveDaysThisMonth: activeDaysInMonth.length,
            totalLifetimeActiveDays: uniqueDatesSet.size,
        });
    } catch (error) {
        console.error("Error fetching calendar activity:", error);
        res.status(500).json({
            message: "Server error fetching calendar activity.",
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

            const diffDays = Math.round(
                (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (diffDays === 0) {
                if (streak === 0) {
                    streak = 1;
                }
            } else if (diffDays === 1) {
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

function buildUserPreferenceQuery(user) {
    if (!user) return null;
    const id = user.id || user._id;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
        return { _id: id };
    }
    const clerkId = user.clerkUserId || user.clerkId || id;
    if (clerkId) {
        return { clerkUserId: clerkId };
    }
    return null;
}

/**
 * Retrieves the authenticated user's career & workspace preferences.
 */
export async function getUserPreferences(req, res) {
    try {
        if (!req.user || (!req.user.id && !req.user.clerkUserId)) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const query = buildUserPreferenceQuery(req.user);
        let queryExec = User.findOne(query);
        if (queryExec && typeof queryExec.select === 'function') {
            queryExec = queryExec.select('careerPreferences');
        }
        const user = await queryExec;

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        res.status(200).json({
            success: true,
            careerPreferences: user.careerPreferences || {},
        });
    } catch (error) {
        console.error("Error retrieving user preferences:", error);
        res.status(500).json({
            success: false,
            message: "Server error retrieving user preferences.",
        });
    }
}

/**
 * Updates the authenticated user's career & workspace preferences.
 */
export async function updateUserPreferences(req, res) {
    try {
        if (!req.user || (!req.user.id && !req.user.clerkUserId)) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const {
            targetRole,
            targetCompany,
            experienceLevel,
            yearsOfExperience,
            defaultLanguage,
            preferredVoice,
            preferredResumeId,
        } = req.body || {};

        const updateData = {};
        if (targetRole !== undefined) updateData["careerPreferences.targetRole"] = String(targetRole).trim();
        if (targetCompany !== undefined) updateData["careerPreferences.targetCompany"] = String(targetCompany).trim();
        if (experienceLevel !== undefined) updateData["careerPreferences.experienceLevel"] = String(experienceLevel).trim();
        if (yearsOfExperience !== undefined) {
            const parsed = Number(yearsOfExperience);
            updateData["careerPreferences.yearsOfExperience"] = isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 100);
        }
        if (defaultLanguage !== undefined) updateData["careerPreferences.defaultLanguage"] = String(defaultLanguage).trim().toLowerCase();
        if (preferredVoice !== undefined) updateData["careerPreferences.preferredVoice"] = String(preferredVoice).trim();
        if (preferredResumeId !== undefined) updateData["careerPreferences.preferredResumeId"] = String(preferredResumeId).trim();

        const query = buildUserPreferenceQuery(req.user);
        let updateExec = User.findOneAndUpdate(
            query,
            { $set: updateData },
            { new: true, runValidators: true }
        );
        if (updateExec && typeof updateExec.select === 'function') {
            updateExec = updateExec.select('careerPreferences');
        }
        const updatedUser = await updateExec;

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        res.status(200).json({
            success: true,
            careerPreferences: updatedUser.careerPreferences || {},
        });
    } catch (error) {
        console.error("Error updating user preferences:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating user preferences.",
        });
    }
}

/**
 * Retrieves personalization memories saved for the authenticated user.
 */
export async function getUserMemoriesController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const memories = await UserMemory.find({ user: req.user.id })
            .sort({ lastConfirmedAt: -1 });

        res.status(200).json({
            success: true,
            memories: memories || [],
        });
    } catch (error) {
        console.error("Error retrieving user memories:", error);
        res.status(500).json({
            success: false,
            message: "Server error retrieving memories.",
        });
    }
}

/**
 * Creates a user-provided personalization memory.
 */
export async function createUserMemoryController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const { category, content } = req.body || {};
        const allowedCategories = [
            "technical_weakness",
            "technical_strength",
            "interview_feedback",
            "preference",
            "experience",
            "goal",
        ];

        if (!category || !allowedCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: "Invalid or missing memory category.",
            });
        }

        const trimmedContent = String(content || "").trim();
        if (!trimmedContent) {
            return res.status(400).json({
                success: false,
                message: "Memory content cannot be empty.",
            });
        }

        const memory = await UserMemory.create({
            user: req.user.id,
            category,
            content: trimmedContent.slice(0, 1000),
            source: "manual",
            confidence: 1.0,
            lastConfirmedAt: new Date(),
        });

        res.status(201).json({
            success: true,
            memory,
        });
    } catch (error) {
        console.error("Error creating user memory:", error);
        res.status(500).json({
            success: false,
            message: "Server error creating memory.",
        });
    }
}

/**
 * Updates an existing personalization memory owned by the authenticated user.
 */
export async function updateUserMemoryController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const { id } = req.params;
        const { content, category } = req.body || {};

        const updateData = { lastConfirmedAt: new Date() };
        if (content !== undefined) {
            const trimmed = String(content).trim();
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    message: "Memory content cannot be empty.",
                });
            }
            updateData.content = trimmed.slice(0, 1000);
        }

        const allowedCategories = [
            "technical_weakness",
            "technical_strength",
            "interview_feedback",
            "preference",
            "experience",
            "goal",
        ];
        if (category !== undefined) {
            if (!allowedCategories.includes(category)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid memory category.",
                });
            }
            updateData.category = category;
        }

        const updated = await UserMemory.findOneAndUpdate(
            { _id: id, user: req.user.id },
            { $set: updateData },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Memory not found or not owned by authenticated user.",
            });
        }

        res.status(200).json({
            success: true,
            memory: updated,
        });
    } catch (error) {
        console.error("Error updating user memory:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating memory.",
        });
    }
}

/**
 * Deletes a personalization memory owned by the authenticated user.
 */
export async function deleteUserMemoryController(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please sign in.",
            });
        }

        const { id } = req.params;
        const deleted = await UserMemory.findOneAndDelete({
            _id: id,
            user: req.user.id,
        });

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Memory not found or not owned by authenticated user.",
            });
        }

        res.status(200).json({
            success: true,
            message: "Memory deleted successfully.",
        });
    } catch (error) {
        console.error("Error deleting user memory:", error);
        res.status(500).json({
            success: false,
            message: "Server error deleting memory.",
        });
    }
}