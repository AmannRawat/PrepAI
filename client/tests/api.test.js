/**
 * Unit Tests for PrepAI Frontend API Deduplication & In-Memory Caching
 * 
 * Verifies:
 * 1. Identical concurrent GET requests are deduplicated.
 * 2. Failed requests do not poison the in-flight map.
 * 3. Cache entries are isolated by user.
 * 4. Cache invalidation works after relevant mutations.
 * 5. Non-GET requests are not deduplicated.
 * 6. Retry-After / 429 response handling remains correct.
 * 7. clearApiCache() purges all stored responses.
 */

import assert from 'node:assert/strict';
import axios, {
  clearApiCache,
  invalidateApiCache,
  buildRequestKey,
  setNetworkHandlerForTesting,
} from '../src/utils/api.js';

console.log("=================================================");
console.log("  PREPAI FRONTEND API DEDUPLICATION & CACHE TESTS");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  clearApiCache();
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

// ----------------------------------------------------------------------------
// Test 1: Identical Concurrent GET Requests Deduplicated
// ----------------------------------------------------------------------------
await runTest("Identical concurrent GET requests share a single network call", async () => {
  let networkCalls = 0;
  setNetworkHandlerForTesting(async (config) => {
    networkCalls++;
    await new Promise((r) => setTimeout(r, 20)); // simulate latency
    return {
      data: { count: networkCalls, url: config.url },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });

  const token = "test_user_token_abc";
  const headers = { Authorization: `Bearer ${token}` };

  // Dispatch 3 concurrent GET requests to /api/user/progress
  const [res1, res2, res3] = await Promise.all([
    axios.get("http://localhost:5000/api/user/progress", { headers }),
    axios.get("http://localhost:5000/api/user/progress", { headers }),
    axios.get("http://localhost:5000/api/user/progress", { headers }),
  ]);

  assert.equal(networkCalls, 1, "Only 1 network call must be made for 3 concurrent GETs");
  assert.equal(res1.data.count, 1);
  assert.equal(res2.data.count, 1);
  assert.equal(res3.data.count, 1);
  // Ensure independent object instances returned (deep clone)
  res1.data.mutated = true;
  assert.equal(res2.data.mutated, undefined, "Responses must be deep cloned to prevent cross-component pollution");
});

// ----------------------------------------------------------------------------
// Test 2: Failed Requests Do Not Poison In-Flight Map
// ----------------------------------------------------------------------------
await runTest("Failed requests do not poison the in-flight map; retries can succeed", async () => {
  let attempt = 0;
  setNetworkHandlerForTesting(async (config) => {
    attempt++;
    if (attempt === 1) {
      const err = new Error("Network transient failure");
      err.response = { status: 500, data: { message: "Internal Error" } };
      throw err;
    }
    return {
      data: { success: true, attempt },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });

  const headers = { Authorization: "Bearer user_token_retry" };

  // 1st request fails
  await assert.rejects(
    async () => {
      await axios.get("http://localhost:5000/api/user/study-plan", { headers });
    },
    (err) => err.message.includes("Network transient failure")
  );

  // Subsequent request must NOT find a stale/failed promise in in-flight map
  const res2 = await axios.get("http://localhost:5000/api/user/study-plan", { headers });
  assert.equal(res2.data.success, true);
  assert.equal(res2.data.attempt, 2, "Second attempt must execute fresh network request");
});

// ----------------------------------------------------------------------------
// Test 3: Cache Entries Are Isolated by User Authentication
// ----------------------------------------------------------------------------
await runTest("Cache entries are strictly isolated by user authentication", async () => {
  let callCount = 0;
  setNetworkHandlerForTesting(async (config) => {
    callCount++;
    const authHeader = config.headers?.Authorization || "";
    return {
      data: {
        user: authHeader.includes("user_alice") ? "alice" : "bob",
        callCount,
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });

  // Alice fetches preferences
  const aliceRes = await axios.get("http://localhost:5000/api/user/preferences", {
    headers: { Authorization: "Bearer token_user_alice_12345" },
  });
  assert.equal(aliceRes.data.user, "alice");
  assert.equal(callCount, 1);

  // Bob fetches preferences: must NOT receive Alice's cached response!
  const bobRes = await axios.get("http://localhost:5000/api/user/preferences", {
    headers: { Authorization: "Bearer token_user_bob_67890" },
  });
  assert.equal(bobRes.data.user, "bob");
  assert.equal(callCount, 2, "Bob must trigger fresh network request");

  // Alice fetches again within TTL: hits cache!
  const aliceRes2 = await axios.get("http://localhost:5000/api/user/preferences", {
    headers: { Authorization: "Bearer token_user_alice_12345" },
  });
  assert.equal(aliceRes2.data.user, "alice");
  assert.equal(callCount, 2, "Alice's second request must be served from cache without extra network call");
});

// ----------------------------------------------------------------------------
// Test 4: Cache Invalidation Works After Relevant Mutations
// ----------------------------------------------------------------------------
await runTest("Cache invalidation works after relevant mutations", async () => {
  let prefVersion = 1;
  let getCalls = 0;

  setNetworkHandlerForTesting(async (config) => {
    const method = (config.method || "GET").toUpperCase();
    if (method === "GET") {
      getCalls++;
      return {
        data: { version: prefVersion },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    } else if (method === "PUT") {
      prefVersion = config.data?.version || prefVersion + 1;
      return {
        data: { success: true, newVersion: prefVersion },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    }
  });

  const headers = { Authorization: "Bearer user_token_mutations" };

  // Initial GET: populates cache
  const firstGet = await axios.get("http://localhost:5000/api/user/preferences", { headers });
  assert.equal(firstGet.data.version, 1);
  assert.equal(getCalls, 1);

  // Immediate 2nd GET: served from cache
  const cachedGet = await axios.get("http://localhost:5000/api/user/preferences", { headers });
  assert.equal(cachedGet.data.version, 1);
  assert.equal(getCalls, 1, "Must hit cache");

  // Mutation: PUT /api/user/preferences
  await axios.put("http://localhost:5000/api/user/preferences", { version: 2 }, { headers });

  // Next GET: cache was invalidated by mutation, triggers fresh network fetch
  const freshGet = await axios.get("http://localhost:5000/api/user/preferences", { headers });
  assert.equal(freshGet.data.version, 2);
  assert.equal(getCalls, 2, "Must execute fresh fetch after mutation invalidation");
});

// ----------------------------------------------------------------------------
// Test 5: Non-GET Requests Are NOT Deduplicated
// ----------------------------------------------------------------------------
await runTest("Non-GET requests are never deduplicated", async () => {
  let postCount = 0;
  setNetworkHandlerForTesting(async (config) => {
    postCount++;
    const currentPostId = postCount;
    await new Promise((r) => setTimeout(r, 15));
    return {
      data: { postId: currentPostId },
      status: 201,
      statusText: "Created",
      headers: {},
      config,
    };
  });

  const headers = { Authorization: "Bearer user_token_post" };

  const [post1, post2] = await Promise.all([
    axios.post("http://localhost:5000/api/user/record-activity", { action: "dsa_solve" }, { headers }),
    axios.post("http://localhost:5000/api/user/record-activity", { action: "dsa_solve" }, { headers }),
  ]);

  assert.equal(postCount, 2, "Both POST requests must execute independently");
  assert.equal(post1.data.postId, 1);
  assert.equal(post2.data.postId, 2);
});

// ----------------------------------------------------------------------------
// Test 6: Retry-After & 429 Normalization Remains Intact
// ----------------------------------------------------------------------------
await runTest("HTTP 429 normalization formats friendly message and preserves retryAfter", async () => {
  setNetworkHandlerForTesting(async (config) => {
    const err = new Error("Request failed with status code 429");
    err.response = {
      status: 429,
      data: {
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please wait 840 seconds before trying again.",
        retryAfter: 840,
      },
      headers: {
        "retry-after": "840",
      },
      config,
    };
    throw err;
  });

  try {
    await axios.get("http://localhost:5000/api/resume/my-resumes");
    assert.fail("Should have thrown 429");
  } catch (err) {
    assert.equal(err.response.status, 429);
    assert.ok(err.message.includes("Retry in 840s"));
    assert.equal(err.response.data.retryAfter, 840);
  }
});

// ----------------------------------------------------------------------------
// Test 7: clearApiCache() Wipes All Stored Responses
// ----------------------------------------------------------------------------
await runTest("clearApiCache() removes all cached responses (e.g. on logout)", async () => {
  let calls = 0;
  setNetworkHandlerForTesting(async (config) => {
    calls++;
    return {
      data: { call: calls },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  });

  const headers = { Authorization: "Bearer user_token_logout" };
  await axios.get("http://localhost:5000/api/user/preferences", { headers });
  assert.equal(calls, 1);

  // Clear cache as on logout
  clearApiCache();

  // Subsequent fetch must be fresh
  await axios.get("http://localhost:5000/api/user/preferences", { headers });
  assert.equal(calls, 2);
});

// Reset testing network handler
setNetworkHandlerForTesting(null);

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log("=================================================");

if (passedTests !== totalTests) {
  process.exit(1);
}
