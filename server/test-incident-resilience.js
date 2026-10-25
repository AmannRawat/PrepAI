import "dotenv/config";
import assert from "node:assert/strict";

process.env.TEST_CASE_ENCRYPTION_KEY =
  process.env.TEST_CASE_ENCRYPTION_KEY ||
  "a3cb0491397f7a3495da4a4eb75beea86e668ca3124c9218d78548abbcc019b6";
process.env.CLERK_SECRET_KEY =
  process.env.CLERK_SECRET_KEY || "sk_test_mock_clerk_secret_key";

import mongoose from "mongoose";
import {
  withBoundedTimeout,
  coachChat,
  createDsaProblem,
} from "./controllers/dsa.controller.js";
import {
  generateText,
  setCustomTextGenerator,
} from "./services/gemini.service.js";
import authMiddleware from "./middleware/auth.middleware.js";
import User from "./models/User.model.js";
import StudyPlan from "./models/StudyPlan.model.js";
import DsaSubmission from "./models/DsaSubmission.model.js";
import { clerkClient } from "@clerk/express";

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runAllIncidentTests() {
  console.log("=================================================");
  console.log("  INCIDENT RESILIENCE & FAILURE PATH REGRESSION  ");
  console.log("=================================================\n");

  // -------------------------------------------------------------------------
  // Suite 1: withBoundedTimeout Helper Contract
  // -------------------------------------------------------------------------
  console.log("--- Suite 1: withBoundedTimeout Helper Contract ---");

  await runTest("withBoundedTimeout resolves promptly when operation succeeds before timeout", async () => {
    const fastPromise = new Promise((resolve) => setTimeout(() => resolve("fast_result"), 50));
    const result = await withBoundedTimeout(fastPromise, 300, "fastOp");
    assert.equal(result, "fast_result");
  });

  await runTest("withBoundedTimeout rejects with TimeoutError when operation exceeds deadline", async () => {
    const hangingPromise = new Promise((resolve) => setTimeout(() => resolve("late_result"), 1000));
    const startTime = Date.now();
    await assert.rejects(
      async () => {
        await withBoundedTimeout(hangingPromise, 100, "hangingOp");
      },
      (err) => {
        assert.equal(err.name, "TimeoutError");
        assert.match(err.message, /hangingOp timed out after 100ms/);
        return true;
      }
    );
    const duration = Date.now() - startTime;
    assert.ok(duration >= 90 && duration < 350, `Expected ~100ms timeout, took ${duration}ms`);
  });

  await runTest("withBoundedTimeout propagates non-timeout operation rejection immediately", async () => {
    const failingPromise = Promise.reject(new Error("Database connection lost"));
    await assert.rejects(
      async () => {
        await withBoundedTimeout(failingPromise, 500, "failingOp");
      },
      (err) => {
        assert.equal(err.message, "Database connection lost");
        assert.notEqual(err.name, "TimeoutError");
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // Suite 2: Gemini Service Bounded Retry on Transient Network Errors
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 2: Gemini Service Bounded Retry Contract ---");

  await runTest("generateText retries on transient 'fetch failed' network error and succeeds on attempt 2", async () => {
    let callCount = 0;
    setCustomTextGenerator(async () => {
      callCount++;
      if (callCount === 1) {
        const fetchErr = new TypeError("fetch failed");
        throw fetchErr;
      }
      return "Generated response after retry";
    });

    const result = await generateText("Test prompt");
    assert.equal(callCount, 2, "Expected exactly 2 attempts");
    assert.equal(result, "Generated response after retry");
    setCustomTextGenerator(null);
  });

  await runTest("generateText exhausts bounded retries (max 2) and propagates transient error without infinite looping", async () => {
    let callCount = 0;
    setCustomTextGenerator(async () => {
      callCount++;
      const fetchErr = new TypeError("fetch failed");
      throw fetchErr;
    });

    await assert.rejects(
      async () => {
        await generateText("Test prompt");
      },
      (err) => {
        assert.equal(err.name, "TypeError");
        assert.match(err.message, /fetch failed/);
        return true;
      }
    );
    assert.equal(callCount, 2, "Expected exactly 2 attempts before rethrowing");
    setCustomTextGenerator(null);
  });

  await runTest("generateText does NOT retry non-retryable errors (e.g. 400 Bad Request, 401 Invalid Key)", async () => {
    let callCount = 0;
    setCustomTextGenerator(async () => {
      callCount++;
      const badReqErr = new Error("Invalid API key provided");
      badReqErr.status = 401;
      throw badReqErr;
    });

    await assert.rejects(
      async () => {
        await generateText("Test prompt");
      },
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
    assert.equal(callCount, 1, "Must rethrow immediately on attempt 1 for non-retryable error");
    setCustomTextGenerator(null);
  });

function mockClerkAuth(claims) {
  const brand = Symbol.for("@clerk/express.auth");
  const authFn = () => ({
    tokenType: "session_token",
    isAuthenticated: Boolean(claims.userId),
    ...claims,
  });
  authFn[brand] = true;
  return authFn;
}

  // -------------------------------------------------------------------------
  // Suite 3: Clerk Auth Middleware Resiliency & Security Checks
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 3: Clerk Auth Middleware Resiliency & Security Checks ---");

  await runTest("authMiddleware rejects unauthenticated requests with HTTP 401 without querying DB or Clerk", async () => {
    const req = {
      // Unauthenticated Clerk session populated by clerkMiddleware
      auth: mockClerkAuth({ isAuthenticated: false, userId: null }),
    };
    const res = createMockRes();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, "next() must not be called");
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /Authentication required/i);
  });

  await runTest("authMiddleware fails closed with HTTP 500 when clerkMiddleware was omitted", async () => {
    const req = {};
    const res = createMockRes();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.message, /Unable to authenticate the request/i);
  });

  await runTest("authMiddleware uses fast-path for verified user existing in MongoDB without calling clerkClient API", async () => {
    const verifiedUserId = "user_clerk_fast_path_123";
    const req = {
      auth: mockClerkAuth({
        isAuthenticated: true,
        userId: verifiedUserId,
        sessionId: "sess_123",
      }),
    };
    const res = createMockRes();
    let nextCalled = false;

    // Spy on User.findOne
    const origFindOne = User.findOne;
    let clerkClientCalled = false;
    const origGetUser = clerkClient.users.getUser;
    clerkClient.users.getUser = async () => {
      clerkClientCalled = true;
      throw new Error("clerkClient.users.getUser should not have been called for existing user!");
    };

    User.findOne = function (query) {
      return {
        maxTimeMS: () => ({
          _id: new mongoose.Types.ObjectId("64b8f0f0f0f0f0f0f0f0f0f1"),
          clerkUserId: verifiedUserId,
          email: "fastpath@example.com",
          name: "Fast Path User",
        }),
      };
    };

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true, "next() must be called");
      assert.equal(clerkClientCalled, false, "clerkClient API should NOT be invoked for existing user");
      assert.equal(req.user.id, "64b8f0f0f0f0f0f0f0f0f0f1");
      assert.equal(req.user.email, "fastpath@example.com");
      assert.equal(req.user.clerkUserId, verifiedUserId);
    } finally {
      User.findOne = origFindOne;
      clerkClient.users.getUser = origGetUser;
    }
  });

  await runTest("authMiddleware returns HTTP 503 when Clerk API experiences transient network failure during onboarding", async () => {
    const newUserId = "user_clerk_new_onboarding_456";
    const req = {
      auth: mockClerkAuth({
        isAuthenticated: true,
        userId: newUserId,
        sessionId: "sess_456",
      }),
    };
    const res = createMockRes();
    let nextCalled = false;

    const origFindOne = User.findOne;
    const origGetUser = clerkClient.users.getUser;

    // Simulate user not in DB yet
    User.findOne = function () {
      return {
        maxTimeMS: () => null,
      };
    };

    // Simulate Clerk API network drop
    clerkClient.users.getUser = async () => {
      const netErr = new TypeError("fetch failed");
      throw netErr;
    };

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 503, "Should return HTTP 503 on upstream network failure");
      assert.match(res.body.message, /temporarily unavailable/i);
    } finally {
      User.findOne = origFindOne;
      clerkClient.users.getUser = origGetUser;
    }
  });

  await runTest("authMiddleware rejects new user registration with unverified email with HTTP 403", async () => {
    const unverifiedUserId = "user_clerk_unverified_789";
    const req = {
      auth: mockClerkAuth({
        isAuthenticated: true,
        userId: unverifiedUserId,
        sessionId: "sess_789",
      }),
    };
    const res = createMockRes();
    let nextCalled = false;

    const origFindOne = User.findOne;
    const origGetUser = clerkClient.users.getUser;

    User.findOne = function () {
      return {
        maxTimeMS: () => null,
      };
    };

    clerkClient.users.getUser = async () => ({
      id: unverifiedUserId,
      primaryEmailAddressId: "email_unverified_id",
      emailAddresses: [
        {
          id: "email_unverified_id",
          emailAddress: "unverified@example.com",
          verification: { status: "unverified" },
        },
      ],
    });

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.message, /verified primary email address is required/i);
    } finally {
      User.findOne = origFindOne;
      clerkClient.users.getUser = origGetUser;
    }
  });

  // -------------------------------------------------------------------------
  // Suite 4: coachChat Resiliency Against MongoDB Query Hangs & Downstream Fallbacks
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 4: coachChat Resiliency Against MongoDB & Upstream Outages ---");

  await runTest("coachChat proceeds gracefully and does not hang when DsaSubmission.find times out", async () => {
    setCustomTextGenerator(async () => {
      return "Hello! I am Pepe. How can I help you today?";
    });

    const origFind = DsaSubmission.find;
    // Simulate DsaSubmission.find hanging forever
    DsaSubmission.find = function () {
      return {
        maxTimeMS: () => new Promise(() => {}), // Never resolves
      };
    };

    const req = {
      user: { id: "64b8f0f0f0f0f0f0f0f0f0f1" },
      body: {
        message: "Hello Pepe",
        action: "chat",
      },
    };
    const res = createMockRes();

    const origReadyState = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });

    try {
      await coachChat(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.answer.includes("Pepe"));
      // Verified that adaptive assessment maintained standard without fabricating data
      assert.equal(res.body.adaptiveAssessment.targetDifficulty, "Medium");
      assert.equal(res.body.adaptiveAssessment.action, "maintain");
      assert.match(
        res.body.adaptiveAssessment.reason,
        /(?:Practicing at standard difficulty|Starting with a balanced Medium problem)/
      );
    } finally {
      DsaSubmission.find = origFind;
      Object.defineProperty(mongoose.connection, "readyState", { value: origReadyState, configurable: true });
      setCustomTextGenerator(null);
    }
  });

  await runTest("coachChat returns HTTP 503 instead of 500 when Gemini upstream is unavailable", async () => {
    setCustomTextGenerator(async () => {
      const netErr = new TypeError("fetch failed");
      throw netErr;
    });

    const req = {
      user: { id: "64b8f0f0f0f0f0f0f0f0f0f1" },
      body: {
        message: "Hello Pepe",
        action: "chat",
      },
    };
    const res = createMockRes();

    await coachChat(req, res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /temporarily unavailable/i);
    setCustomTextGenerator(null);
  });

  // -------------------------------------------------------------------------
  // Suite 5: Problem Deduplication & Adaptive Difficulty Invariants Preserved
  // -------------------------------------------------------------------------
  console.log("\n--- Suite 5: Invariants Verification (Deduplication & Validation) ---");

  await runTest("createDsaProblem deduplication exclusion directive is strictly honored", async () => {
    let receivedPrompt = "";
    setCustomTextGenerator(async (prompt) => {
      receivedPrompt = prompt;
      return JSON.stringify({
        title: "Unique New Problem",
        description: "Problem statement",
        examples: [
          { input: "1", output: "1", explanation: "e1" },
          { input: "2", output: "2", explanation: "e2" },
        ],
        constraints: ["1 <= n <= 100"],
        boilerplates: {
          javascript: "function solve(n) { return n; }",
          python: "def solve(n): return n",
          java: "class Solution { public int solve(int n) { return n; } }",
          cpp: "class Solution { public: int solve(int n) { return n; } };",
        },
        referenceSolution: {
          language: "javascript",
          code: "function solve(n) { return n; }",
          timeComplexity: "O(1)",
          spaceComplexity: "O(1)",
        },
        testCases: [
          { input: { n: 1 }, expectedOutput: 1, isHidden: false },
          { input: { n: 2 }, expectedOutput: 2, isHidden: false },
          { input: { n: 3 }, expectedOutput: 3, isHidden: true },
          { input: { n: 4 }, expectedOutput: 4, isHidden: true },
        ],
      });
    });

    const origFetch = global.fetch;
    const origKey = process.env.ONLINECOMPILER_API_KEY;
    process.env.ONLINECOMPILER_API_KEY = "mock_compiler_key";
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "success",
        exit_code: 0,
        output: `__PREPAI_START__${JSON.stringify([
          { actual: 1 },
          { actual: 2 },
          { actual: 3 },
          { actual: 4 },
        ])}__PREPAI_END__`,
      }),
    });

    try {
      const result = await createDsaProblem({
        topic: "Arrays",
        difficulty: "Medium",
        excludeTitle: "Peak Segment Balance",
      });

      assert.equal(result.problem.title, "Unique New Problem");
      assert.match(receivedPrompt, /CRITICAL DEDUPLICATION REQUIREMENT/);
      assert.match(receivedPrompt, /Do NOT generate, reproduce, or title this problem "Peak Segment Balance"/);
    } finally {
      global.fetch = origFetch;
      process.env.ONLINECOMPILER_API_KEY = origKey;
      setCustomTextGenerator(null);
    }
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllIncidentTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
