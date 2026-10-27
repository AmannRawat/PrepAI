import dns from "node:dns";
import mongoose from "mongoose";
import { configureMongoDns } from "../utils/dnsConfig.js";

dns.setDefaultResultOrder("ipv4first");
configureMongoDns();

export async function connectDB() {
    try {
        await mongoose.connect(process.env.DATABASE_URL);

        console.log("Successfully connected to MongoDB Atlas!");
    } catch (error) {
        console.error("Error connecting to MongoDB Atlas:", error);
        process.exit(1);
    }
}