import { GoogleGenerativeAI } from "@google/generative-ai";
import { startTrace, endTrace } from "./langsmith.service.js";
import { classifyGeminiError, GeminiErrorCategory } from "./gemini-classifier.js";

// Process-local failover state
const PRIMARY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown when primary project quota is confirmed exhausted
let primaryQuotaExhaustedUntil = 0;

let customGenerator = null;
let mockModels = null;

let cachedPrimaryClient = null;
let cachedPrimaryModel = null;
let cachedFallbackClient = null;
let cachedFallbackModel = null;
let lastPrimaryApiKey = null;
let lastFallbackApiKey = null;

/**
 * Checks if cross-project failover is explicitly enabled.
 * Default is false until configured and tested.
 * @returns {boolean}
 */
export function isFailoverEnabled() {
  const val = process.env.GEMINI_FAILOVER_ENABLED;
  return val === "true" || val === "1";
}

/**
 * Returns whether the primary project is currently cooling down due to daily quota exhaustion.
 * @returns {boolean}
 */
export function isPrimaryInCooldown() {
  return primaryQuotaExhaustedUntil > Date.now();
}

/**
 * Returns current failover operational status for diagnostics (without credentials).
 */
export function getFailoverStatus() {
  return {
    failoverEnabled: isFailoverEnabled(),
    hasPrimaryConfigured: Boolean(process.env.GEMINI_API_KEY),
    hasFallbackConfigured: Boolean(process.env.GEMINI_FALLBACK_API_KEY),
    isPrimaryInCooldown: isPrimaryInCooldown(),
    primaryCooldownExpiresAt: isPrimaryInCooldown() ? new Date(primaryQuotaExhaustedUntil).toISOString() : null,
  };
}

/**
 * Resets failover state and cached clients. Primarily used for unit testing.
 */
export function resetFailoverState() {
  primaryQuotaExhaustedUntil = 0;
  customGenerator = null;
  mockModels = null;
  cachedPrimaryClient = null;
  cachedPrimaryModel = null;
  cachedFallbackClient = null;
  cachedFallbackModel = null;
  lastPrimaryApiKey = null;
  lastFallbackApiKey = null;
}

/**
 * Testing utility to mock generateText without making live external API calls.
 * Passing null restores default behavior.
 */
export function setCustomTextGenerator(fn) {
  customGenerator = fn;
}

/**
 * Testing utility to inject mock models for primary and fallback slots.
 * @param {{ primaryModel?: Object, fallbackModel?: Object } | null} mocks
 */
export function setMockGenerativeModels(mocks) {
  mockModels = mocks;
}

/**
 * Retrieves the generative model instance for a given slot.
 * @param {"primary" | "fallback"} slot
 * @returns {Object}
 */
function getModelForSlot(slot) {
  if (mockModels) {
    if (slot === "primary" && mockModels.primaryModel) return mockModels.primaryModel;
    if (slot === "fallback" && mockModels.fallbackModel) return mockModels.fallbackModel;
  }

  if (slot === "primary") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    if (!cachedPrimaryModel || lastPrimaryApiKey !== key) {
      cachedPrimaryClient = new GoogleGenerativeAI(key);
      cachedPrimaryModel = cachedPrimaryClient.getGenerativeModel({
        model: "gemini-3.5-flash-lite",
      });
      lastPrimaryApiKey = key;
    }
    return cachedPrimaryModel;
  }

  if (slot === "fallback") {
    const fallbackKey = process.env.GEMINI_FALLBACK_API_KEY;
    if (!fallbackKey) {
      throw new Error("GEMINI_FALLBACK_API_KEY is not configured for fallback.");
    }
    if (!cachedFallbackModel || lastFallbackApiKey !== fallbackKey) {
      cachedFallbackClient = new GoogleGenerativeAI(fallbackKey);
      cachedFallbackModel = cachedFallbackClient.getGenerativeModel({
        model: "gemini-3.5-flash-lite",
      });
      lastFallbackApiKey = fallbackKey;
    }
    return cachedFallbackModel;
  }

  throw new Error(`Unknown Gemini slot: ${slot}`);
}

/**
 * Core text generation with automatic, safe Gemini multi-project quota failover.
 * 
 * Lifecycle:
 * 1. Checks if primary project is in active quota cooldown.
 * 2. Attempts execution on primary project credential.
 * 3. Applies bounded retries with backoff for transient network errors and short-term RPM/TPM limits.
 * 4. On confirmed project-level quota exhaustion, activates cooldown and fails over to the fallback credential.
 * 5. If fallback also fails, returns a controlled error without leaking credentials.
 */
export async function generateText(prompt, options = {}) {
  const stage = typeof options === "string" ? options : (options?.stage || "general");
  const maxAttempts = options?.maxAttempts || 2;
  const timeoutMs = options?.timeout || 25000;
  const overallDeadlineMs = options?.overallDeadlineMs || 55000;
  const startTime = Date.now();

  // If a legacy custom generator is set (e.g. from existing test harness), execute with preserved retry contract
  if (typeof customGenerator === "function") {
    let lastCustomError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const attemptStart = Date.now();
      if (Date.now() - startTime >= overallDeadlineMs) {
        break;
      }

      const traceRun = startTrace({
        stage,
        promptLength: prompt?.length || 0,
        model: "gemini-3.5-flash-lite",
        credentialSlot: "custom",
      });

      try {
        const customResult = await customGenerator(prompt, options);
        if (traceRun) {
          endTrace(traceRun, {
            responseLength: typeof customResult === "string" ? customResult.length : 0,
            durationMs: Date.now() - attemptStart,
            model: "gemini-3.5-flash-lite",
            credentialSlot: "custom",
          });
        }
        return customResult;
      } catch (err) {
        lastCustomError = err;
        const attemptDuration = Date.now() - attemptStart;
        const totalDuration = Date.now() - startTime;

        if (traceRun) {
          endTrace(traceRun, {
            durationMs: attemptDuration,
            error: err,
            model: "gemini-3.5-flash-lite",
            credentialSlot: "custom",
          });
        }

        const isTimeout =
          err.name === "AbortError" ||
          err.name === "TimeoutError" ||
          err.name === "GoogleGenerativeAIAbortError" ||
          /timeout|aborted|deadline exceeded/i.test(err.message || "");

        const isTransport =
          (err.name === "TypeError" && (err.message || "").includes("fetch failed")) ||
          /ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET/i.test(err.message || "");

        const isTransientNetworkError =
          isTimeout ||
          isTransport ||
          err.status === 503 ||
          err.status === 429;

        console.warn(
          `[Gemini Service] Stage '${stage}' failure on attempt ${attempt}/${maxAttempts} (${attemptDuration}ms elapsed, total ${totalDuration}ms): ${err.message}`
        );

        err.stage = stage;
        err.durationMs = totalDuration;
        err.isTimeout = isTimeout;
        err.isTransportFailure = isTimeout || isTransport;

        if (
          !isTransientNetworkError ||
          attempt >= maxAttempts ||
          Date.now() - startTime + 500 >= overallDeadlineMs
        ) {
          throw err;
        }

        console.warn(`[Gemini Service] Retrying stage '${stage}' in 500ms...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (lastCustomError) {
      lastCustomError.stage = stage;
      lastCustomError.durationMs = Date.now() - startTime;
    }
    throw lastCustomError;
  }

  const failoverActive = isFailoverEnabled() && Boolean(process.env.GEMINI_FALLBACK_API_KEY || mockModels?.fallbackModel);
  const primaryInCooldown = isPrimaryInCooldown();

  // Determine slot progression: if primary is already in cooldown, start directly with fallback
  let slotsToTry = [];
  if (primaryInCooldown && failoverActive) {
    console.warn(
      `[Gemini Service] Primary project quota is in cooldown until ${new Date(primaryQuotaExhaustedUntil).toISOString()}. Using fallback project directly.`
    );
    slotsToTry = ["fallback"];
  } else {
    slotsToTry = ["primary"];
    if (failoverActive) {
      slotsToTry.push("fallback");
    }
  }

  let lastError = null;

  for (let slotIndex = 0; slotIndex < slotsToTry.length; slotIndex++) {
    const currentSlot = slotsToTry[slotIndex];
    let model = null;

    try {
      model = getModelForSlot(currentSlot);
    } catch (initErr) {
      lastError = initErr;
      console.error(`[Gemini Service] Failed to initialize model for slot '${currentSlot}': ${initErr.message}`);
      if (currentSlot === "primary" && failoverActive && slotsToTry.includes("fallback")) {
        // Fallback available, move to fallback slot
        continue;
      }
      throw initErr;
    }

    // Attempt loop within the current slot
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (Date.now() - startTime >= overallDeadlineMs) {
        const timeoutErr = new Error(`Overall Gemini deadline of ${overallDeadlineMs}ms exceeded.`);
        timeoutErr.stage = stage;
        timeoutErr.credentialSlot = currentSlot;
        timeoutErr.durationMs = Date.now() - startTime;
        throw timeoutErr;
      }

      const attemptStart = Date.now();
      const traceRun = startTrace({
        stage,
        promptLength: prompt?.length || 0,
        model: "gemini-3.5-flash-lite",
        credentialSlot: currentSlot,
        attempt,
      });

      try {
        const abortSignal = AbortSignal.timeout(timeoutMs);
        const result = await model.generateContent(prompt, {
          timeout: timeoutMs,
          signal: abortSignal,
        });

        const responseText = result.response.text();
        const usageMetadata = result.response.usageMetadata;
        const attemptDuration = Date.now() - attemptStart;

        if (traceRun) {
          endTrace(traceRun, {
            responseLength: responseText?.length || 0,
            usageMetadata,
            durationMs: attemptDuration,
            model: "gemini-3.5-flash-lite",
            credentialSlot: currentSlot,
          });
        }

        return responseText;
      } catch (err) {
        lastError = err;
        const attemptDuration = Date.now() - attemptStart;
        const totalDuration = Date.now() - startTime;

        if (traceRun) {
          endTrace(traceRun, {
            durationMs: attemptDuration,
            error: err,
            model: "gemini-3.5-flash-lite",
            credentialSlot: currentSlot,
          });
        }

        const classification = classifyGeminiError(err);
        const isTimeout =
          err.name === "AbortError" ||
          err.name === "TimeoutError" ||
          err.name === "GoogleGenerativeAIAbortError" ||
          /timeout|aborted|deadline exceeded/i.test(err.message || "");

        const isTransport =
          (err.name === "TypeError" && (err.message || "").includes("fetch failed")) ||
          /ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET/i.test(err.message || "");

        err.stage = stage;
        err.credentialSlot = currentSlot;
        err.classification = classification.category;
        err.durationMs = totalDuration;
        err.isTimeout = isTimeout;
        err.isTransportFailure = isTimeout || isTransport;

        console.warn(
          `[Gemini Service] Stage '${stage}' failure on slot '${currentSlot}' attempt ${attempt}/${maxAttempts} (${classification.category}): ${err.message}`
        );

        // CASE 1: Confirmed Project Quota Exhaustion
        if (classification.category === GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED) {
          if (currentSlot === "primary") {
            // Place primary project in cooldown
            primaryQuotaExhaustedUntil = Date.now() + PRIMARY_COOLDOWN_MS;
            console.warn(
              `[Gemini Service] Confirmed primary project quota exhausted. Placed primary in cooldown for ${PRIMARY_COOLDOWN_MS / 1000}s.`
            );

            if (failoverActive && slotIndex + 1 < slotsToTry.length) {
              console.warn(
                `[Gemini Service] Failing over to fallback project credential for stage '${stage}'.`
              );
              // Break inner attempt loop to switch to fallback slot
              break;
            } else {
              // Failover not enabled or no fallback slot available
              const quotaErr = new Error(
                "Gemini primary project quota exhausted and no fallback project is configured or enabled."
              );
              quotaErr.stage = stage;
              quotaErr.credentialSlot = "primary";
              quotaErr.durationMs = totalDuration;
              quotaErr.originalError = err;
              throw quotaErr;
            }
          } else {
            // Fallback slot is also exhausted
            const doubleQuotaErr = new Error(
              "Gemini project quota exhausted on both primary and fallback projects."
            );
            doubleQuotaErr.stage = stage;
            doubleQuotaErr.credentialSlot = "fallback";
            doubleQuotaErr.durationMs = totalDuration;
            doubleQuotaErr.originalError = err;
            throw doubleQuotaErr;
          }
        }

        // CASE 2: Temporary Rate Limit (RPM/TPM or Ambiguous 429) -> Bounded retry within SAME slot
        if (classification.category === GeminiErrorCategory.TEMPORARY_RATE_LIMIT) {
          if (attempt < maxAttempts && Date.now() - startTime + 1000 < overallDeadlineMs) {
            const delay = classification.retryDelayMs || Math.min(1000 * Math.pow(2, attempt - 1), 3000);
            console.warn(`[Gemini Service] Short-term rate limit on '${currentSlot}'. Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }

        // CASE 3: Transient Service/Network Failure (503, timeout, transport) -> Bounded retry within SAME slot
        if (classification.category === GeminiErrorCategory.TRANSIENT_SERVICE) {
          if (attempt < maxAttempts && Date.now() - startTime + 500 < overallDeadlineMs) {
            const delay = classification.retryDelayMs || 500;
            console.warn(`[Gemini Service] Transient failure on '${currentSlot}'. Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }

        // CASE 4: Permanent Errors (400, 401, 403, invalid argument, auth) or UNKNOWN -> Fail immediately
        throw err;
      }
    }
  }

  if (lastError) {
    lastError.stage = stage;
    lastError.durationMs = Date.now() - startTime;
  }
  throw lastError;
}