const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// This is the blueprint for our User data
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
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"]
    }
}, {
    // Adds 'createdAt' and 'updatedAt' timestamps automatically
    timestamps: true 
});

//  Password Hashing Middleware
// This function runs automatically *before* a new user is saved
userSchema.pre('save', async function(next) {
    // 'this' refers to the user document about to be saved
    
    // We only hash the password if it's new or has been modified
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Generate a "salt" (a random string to make the hash secure)
        const salt = await bcrypt.genSalt(10);
        // Hash the password with the salt and update the user's password field
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// This creates the 'User' model (which will use the 'users' collection in MongoDB)
const User = mongoose.model('User', userSchema);

module.exports = User;