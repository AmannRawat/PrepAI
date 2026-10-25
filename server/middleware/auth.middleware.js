import { clerkClient, getAuth } from "@clerk/express";
import User from "../models/User.model.js";

const authMiddleware = async (req, res, next) => {
    try {
        // Get the authenticated session information from Clerk.
        const { isAuthenticated, userId } = getAuth(req);

        // Reject requests without a valid authenticated Clerk session.
        if (!isAuthenticated || !userId) {
            return res.status(401).json({
                message: "Authentication required. Please sign in."
            });
        }

        // First, check if an existing application user is already linked to this verified Clerk identity.
        let user = await User.findOne({
            clerkUserId: userId
        }).maxTimeMS(3000);

        if (!user) {
            // New user registration / first login: retrieve profile from Clerk.
            let clerkUser;
            try {
                clerkUser = await clerkClient.users.getUser(userId);
            } catch (clerkErr) {
                console.error("Clerk API getUser failed:", clerkErr.message);
                const isNetworkError =
                    clerkErr.message?.includes("fetch failed") ||
                    clerkErr.name === "ClerkAPIResponseError" ||
                    clerkErr.status >= 500;
                return res.status(isNetworkError ? 503 : 500).json({
                    message: "Authentication service temporarily unavailable. Please try again."
                });
            }

            // Find the primary email address associated with this Clerk account.
            const primaryEmail = clerkUser.emailAddresses?.find(
                (email) => email.id === clerkUser.primaryEmailAddressId
            );

            // This application currently requires an email address in its MongoDB User model.
            // Only use a verified email address when linking an existing account.
            if (
                !primaryEmail ||
                primaryEmail.verification?.status !== "verified"
            ) {
                return res.status(403).json({
                    message: "A verified primary email address is required."
                });
            }

            const normalizedEmail = primaryEmail.emailAddress
                .trim()
                .toLowerCase();

            // Look for an existing MongoDB account with the same verified email address.
            user = await User.findOne({
                email: normalizedEmail
            }).maxTimeMS(3000);

            if (user) {
                // Never silently associate an account already linked to another
                // Clerk identity.
                if (
                    user.clerkUserId &&
                    user.clerkUserId !== userId
                ) {
                    return res.status(409).json({
                        message: "This email is already linked to another account."
                    });
                }

                // Preserve the existing MongoDB user and all its related data.
                // We only attach the Clerk identity to the existing record.
                user.clerkUserId = userId;

                if (!user.name && clerkUser.fullName) {
                    user.name = clerkUser.fullName;
                }

                await user.save();
            } else {
                // Create a MongoDB application user for a new Clerk account.
                // The password is intentionally omitted because Clerk manages it.
                user = await User.create({
                    clerkUserId: userId,
                    name:
                        clerkUser.fullName ||
                        clerkUser.firstName ||
                        "PrepAI User",
                    email: normalizedEmail
                });
            }
        }

        // Preserve the existing application contract:
        // protected controllers continue using req.user.id as the MongoDB _id.
        req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            clerkUserId: user.clerkUserId
        };

        // Authentication succeeded. Continue to the protected controller.
        next();
    } catch (error) {
        console.error("Clerk authentication error:", error);

        const isNetworkOrTimeout =
            error.status === 503 ||
            error.name === "TimeoutError" ||
            error.name === "MongooseError" ||
            error.name === "MongoNetworkError" ||
            error.name === "MongoServerSelectionError" ||
            Boolean(error.name && error.name.includes("Mongo")) ||
            /timed? out|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|closed|reset/i.test(error.message || "");

        res.status(isNetworkOrTimeout ? 503 : 500).json({
            message: isNetworkOrTimeout
                ? "Authentication service temporarily unavailable. Please try again."
                : "Unable to authenticate the request."
        });
    }
};

export default authMiddleware;