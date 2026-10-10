import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// This is the blueprint/schema for our User data
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true, // No two users can have the same email
        lowercase: true, // Store email in lowercase
        trim: true // Remove any extra whitespace
    },
    clerkUserId: {
        type: String,
        unique: true,
        sparse: true
        // Links the MongoDB user to their Clerk identity.
        // Existing users can keep this field unset until they sign in through Clerk.
    },
    password: {
        type: String,
        // Password is optional because Clerk manages authentication.
        // Existing users with passwords can continue using their stored password hashes.
        minlength: [6, "Password must be at least 6 characters long"]
    },
    currentStreak: {
        type: Number,
        default: 10 // Start all users at 0
    },
    lastActivityDate: {
        type: Date
    },
    resumeDocumentId: {
        type: String,
        default: null
    }
}, {
    // Adds 'createdAt' and 'updatedAt' timestamps automatically
    timestamps: true
});

// Password Hashing Middleware
// This function runs automatically before a user is saved.
userSchema.pre('save', async function (next) {
    // 'this' refers to the user document about to be saved.

    // Clerk-managed users don't need a local password.
    // Existing passwords are hashed only when newly added or modified.
    if (!this.password || !this.isModified('password')) {
        return next();
    }

    try {
        // Generate a salt (a random string to make the hash secure).
        const salt = await bcrypt.genSalt(10);

        // Hash the password with the salt and update the user's password field.
        this.password = await bcrypt.hash(this.password, salt);

        next();
    } catch (error) {
        next(error);
    }
});

// This creates the 'User' model (which will use the 'users' collection in MongoDB).
const User = mongoose.model('User', userSchema);

export default User;