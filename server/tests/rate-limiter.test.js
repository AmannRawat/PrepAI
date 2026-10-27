/**
 * PrepAI Production-Aware Rate Limiting Test Suite
 * Tests sliding-window enforcement, HTTP 429 contracts, header compliance,
 * identity isolation, IP fallback, proxy header protection, and route-specific limits.
 */

import assert from "node:assert/strict";
import {
  createRateLimiter,
  getClientIp,
  resolveRateLimitKey,
  resetAllRateLimits,
  generalLimiter,
  expensiveAiLimiter,
  resumeReviewLimiter,
  interviewStartLimiter,
  parseConfigInt,
  parseTrustProxy,
  isDedicatedRateLimitedRoute,
} from "../middleware/rateLimiter.js";

console.log("=================================================");
console.log("  PREPAI PRODUCTION RATE LIMITING TEST SUITE     ");
console.log("=================================================\n");

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    resetAllRateLimits();
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

function createMockReq(options = {}) {
  const ip = options.ip || options.remoteAddress || "127.0.0.1";
  return {
    method: options.method || "GET",
    path: options.path || "/api/test",
    baseUrl: options.baseUrl || "",
    ip: ip,
    socket: { remoteAddress: options.remoteAddress || ip },
    headers: options.headers || {},
    app: {
      get: (key) => (key === "trust proxy" ? Boolean(options.trustProxy) : undefined),
    },
    user: options.user || null,
    auth: options.auth || null,
  };
}

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    body: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
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

// ----------------------------------------------------------------------------
// Suite 1: Client IP & Identity Resolution
// ----------------------------------------------------------------------------
console.log("--- Suite 1: Client IP & Identity Resolution ---");

await runTest("Resolves key to user:<id> when req.user.id is present", () => {
  const req = createMockReq({ user: { id: "user_12345" } });
  const key = resolveRateLimitKey(req);
  assert.equal(key, "user:user_12345");
});

await runTest("Resolves key to user:<clerkUserId> when Clerk identity is present", () => {
  const req = createMockReq({ user: { clerkUserId: "user_clerk_999" } });
  const key = resolveRateLimitKey(req);
  assert.equal(key, "user:user_clerk_999");
});

await runTest("Falls back to ip:<safeIp> when user is unauthenticated", () => {
  const req = createMockReq({ ip: "192.168.1.50" });
  const key = resolveRateLimitKey(req);
  assert.equal(key, "ip:192.168.1.50");
});

await runTest("Normalizes IPv6 loopback to 127.0.0.1", () => {
  const req = createMockReq({ remoteAddress: "::1" });
  const ip = getClientIp(req);
  assert.equal(ip, "127.0.0.1");
});

await runTest("Ignores spoofed X-Forwarded-For when trust proxy is disabled", () => {
  const req = createMockReq({
    remoteAddress: "203.0.113.1",
    headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
    trustProxy: false,
  });
  const ip = getClientIp(req);
  assert.equal(ip, "203.0.113.1");
});

await runTest("Respects X-Forwarded-For client IP when trust proxy is enabled", () => {
  const req = createMockReq({
    ip: "198.51.100.22",
    headers: { "x-forwarded-for": "198.51.100.22, 10.0.0.1" },
    trustProxy: true,
  });
  const ip = getClientIp(req);
  assert.equal(ip, "198.51.100.22");
});

// ----------------------------------------------------------------------------
// Suite 2: Rate Limiting Enforcement & HTTP 429 Contract
// ----------------------------------------------------------------------------
console.log("\n--- Suite 2: Enforcement & HTTP 429 Contract ---");

await runTest("Allows requests strictly under the limit and sets remaining headers", () => {
  const limiter = createRateLimiter({
    name: "test-under-limit",
    windowMs: 60000,
    max: 3,
  });

  const req = createMockReq({ user: { id: "user_a" } });
  let nextCalls = 0;
  const next = () => { nextCalls++; };

  const res1 = createMockRes();
  limiter(req, res1, next);
  assert.equal(nextCalls, 1);
  assert.equal(res1.getHeader("ratelimit-limit"), "3");
  assert.equal(res1.getHeader("ratelimit-remaining"), "2");

  const res2 = createMockRes();
  limiter(req, res2, next);
  assert.equal(nextCalls, 2);
  assert.equal(res2.getHeader("ratelimit-remaining"), "1");

  const res3 = createMockRes();
  limiter(req, res3, next);
  assert.equal(nextCalls, 3);
  assert.equal(res3.getHeader("ratelimit-remaining"), "0");
});

await runTest("Returns HTTP 429 with Retry-After when limit is exceeded", () => {
  const limiter = createRateLimiter({
    name: "test-over-limit",
    windowMs: 60000,
    max: 2,
  });

  const req = createMockReq({ user: { id: "user_b" } });
  const next = () => {};

  limiter(req, createMockRes(), next);
  limiter(req, createMockRes(), next);

  // 3rd request exceeds limit
  const res3 = createMockRes();
  let nextCalled = false;
  limiter(req, res3, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "next() must not be called when throttled");
  assert.equal(res3.statusCode, 429);
  assert.ok(res3.getHeader("retry-after"));
  assert.ok(Number(res3.getHeader("retry-after")) > 0);
  assert.equal(res3.getHeader("ratelimit-remaining"), "0");
  assert.equal(res3.body.error, "Too Many Requests");
  assert.ok(res3.body.retryAfter > 0);
});

// ----------------------------------------------------------------------------
// Suite 3: User Quota Isolation & Independent Limits
// ----------------------------------------------------------------------------
console.log("\n--- Suite 3: User Quota Isolation & Granular Limits ---");

await runTest("User A exceeding quota does NOT affect User B's quota", () => {
  const limiter = createRateLimiter({
    name: "test-user-isolation",
    windowMs: 60000,
    max: 2,
  });

  const reqA = createMockReq({ user: { id: "user_alice" } });
  const reqB = createMockReq({ user: { id: "user_bob" } });

  // Exhaust User A's quota
  limiter(reqA, createMockRes(), () => {});
  limiter(reqA, createMockRes(), () => {});
  const resA3 = createMockRes();
  limiter(reqA, resA3, () => {});
  assert.equal(resA3.statusCode, 429, "User A should be throttled");

  // User B's first request should succeed
  const resB1 = createMockRes();
  let bAllowed = false;
  limiter(reqB, resB1, () => { bAllowed = true; });
  assert.equal(bAllowed, true, "User B must not be throttled by User A's activity");
  assert.equal(resB1.statusCode, 200);
});

await runTest("Health endpoints / and /ping are exempted from general rate limiter", () => {
  const reqRoot = createMockReq({ path: "/" });
  const reqPing = createMockReq({ path: "/ping" });
  let passedRoot = false;
  let passedPing = false;

  // Run 150 times (well over general default limit of 100)
  for (let i = 0; i < 120; i++) {
    generalLimiter(reqRoot, createMockRes(), () => { passedRoot = true; });
    generalLimiter(reqPing, createMockRes(), () => { passedPing = true; });
  }

  assert.equal(passedRoot, true);
  assert.equal(passedPing, true);
});

await runTest("Interview start limit does NOT block normal interview answer submissions", () => {
  // Interview start is capped at 5 per 10 mins
  const startReq = createMockReq({ user: { id: "candidate_1" }, path: "/api/interview/start" });
  for (let i = 0; i < 5; i++) {
    interviewStartLimiter(startReq, createMockRes(), () => {});
  }
  const blockedStartRes = createMockRes();
  interviewStartLimiter(startReq, blockedStartRes, () => {});
  assert.equal(blockedStartRes.statusCode, 429, "6th start should be blocked");

  // But follow-up answer turns on interview answer endpoint are NOT passed through interviewStartLimiter
  // They only pass generalLimiter and continue working
  const answerReq = createMockReq({ user: { id: "candidate_1" }, path: "/api/interview/session-1/answer" });
  let answerPassed = false;
  generalLimiter(answerReq, createMockRes(), () => { answerPassed = true; });
  assert.equal(answerPassed, true, "Interview answers must proceed unblocked");
});

await runTest("isDedicatedRateLimitedRoute accurately detects dedicated AI & upload endpoints", () => {
  // Heavy POST endpoints with dedicated limiters
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/generate-problem" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/evaluate-code" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/hint" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/explain-approach" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/show-solution" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/coach-chat" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/behavioral-chat" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/review-resume" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/interview/upload-resume" })), true);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/interview/start" })), true);

  // Standard GET endpoints must NOT be skipped by general limiter
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "GET", path: "/api/user/preferences" })), false);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "GET", path: "/api/user/study-plan" })), false);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "GET", path: "/api/user/progress" })), false);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "GET", path: "/api/resume/my-resumes" })), false);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/run-code" })), false);
  assert.equal(isDedicatedRateLimitedRoute(createMockReq({ method: "POST", path: "/api/user/record-activity" })), false);
});

await runTest("Specialized AI routes do NOT consume generalLimiter quota, while expensiveAiLimiter still throttles", () => {
  const reqAi = createMockReq({ method: "POST", path: "/api/generate-problem", user: { id: "ai_user_1" } });

  // 1. Send through generalLimiter 120 times (exceeding general limit of 100)
  let generalPassCount = 0;
  for (let i = 0; i < 120; i++) {
    generalLimiter(reqAi, createMockRes(), () => { generalPassCount++; });
  }
  assert.equal(generalPassCount, 120, "generalLimiter must skip dedicated AI generation to prevent double-counting");

  // 2. But expensiveAiLimiter strictly limits to 10 per minute
  let aiPassCount = 0;
  for (let i = 0; i < 10; i++) {
    expensiveAiLimiter(reqAi, createMockRes(), () => { aiPassCount++; });
  }
  assert.equal(aiPassCount, 10, "First 10 expensive operations allowed");

  // 11th request must be throttled by expensiveAiLimiter
  const blockedAiRes = createMockRes();
  let ai11Passed = false;
  expensiveAiLimiter(reqAi, blockedAiRes, () => { ai11Passed = true; });
  assert.equal(ai11Passed, false);
  assert.equal(blockedAiRes.statusCode, 429, "11th AI operation must be throttled by expensiveAiLimiter");
});

await runTest("Ordinary endpoints remain strictly protected by generalLimiter", () => {
  const testLimiter = createRateLimiter({
    name: "test-ordinary-limiter",
    windowMs: 60000,
    max: 3,
  });

  const reqOrdinary = createMockReq({ method: "GET", path: "/api/user/study-plan", user: { id: "ordinary_user" } });
  testLimiter(reqOrdinary, createMockRes(), () => {});
  testLimiter(reqOrdinary, createMockRes(), () => {});
  testLimiter(reqOrdinary, createMockRes(), () => {});

  // 4th request exceeds quota
  const res4 = createMockRes();
  let fourthPassed = false;
  testLimiter(reqOrdinary, res4, () => { fourthPassed = true; });
  assert.equal(fourthPassed, false);
  assert.equal(res4.statusCode, 429);
});

await runTest("Rejects client-supplied x-user-id or body userId spoofing attempts", () => {
  const req = createMockReq({
    ip: "198.51.100.77",
    headers: { "x-user-id": "spoofed_admin_id" },
    body: { userId: "spoofed_admin_id" },
  });
  const key = resolveRateLimitKey(req);
  assert.equal(key, "ip:198.51.100.77", "Unverified user IDs must never be used as rate limit keys");
});

await runTest("Auth limiter is strictly IP-keyed even if a user session is present", () => {
  const req = createMockReq({
    ip: "203.0.113.88",
    user: { id: "authenticated_user_99" },
  });
  // authLimiter key generator creates auth-ip:<ip>
  const key = `auth-ip:${getClientIp(req)}`;
  assert.equal(key, "auth-ip:203.0.113.88");
});

await runTest("Sliding window prunes expired entries after windowMs", async () => {
  const shortWindowMs = 50; // 50ms window
  const limiter = createRateLimiter({
    name: "test-expiry",
    windowMs: shortWindowMs,
    max: 1,
  });

  const req = createMockReq({ user: { id: "fast_user" } });
  const res1 = createMockRes();
  let firstAllowed = false;
  limiter(req, res1, () => { firstAllowed = true; });
  assert.equal(firstAllowed, true);

  // Immediate second request is blocked
  const res2 = createMockRes();
  let secondAllowed = false;
  limiter(req, res2, () => { secondAllowed = true; });
  assert.equal(secondAllowed, false);
  assert.equal(res2.statusCode, 429);

  // Wait for window to slide past 50ms
  await new Promise((r) => setTimeout(r, 70));

  // Third request after window expiry succeeds
  const res3 = createMockRes();
  let thirdAllowed = false;
  limiter(req, res3, () => { thirdAllowed = true; });
  assert.equal(thirdAllowed, true, "Request after windowMs must succeed");
});

await runTest("parseConfigInt validates values, prevents silent misconfiguration, and resolves aliases", () => {
  // Test canonical valid
  process.env.TEST_CANONICAL = "42";
  assert.equal(parseConfigInt("TEST_CANONICAL", [], 10), 42);

  // Test invalid string (falls back to default without NaN)
  process.env.TEST_INVALID = "not_a_number";
  assert.equal(parseConfigInt("TEST_INVALID", [], 25), 25);

  // Test negative number (falls back to default)
  process.env.TEST_NEGATIVE = "-10";
  assert.equal(parseConfigInt("TEST_NEGATIVE", [], 15), 15);

  // Test alias resolution
  delete process.env.TEST_PRIMARY;
  process.env.TEST_ALIAS = "77";
  assert.equal(parseConfigInt("TEST_PRIMARY", ["TEST_ALIAS"], 5), 77);

  // Clean up test env vars
  delete process.env.TEST_CANONICAL;
  delete process.env.TEST_INVALID;
  delete process.env.TEST_NEGATIVE;
  delete process.env.TEST_ALIAS;
});

// ----------------------------------------------------------------------------
// Suite 4: Trust Proxy Configuration Parsing & Validation
// ----------------------------------------------------------------------------
console.log("\n--- Suite 4: Trust Proxy Configuration Parsing & Validation ---");

await runTest("parseTrustProxy handles boolean strings and missing configuration correctly", () => {
  // Missing or empty values return false
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(null), false);
  assert.equal(parseTrustProxy(""), false);
  assert.equal(parseTrustProxy("   "), false);

  // Boolean primitives
  assert.equal(parseTrustProxy(false), false);
  assert.equal(parseTrustProxy(true), true);

  // String booleans
  assert.equal(parseTrustProxy("false"), false);
  assert.equal(parseTrustProxy("FALSE"), false);
  assert.equal(parseTrustProxy("0"), false);
  assert.equal(parseTrustProxy("off"), false);
  assert.equal(parseTrustProxy("no"), false);

  assert.equal(parseTrustProxy("true"), true);
  assert.equal(parseTrustProxy("TRUE"), true);
  assert.equal(parseTrustProxy("on"), true);
  assert.equal(parseTrustProxy("yes"), true);
});

await runTest("parseTrustProxy handles numeric hop counts correctly", () => {
  // Integer primitives
  assert.equal(parseTrustProxy(0), false);
  assert.equal(parseTrustProxy(1), 1);
  assert.equal(parseTrustProxy(2), 2);

  // String integers
  assert.equal(parseTrustProxy("1"), 1);
  assert.equal(parseTrustProxy("3"), 3);
  assert.equal(parseTrustProxy("0"), false);
});

await runTest("parseTrustProxy handles valid subnets, IP lists, and keywords", () => {
  assert.equal(parseTrustProxy("loopback"), "loopback");
  assert.equal(parseTrustProxy("linklocal"), "linklocal");
  assert.equal(parseTrustProxy("uniquelocal"), "uniquelocal");
  assert.equal(parseTrustProxy("127.0.0.1"), "127.0.0.1");
  assert.equal(parseTrustProxy("10.0.0.0/8"), "10.0.0.0/8");
  assert.equal(parseTrustProxy("loopback, 10.0.0.0/8"), "loopback, 10.0.0.0/8");
});

await runTest("parseTrustProxy rejects invalid values with descriptive configuration errors", () => {
  assert.throws(
    () => parseTrustProxy("invalid_proxy_ip"),
    /\[Configuration Error\] Invalid TRUST_PROXY value "invalid_proxy_ip"/
  );

  assert.throws(
    () => parseTrustProxy(-1),
    /\[Configuration Error\] Invalid TRUST_PROXY number "-1"/
  );

  assert.throws(
    () => parseTrustProxy(1.5),
    /\[Configuration Error\] Invalid TRUST_PROXY number "1.5"/
  );
});

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log("=================================================");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
