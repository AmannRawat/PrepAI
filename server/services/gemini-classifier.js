/**
 * PrepAI Gemini Error Classifier (Node.js)
 * 
 * Provides centralized, testable classification of Google Generative AI errors:
 * - PROJECT_QUOTA_EXHAUSTED: Confirmed daily/project-level quota exhaustion (eligible for failover)
 * - TEMPORARY_RATE_LIMIT: Short-lived RPM/TPM rate limits (retry with backoff, no failover)
 * - TRANSIENT_SERVICE: Network errors, timeouts, 503 Service Unavailable (retry, no failover)
 * - PERMANENT_ERROR: 400 Bad Request, 401 Invalid Key, 403 Forbidden (no retry, no failover)
 * - UNKNOWN: Unclassified errors (safe default handling)
 */

export const GeminiErrorCategory = Object.freeze({
  PROJECT_QUOTA_EXHAUSTED: "PROJECT_QUOTA_EXHAUSTED",
  TEMPORARY_RATE_LIMIT: "TEMPORARY_RATE_LIMIT",
  TRANSIENT_SERVICE: "TRANSIENT_SERVICE",
  PERMANENT_ERROR: "PERMANENT_ERROR",
  UNKNOWN: "UNKNOWN",
});

/**
 * Extracts numeric HTTP status code from various SDK error formats.
 * @param {Error|Object} err
 * @returns {number|null}
 */
export function extractStatusCode(err) {
  if (!err) return null;
  if (typeof err.status === "number") return err.status;
  if (typeof err.code === "number") return err.code;
  if (typeof err.response?.status === "number") return err.response.status;
  if (typeof err.response?.error?.code === "number") return err.response.error.code;

  // Pattern match "[429 Too Many Requests]" or "status: 429"
  const msg = err.message || "";
  const match = msg.match(/\[(\d{3})\s+[^\]]+\]/) || msg.match(/\bstatus(?:\s+code)?[:\s]+(\d{3})\b/i);
  if (match) {
    const code = parseInt(match[1], 10);
    if (Number.isFinite(code)) return code;
  }
  return null;
}

/**
 * Extracts structured details, metadata, and violations from the error.
 * @param {Error|Object} err
 * @returns {Array<Object>}
 */
export function extractErrorDetails(err) {
  if (!err) return [];
  const details = [];

  if (Array.isArray(err.errorDetails)) {
    details.push(...err.errorDetails);
  }
  if (Array.isArray(err.response?.error?.details)) {
    details.push(...err.response.error.details);
  }
  if (Array.isArray(err.details)) {
    details.push(...err.details);
  }

  return details;
}

/**
 * Extracts retry delay in milliseconds if provided by provider headers or metadata.
 * @param {Error|Object} err
 * @returns {number|null}
 */
export function extractRetryDelayMs(err) {
  if (!err) return null;

  // 1. Check Retry-After header
  const retryAfter = err.response?.headers?.get?.("retry-after") || err.headers?.["retry-after"];
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
  }

  // 2. Check RetryInfo detail in google.rpc.RetryInfo
  const details = extractErrorDetails(err);
  for (const item of details) {
    if (item?.["@type"]?.includes("RetryInfo") && item.retryDelay) {
      const match = String(item.retryDelay).match(/^([\d.]+)\s*s?/);
      if (match) {
        const sec = parseFloat(match[1]);
        if (Number.isFinite(sec) && sec > 0) {
          return Math.round(sec * 1000);
        }
      }
    }
  }

  return null;
}

/**
 * Classifies a Gemini API error into a standardized actionable category.
 * 
 * @param {Error|Object} err - Caught error from Google Generative AI call
 * @returns {Object} Classification metadata
 */
export function classifyGeminiError(err) {
  if (!err) {
    return {
      category: GeminiErrorCategory.UNKNOWN,
      isQuotaExhausted: false,
      isTransient: false,
      isPermanent: false,
      retryDelayMs: null,
      reason: "No error provided",
    };
  }

  const statusCode = extractStatusCode(err);
  const details = extractErrorDetails(err);
  const msg = (err.message || "").toLowerCase();
  const retryDelayMs = extractRetryDelayMs(err);

  // Status string (e.g. "RESOURCE_EXHAUSTED", "PERMISSION_DENIED")
  const rawStatus = typeof err.status === "string"
    ? err.status
    : (typeof err.response?.error?.status === "string" ? err.response.error.status : "");
  const statusStr = rawStatus.toUpperCase();

  // 1. Permanent Client / Auth / Permission Errors
  if (
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusStr === "INVALID_ARGUMENT" ||
    statusStr === "PERMISSION_DENIED" ||
    statusStr === "NOT_FOUND" ||
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid") ||
    msg.includes("permission denied") ||
    msg.includes("billing has not been enabled")
  ) {
    return {
      category: GeminiErrorCategory.PERMANENT_ERROR,
      statusCode,
      isQuotaExhausted: false,
      isTransient: false,
      isPermanent: true,
      retryDelayMs: null,
      reason: "Permanent client, authentication, or permission error",
    };
  }

  // 2. Transient Network / Infrastructure / 503 Errors
  const isTimeout =
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    err.name === "GoogleGenerativeAIAbortError" ||
    /timeout|aborted|deadline exceeded/i.test(msg);

  const isTransport =
    (err.name === "TypeError" && msg.includes("fetch failed")) ||
    /econnreset|etimedout|enotfound|und_err_connect_timeout|und_err_socket|connection reset/i.test(msg);

  if (statusCode === 503 || statusCode === 504 || statusCode === 502 || isTimeout || isTransport) {
    return {
      category: GeminiErrorCategory.TRANSIENT_SERVICE,
      statusCode: statusCode || 503,
      isQuotaExhausted: false,
      isTransient: true,
      isPermanent: false,
      retryDelayMs: retryDelayMs || 500,
      reason: isTimeout ? "Request timed out" : isTransport ? "Network transport failure" : "Service temporarily unavailable (503)",
    };
  }

  // 3. Rate Limit / Quota Errors (HTTP 429 or RESOURCE_EXHAUSTED)
  if (statusCode === 429 || statusStr === "RESOURCE_EXHAUSTED" || msg.includes("429 too many requests") || msg.includes("resource_exhausted")) {
    // Check structured details for quota metric indicator
    let isDailyOrProjectQuota = false;
    let isPerMinuteRateLimit = false;

    // Check ErrorInfo metadata and QuotaFailure violations
    for (const item of details) {
      const reason = item?.reason || "";
      const metadata = item?.metadata || {};
      const quotaLimit = (metadata.quota_limit || "").toLowerCase();

      if (quotaLimit.includes("day") || quotaLimit.includes("daily") || quotaLimit.includes("project")) {
        isDailyOrProjectQuota = true;
      }
      if (quotaLimit.includes("minute") || quotaLimit.includes("rpm") || quotaLimit.includes("tpm")) {
        isPerMinuteRateLimit = true;
      }

      if (Array.isArray(item.violations)) {
        for (const v of item.violations) {
          const desc = (v.description || "").toLowerCase();
          if (desc.includes("day") || desc.includes("daily") || desc.includes("quota exceeded")) {
            isDailyOrProjectQuota = true;
          }
          if (desc.includes("minute") || desc.includes("per minute")) {
            isPerMinuteRateLimit = true;
          }
        }
      }
    }

    // Check message string heuristics for daily vs per-minute indications
    if (
      msg.includes("per day") ||
      msg.includes("perday") ||
      msg.includes("daily request limit") ||
      msg.includes("generatecontentrequestsperday") ||
      msg.includes("free tier limit reached for the day")
    ) {
      isDailyOrProjectQuota = true;
    }

    if (
      msg.includes("per minute") ||
      msg.includes("requests per minute") ||
      msg.includes("tokens per minute") ||
      msg.includes("rpm") ||
      msg.includes("tpm")
    ) {
      isPerMinuteRateLimit = true;
    }

    // Confirmed project daily quota exhaustion (eligible for failover)
    if (isDailyOrProjectQuota && !isPerMinuteRateLimit) {
      return {
        category: GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED,
        statusCode: 429,
        isQuotaExhausted: true,
        isTransient: false,
        isPermanent: false,
        retryDelayMs: null,
        reason: "Confirmed project daily/monthly quota exhaustion",
      };
    }

    // Explicit per-minute rate limit (retry with backoff, NOT failover)
    if (isPerMinuteRateLimit) {
      return {
        category: GeminiErrorCategory.TEMPORARY_RATE_LIMIT,
        statusCode: 429,
        isQuotaExhausted: false,
        isTransient: true,
        isPermanent: false,
        retryDelayMs: retryDelayMs || 2000,
        reason: "Short-term RPM/TPM rate limit; retry with backoff",
      };
    }

    // Ambiguous 429: Requirement 10.6 mandates that an ambiguous 429 does NOT automatically trigger failover.
    // It is classified as TEMPORARY_RATE_LIMIT to apply backoff first.
    return {
      category: GeminiErrorCategory.TEMPORARY_RATE_LIMIT,
      statusCode: 429,
      isQuotaExhausted: false,
      isTransient: true,
      isPermanent: false,
      retryDelayMs: retryDelayMs || 1000,
      reason: "Ambiguous 429 rate limit; treated as temporary rate limit (no immediate failover)",
    };
  }

  return {
    category: GeminiErrorCategory.UNKNOWN,
    statusCode,
    isQuotaExhausted: false,
    isTransient: false,
    isPermanent: false,
    retryDelayMs: null,
    reason: `Unclassified error: ${msg.slice(0, 100)}`,
  };
}
