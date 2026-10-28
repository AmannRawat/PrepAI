import dns from "node:dns";
import mongoose from "mongoose";
import { configureMongoDns } from "../utils/dnsConfig.js";

// Node 18+ defaults DNS resolution to 'verbatim' (preferring IPv6), which causes intermittent
// connection timeout hangs when resolving MongoDB Atlas SRV connection strings in certain hosting
// environments. Enforcing IPv4-first ensures deterministic, fast connection establishment.
dns.setDefaultResultOrder("ipv4first");

// Allows custom DNS resolvers (e.g. 8.8.8.8, 1.1.1.1) to be supplied via MONGODB_DNS_SERVERS
// when running in restricted cloud networks where local DNS fails SRV TXT record resolution.
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