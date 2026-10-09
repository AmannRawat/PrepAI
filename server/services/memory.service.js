import UserMemory from "../models/UserMemory.model.js";

export async function saveMemory({
    userId,
    category,
    content,
    source,
    confidence = 0.8,
}) {
    if (!content?.trim()) {
        return null;
    }

    const memory = await UserMemory.findOneAndUpdate(
        {
            user: userId,
            category,
            content,
        },
        {
            $set: {
                confidence,
                lastConfirmedAt: new Date(),
                source,
            },
        },
        {
            new: true,
            upsert: true,
        }
    );

    return memory;
}

export async function getUserMemories(
    userId,
    limit = 10
) {
    return UserMemory.find({
        user: userId,
    })
        .sort({ lastConfirmedAt: -1 })
        .limit(limit);
}

export async function getMemoryContext(userId) {
    const memories = await getUserMemories(userId, 10);

    return memories
        .map(
            (memory) =>
                `- [${memory.category}] ${memory.content}`
        )
        .join("\n");
}