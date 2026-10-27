import dns from "node:dns";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { configureMongoDns } from "../utils/dnsConfig.js";

dns.setDefaultResultOrder("ipv4first");
configureMongoDns(process.env.MONGODB_DNS_SERVERS || "8.8.8.8, 1.1.1.1");

console.log("=== DIAGNOSTIC REPORT: NETWORK & SERVICES ===");
console.log("Node version:", process.version);
console.log("DNS Servers:", dns.getServers());

// Test 1: MongoDB
async function testMongo() {
  console.log("\n--- Testing MongoDB Atlas Connection ---");
  const start = Date.now();
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.log("DATABASE_URL is not set!");
      return;
    }
    const hostMatch = dbUrl.match(/@([^/?]+)/);
    console.log("MongoDB Host Target:", hostMatch ? hostMatch[1] : "unknown");

    await mongoose.connect(dbUrl, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB Connected in ${Date.now() - start}ms! readyState:`, mongoose.connection.readyState);
    
    const queryStart = Date.now();
    const count = await mongoose.connection.db.collection("dsasubmissions").countDocuments();
    console.log(`dsasubmissions count query completed in ${Date.now() - queryStart}ms. Total documents:`, count);
    await mongoose.disconnect();
  } catch (err) {
    console.error(`MongoDB failed after ${Date.now() - start}ms:`, err.message);
  }
}

// Test 2: Gemini API
async function testGemini() {
  console.log("\n--- Testing Gemini API ---");
  const start = Date.now();
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });
    const res = await model.generateContent("Reply with 'OK'");
    console.log(`Gemini responded in ${Date.now() - start}ms:`, res.response.text().trim());
  } catch (err) {
    console.error(`Gemini failed after ${Date.now() - start}ms:`, err.message);
  }
}

// Test 3: Clerk API
async function testClerk() {
  console.log("\n--- Testing Clerk API ---");
  const start = Date.now();
  try {
    const { clerkClient } = await import("@clerk/express");
    const users = await clerkClient.users.getUserList({ limit: 1 });
    console.log(`Clerk API responded in ${Date.now() - start}ms. User count:`, users.data?.length ?? 0);
  } catch (err) {
    console.error(`Clerk failed after ${Date.now() - start}ms:`, err.message);
  }
}

// Test 4: Online Compiler API
async function testCompiler() {
  console.log("\n--- Testing Online Compiler API ---");
  const start = Date.now();
  try {
    const apiKey = process.env.ONLINECOMPILER_API_KEY;
    if (!apiKey) {
      console.log("ONLINECOMPILER_API_KEY not set.");
      return;
    }
    const res = await fetch("https://api.onlinecompiler.io/api/v1/compile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        language: "javascript",
        code: "console.log('test');",
      }),
    });
    console.log(`Online Compiler responded in ${Date.now() - start}ms. Status:`, res.status);
  } catch (err) {
    console.error(`Online Compiler failed after ${Date.now() - start}ms:`, err.message);
  }
}

async function run() {
  await testMongo();
  await testGemini();
  await testClerk();
  await testCompiler();
  process.exit(0);
}
run();
