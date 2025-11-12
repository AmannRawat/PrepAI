const mongoose = require('mongoose');
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
        required: true
    },
    messages: [messageSchema] // An array of messages
}, {
    timestamps: true
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
module.exports = ChatSession;