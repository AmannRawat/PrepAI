import "dotenv/config";
import assert from "node:assert/strict";

// Setup mock test environment
process.env.AI_SERVICE_SECRET = process.env.AI_SERVICE_SECRET || "mock_secret_for_tests";

import { checkAiHealth } from "../services/ai.service.js";
import {
  getHealthStatus,
  getNodeHealth,
  getAiHealth,
} from "../controllers/health.controller.js";
import { generalLimiter } from "../middleware/rateLimiter.js";

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
    process.exitCode = 1;
  }
}

function createMockReq(overrides = {}) {
  return {
    query: {},
    params: {},
    headers: {},
    path: "/api/health",
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    getHeader(key) {
      return this.headers[key.toLowerCase()];
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

console.log("=================================================");
console.log("  PREPAI SERVICE HEALTH & AVAILABILITY TESTS     ");
console.log("=================================================\n");

const originalFetch = global.fetch;

try {
  // --- Suite 1: checkAiHealth upstream probe ---
  console.log("--- Suite 1: AI Health Probe Upstream Detection ---");

  await runTest("checkAiHealth returns available when upstream responds 200", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });

    const result = await checkAiHealth(1000);
    assert.equal(result.available, true);
    assert.equal(result.status, "available");
  });

  await runTest("checkAiHealth returns starting when upstream times out or errors", async () => {
    global.fetch = async () => {
      throw new Error("fetch failed (ECONNREFUSED)");
    };

    const result = await checkAiHealth(500);
    assert.equal(result.available, false);
    assert.equal(result.status, "starting");
  });

  await runTest("checkAiHealth returns starting when upstream returns 502/503", async () => {
    global.fetch = async () => ({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
    });

    const result = await checkAiHealth(500);
    assert.equal(result.available, false);
    assert.equal(result.status, "starting");
  });

  // --- Suite 2: Health Controller Endpoint Responses ---
  console.log("\n--- Suite 2: Health Controller Endpoint Contracts ---");

  await runTest("getHealthStatus returns both Node and AI status when AI is available", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });

    const req = createMockReq();
    const res = createMockRes();

    await getHealthStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.services.node.status, "available");
    assert.equal(res.body.services.node.available, true);
    assert.equal(res.body.services.ai.status, "available");
    assert.equal(res.body.services.ai.available, true);
  });

  await runTest("getHealthStatus returns 200 with ai: starting when AI is cold-starting", async () => {
    global.fetch = async () => {
      throw new Error("ETIMEDOUT");
    };

    const req = createMockReq();
    const res = createMockRes();

    await getHealthStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.services.node.status, "available");
    assert.equal(res.body.services.ai.status, "starting");
    assert.equal(res.body.services.ai.available, false);
  });

  await runTest("getHealthStatus with ?service=node returns fast without probing AI", async () => {
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, status: 200 };
    };

    const req = createMockReq({ query: { service: "node" } });
    const res = createMockRes();

    await getHealthStatus(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(fetchCalled, false, "AI probe should not be called when service=node");
    assert.equal(res.body.services.node.status, "available");
    assert.equal(res.body.services.ai, undefined);
  });

  await runTest("getNodeHealth returns standalone node availability", () => {
    const req = createMockReq();
    const res = createMockRes();

    getNodeHealth(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.service, "node");
    assert.equal(res.body.available, true);
  });

  await runTest("getAiHealth returns AI service status", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });

    const req = createMockReq();
    const res = createMockRes();

    await getAiHealth(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.service, "ai");
    assert.equal(res.body.available, true);
  });

  // --- Suite 3: Security & Rate Limiting ---
  console.log("\n--- Suite 3: Security & Rate Limiter Exemption ---");

  await runTest("Health responses never expose secrets, keys, or internal URLs", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "healthy" }),
    });

    const req = createMockReq();
    const res = createMockRes();

    await getHealthStatus(req, res);

    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes(process.env.AI_SERVICE_SECRET), false);
    assert.equal(serialized.includes("localhost:9000"), false);
    assert.equal(serialized.includes("onrender.com"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
  });

  await runTest("Health endpoints /api/health and /health are exempted from general rate limiter", () => {
    const paths = ["/health", "/api/health", "/api/health/node", "/api/health/ai"];

    for (const testPath of paths) {
      let passed = 0;
      const mockReq = createMockReq({ path: testPath });

      // Run 150 times (well over general limit of 100)
      for (let i = 0; i < 120; i++) {
        generalLimiter(mockReq, createMockRes(), () => {
          passed++;
        });
      }

      assert.equal(passed, 120, `Path ${testPath} should not be throttled`);
    }
  });

} finally {
  global.fetch = originalFetch;
}

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log("=================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}

