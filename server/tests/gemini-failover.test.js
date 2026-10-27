import "dotenv/config";
import assert from "node:assert/strict";
import {
  generateText,
  resetFailoverState,
  setMockGenerativeModels,
  isFailoverEnabled,
  isPrimaryInCooldown,
  getFailoverStatus,
} from "../services/gemini.service.js";
import {
  classifyGeminiError,
  GeminiErrorCategory,
  extractStatusCode,
  extractRetryDelayMs,
} from "../services/gemini-classifier.js";

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// Helpers to simulate SDK responses and errors
function createMockSuccessResponse(text) {
  return {
    response: {
      text: () => text,
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    },
  };
}

function createMockQuotaExhaustedError() {
  const err = new Error(
    "[429 Too Many Requests] Resource has been exhausted (e.g. check quota). Daily request limit exceeded for generateContentRequestsPerDay."
  );
  err.status = 429;
  err.errorDetails = [
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "RATE_LIMIT_EXCEEDED",
      metadata: { quota_limit: "generateContentRequestsPerDay", service: "generativelanguage.googleapis.com" },
    },
  ];
  return err;
}

function createMockRpmRateLimitError() {
  const err = new Error(
    "[429 Too Many Requests] Resource has been exhausted (e.g. check quota). Please retry after 1s."
  );
  err.status = 429;
  err.errorDetails = [
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "RATE_LIMIT_EXCEEDED",
      metadata: { quota_limit: "generateContentRequestsPerMinute", service: "generativelanguage.googleapis.com" },
    },
    {
      "@type": "type.googleapis.com/google.rpc.RetryInfo",
      retryDelay: "1s",
    },
  ];
  return err;
}

function createMockAmbiguous429Error() {
  const err = new Error("[429 Too Many Requests] Resource has been exhausted.");
  err.status = 429;
  return err;
}

function createMock503Error() {
  const err = new Error("[503 Service Unavailable] The model is overloaded. Please try again later.");
  err.status = 503;
  return err;
}

function createMockAuthError() {
  const err = new Error("[400 Bad Request] API key not valid. Please pass a valid API key.");
  err.status = 400;
  return err;
}

async function runAllTests() {
  console.log("=================================================");
  console.log("  GEMINI MULTI-PROJECT QUOTA FAILOVER (NODE.JS)  ");
  console.log("=================================================\n");

  const origKey = process.env.GEMINI_API_KEY;
  const origFallback = process.env.GEMINI_FALLBACK_API_KEY;
  const origFailover = process.env.GEMINI_FAILOVER_ENABLED;

  try {
    // ------------------------------------------------------------------------
    // Classifier Unit Tests
    // ------------------------------------------------------------------------
    await test("Classifier: extracts status code correctly", () => {
      assert.equal(extractStatusCode({ status: 429 }), 429);
      assert.equal(extractStatusCode({ code: 503 }), 503);
      assert.equal(extractStatusCode({ message: "[429 Too Many Requests] error" }), 429);
      assert.equal(extractStatusCode({ message: "Something went wrong status code: 400" }), 400);
      assert.equal(extractStatusCode(null), null);
    });

    await test("Classifier: extracts retry delay from RetryInfo", () => {
      const err = {
        errorDetails: [{ "@type": "google.rpc.RetryInfo", retryDelay: "2.5s" }],
      };
      assert.equal(extractRetryDelayMs(err), 2500);
    });

    await test("Classifier: classifies confirmed daily/project quota exhaustion", () => {
      const err = createMockQuotaExhaustedError();
      const res = classifyGeminiError(err);
      assert.equal(res.category, GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED);
      assert.equal(res.isQuotaExhausted, true);
      assert.equal(res.isTransient, false);
    });

    await test("Classifier: classifies short-term RPM rate limit as temporary", () => {
      const err = createMockRpmRateLimitError();
      const res = classifyGeminiError(err);
      assert.equal(res.category, GeminiErrorCategory.TEMPORARY_RATE_LIMIT);
      assert.equal(res.isQuotaExhausted, false);
      assert.equal(res.isTransient, true);
    });

    await test("Classifier: classifies ambiguous 429 as temporary rate limit (no auto failover)", () => {
      const err = createMockAmbiguous429Error();
      const res = classifyGeminiError(err);
      assert.equal(res.category, GeminiErrorCategory.TEMPORARY_RATE_LIMIT);
      assert.equal(res.isQuotaExhausted, false);
    });

    await test("Classifier: classifies 503 as transient service failure", () => {
      const err = createMock503Error();
      const res = classifyGeminiError(err);
      assert.equal(res.category, GeminiErrorCategory.TRANSIENT_SERVICE);
      assert.equal(res.isQuotaExhausted, false);
      assert.equal(res.isTransient, true);
    });

    await test("Classifier: classifies invalid credentials as permanent error", () => {
      const err = createMockAuthError();
      const res = classifyGeminiError(err);
      assert.equal(res.category, GeminiErrorCategory.PERMANENT_ERROR);
      assert.equal(res.isPermanent, true);
      assert.equal(res.isQuotaExhausted, false);
    });

    // ------------------------------------------------------------------------
    // Service & Failover Execution Tests
    // ------------------------------------------------------------------------

    await test("1. Primary success never calls fallback", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          return createMockSuccessResponse("Primary answer");
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      const res = await generateText("Hello", { stage: "test" });
      assert.equal(res, "Primary answer");
      assert.equal(primaryCalls, 1);
      assert.equal(fallbackCalls, 0);
    });

    await test("2 & 3. Confirmed eligible primary quota exhaustion triggers fallback and succeeds", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          throw createMockQuotaExhaustedError();
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Recovered via fallback project");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      const res = await generateText("Test failover", { stage: "test" });
      assert.equal(res, "Recovered via fallback project");
      assert.equal(primaryCalls, 1, "Primary should only be called once when confirmed exhausted");
      assert.equal(fallbackCalls, 1, "Fallback should be called once to fulfill request");
      assert.equal(isPrimaryInCooldown(), true, "Primary should now be in quota cooldown");
    });

    await test("4. Primary temporary RPM/TPM throttling retries on primary without failover", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          if (primaryCalls === 1) {
            const err = createMockRpmRateLimitError();
            err.errorDetails[1].retryDelay = "0.01s"; // short delay for test
            throw err;
          }
          return createMockSuccessResponse("Success after RPM retry");
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      const res = await generateText("Test RPM throttling", { stage: "test", maxAttempts: 2 });
      assert.equal(res, "Success after RPM retry");
      assert.equal(primaryCalls, 2, "Primary should retry locally");
      assert.equal(fallbackCalls, 0, "Fallback must NOT be called on RPM throttling");
      assert.equal(isPrimaryInCooldown(), false, "Primary should NOT be placed in cooldown");
    });

    await test("5. HTTP 503 retries on primary without quota-based failover", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          if (primaryCalls === 1) {
            throw createMock503Error();
          }
          return createMockSuccessResponse("Success after 503 retry");
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      const res = await generateText("Test 503 retry", { stage: "test", maxAttempts: 2 });
      assert.equal(res, "Success after 503 retry");
      assert.equal(primaryCalls, 2);
      assert.equal(fallbackCalls, 0);
    });

    await test("6. Ambiguous 429 does not automatically trigger failover", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          if (primaryCalls === 1) {
            throw createMockAmbiguous429Error();
          }
          return createMockSuccessResponse("Recovered after ambiguous 429");
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      const res = await generateText("Test ambiguous 429", { stage: "test", maxAttempts: 2 });
      assert.equal(res, "Recovered after ambiguous 429");
      assert.equal(primaryCalls, 2);
      assert.equal(fallbackCalls, 0);
    });

    await test("7. Permanent auth error fails immediately without retry or failover", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          throw createMockAuthError();
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      await assert.rejects(
        () => generateText("Test permanent auth error", { stage: "test", maxAttempts: 2 }),
        (err) => {
          assert.equal(err.status, 400);
          return true;
        }
      );

      assert.equal(primaryCalls, 1, "Permanent error must fail fast on attempt 1");
      assert.equal(fallbackCalls, 0, "Permanent error must never call fallback");
    });

    await test("8. Fallback exhaustion returns a controlled error without looping back", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          throw createMockQuotaExhaustedError();
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          throw createMockQuotaExhaustedError();
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      await assert.rejects(
        () => generateText("Test double exhaustion", { stage: "test" }),
        (err) => {
          assert.match(err.message, /Gemini project quota exhausted on both primary and fallback projects/i);
          assert.equal(err.credentialSlot, "fallback");
          return true;
        }
      );

      assert.equal(primaryCalls, 1);
      assert.equal(fallbackCalls, 1);
    });

    await test("9. When failover is disabled, primary quota exhaustion throws without fallback", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "false";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          throw createMockQuotaExhaustedError();
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse("Fallback answer");
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      await assert.rejects(
        () => generateText("Test disabled failover", { stage: "test" }),
        (err) => {
          assert.match(err.message, /no fallback project is configured or enabled/i);
          return true;
        }
      );

      assert.equal(primaryCalls, 1);
      assert.equal(fallbackCalls, 0);
    });

    await test("10. Cooldown prevents subsequent requests from hammering primary during quota exhaustion", async () => {
      resetFailoverState();
      process.env.GEMINI_FAILOVER_ENABLED = "true";
      process.env.GEMINI_FALLBACK_API_KEY = "mock_fallback_key";

      let primaryCalls = 0;
      let fallbackCalls = 0;

      const primaryModel = {
        generateContent: async () => {
          primaryCalls++;
          throw createMockQuotaExhaustedError();
        },
      };

      const fallbackModel = {
        generateContent: async () => {
          fallbackCalls++;
          return createMockSuccessResponse(`Fallback response ${fallbackCalls}`);
        },
      };

      setMockGenerativeModels({ primaryModel, fallbackModel });

      // Request 1: hits primary, exhausts quota, fails over to fallback
      const res1 = await generateText("Req 1", { stage: "test" });
      assert.equal(res1, "Fallback response 1");
      assert.equal(primaryCalls, 1);
      assert.equal(fallbackCalls, 1);
      assert.equal(isPrimaryInCooldown(), true);

      // Request 2: since primary is in cooldown, routes directly to fallback without calling primary
      const res2 = await generateText("Req 2", { stage: "test" });
      assert.equal(res2, "Fallback response 2");
      assert.equal(primaryCalls, 1, "Primary must NOT be called while in cooldown");
      assert.equal(fallbackCalls, 2, "Fallback handles request 2 directly");
    });

    await test("11. getFailoverStatus reports sanitized diagnostic information without secrets", () => {
      const status = getFailoverStatus();
      assert.equal(typeof status.failoverEnabled, "boolean");
      assert.equal(typeof status.hasPrimaryConfigured, "boolean");
      assert.equal(typeof status.hasFallbackConfigured, "boolean");
      assert.equal(typeof status.isPrimaryInCooldown, "boolean");
      // Assert no secrets leaked
      assert.equal("apiKey" in status, false);
      assert.equal("fallbackKey" in status, false);
    });
  } finally {
    // Restore environment
    process.env.GEMINI_API_KEY = origKey;
    if (origFallback !== undefined) {
      process.env.GEMINI_FALLBACK_API_KEY = origFallback;
    } else {
      delete process.env.GEMINI_FALLBACK_API_KEY;
    }
    if (origFailover !== undefined) {
      process.env.GEMINI_FAILOVER_ENABLED = origFailover;
    } else {
      delete process.env.GEMINI_FAILOVER_ENABLED;
    }
    resetFailoverState();
  }

  console.log(`\n=================================================`);
  console.log(`  Tests: ${passedTests}/${totalTests} Passed`);
  console.log(`=================================================`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
