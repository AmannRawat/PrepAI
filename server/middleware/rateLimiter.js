/**
 * PrepAI Production-Aware Rate Limiting Middleware
 * 
 * Provides memory-efficient sliding-window rate limiting with:
 * - Verified Clerk user identity keying (when authenticated)
 * - Safe IP fallback (honoring Express trust-proxy configuration)
 * - Granular tiers (General API, Expensive AI, Resume Analysis, Interview Starts, Auth)
 * - Standard RFC 6585 & IETF headers (Retry-After, RateLimit-*)
 * - Periodic cleanup of expired window buckets to prevent memory leaks
 * - Privacy-safe logging (no sensitive user data, PII, or raw tokens logged)
 */

import express from "express";
import { getAuth } from "@clerk/express";

/**
 * Safely parses and validates the TRUST_PROXY configuration value for Express.
 * 
 * Supports:
 * - Boolean / boolean strings: "false", "true", "0", "1", "off", "on", "no", "yes"
 * - Integer hop counts: 1, 2, "1", "2" (positive integers)
 * - Subnet / IP address strings and keywords: "loopback", "linklocal", "uniquelocal", or comma-separated IPs
 * 
 * Throws a descriptive configuration error if an invalid value is supplied.
 * 
 * @param {string|boolean|number|undefined} val
 * @returns {boolean|number|string} Safe value for Express app.set('trust proxy', value)
 */
export function parseTrustProxy(val) {
  if (val === undefined || val === null) {
    return false;
  }

  if (typeof val === "boolean") {
    return val;
  }

  if (typeof val === "string" && val.trim() === "") {
    return false;
  }

  if (typeof val === "number") {
    if (Number.isInteger(val) && val >= 0) {
      return val === 0 ? false : val;
    }
    throw new Error(
      `[Configuration Error] Invalid TRUST_PROXY number "${val}". Expected a non-negative integer hop count.`
    );
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();

    if (["false", "0", "off", "no"].includes(lower)) {
      return false;
    }
    if (["true", "on", "yes"].includes(lower)) {
      return true;
    }

    // Check if it's a numeric hop count
    if (/^\d+$/.test(trimmed)) {
      const hops = parseInt(trimmed, 10);
      return hops === 0 ? false : hops;
    }

    // Subnets or keywords (e.g. "loopback", "10.0.0.0/8", "127.0.0.1, 10.0.0.1")
    // Validate by testing against Express's proxy-addr compiler
    try {
      const dummyApp = express();
      dummyApp.set("trust proxy", trimmed);
      return trimmed;
    } catch (compileErr) {
      throw new Error(
        `[Configuration Error] Invalid TRUST_PROXY value "${val}". Expected boolean (true/false), integer hop count (e.g. 1), or valid IP/subnet (e.g. "loopback, 10.0.0.0/8"). Reason: ${compileErr.message}`
      );
    }
  }

  throw new Error(
    `[Configuration Error] Invalid TRUST_PROXY type "${typeof val}". Expected string, boolean, or number.`
  );
}

// Storage for active rate-limiting windows: Map<limiterName, Map<key, number[]>>
const limitersStore = new Map();

/**
 * Normalizes client IP address from request.
 * Respects Express 'trust proxy' setting. If trust proxy is disabled,
 * uses direct socket remote address and never trusts spoofed headers.
 */
export function getClientIp(req) {
  const isProxyTrusted = Boolean(req.app && req.app.get("trust proxy"));
  let ip = "";

  if (isProxyTrusted) {
    ip = req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress;
  } else {
    ip = req.socket?.remoteAddress || req.ip || "127.0.0.1";
  }

  // Normalize IPv6 loopback and mapped IPv4
  if (ip === "::1" || ip === "::ffff:127.0.0.1") {
    return "127.0.0.1";
  }
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Resolves a rate-limit key for the request.
 * Prioritizes verified authentication identity (Clerk userId or MongoDB user id).
 * Falls back to normalized client IP for unauthenticated callers.
 */
export function resolveRateLimitKey(req) {
  // 1. Check verified Clerk session identity
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      return `user:${auth.userId}`;
    }
  } catch {
    // getAuth may throw if clerkMiddleware has not run yet; continue to fallbacks
  }

  // 2. Check already attached user from authMiddleware
  if (req.user?.clerkUserId) {
    return `user:${req.user.clerkUserId}`;
  }
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  // 3. Fallback to client IP
  const ip = getClientIp(req);
  return `ip:${ip}`;
}

/**
 * Factory to create a sliding-window rate limiter middleware.
 * 
 * @param {Object} options
 * @param {string} options.name - Unique identifier for the limiter bucket
 * @param {number} options.windowMs - Window duration in milliseconds
 * @param {number} options.max - Maximum allowed requests in the window
 * @param {string} [options.message] - Custom user-facing error message
 * @param {Function} [options.keyGenerator] - Optional custom key resolution function
 * @param {Function} [options.skip] - Optional filter function to bypass limiter
 */
export function createRateLimiter(options) {
  const {
    name,
    windowMs,
    max,
    message,
    keyGenerator = resolveRateLimitKey,
    skip = () => false,
  } = options;

  if (!limitersStore.has(name)) {
    limitersStore.set(name, new Map());
  }
  const buckets = limitersStore.get(name);

  return function rateLimiterMiddleware(req, res, next) {
    if (typeof skip === "function" && skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Retrieve or initialize timestamp list for this key
    let timestamps = buckets.get(key);
    if (!timestamps) {
      timestamps = [];
      buckets.set(key, timestamps);
    }

    // Sliding window prune: discard timestamps outside current window
    while (timestamps.length > 0 && timestamps[0] <= windowStart) {
      timestamps.shift();
    }

    // Check limit
    if (timestamps.length >= max) {
      const oldestTimestamp = timestamps[0];
      const resetTimeMs = oldestTimestamp + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
      const resetEpochSeconds = Math.ceil(resetTimeMs / 1000);

      // Set standard RFC 6585 / IETF rate-limit headers
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("RateLimit-Reset", String(resetEpochSeconds));

      // Privacy-safe logging (masks specific identities, reports route & limiter)
      const sanitizedKeyPrefix = key.startsWith("user:")
        ? `user:${key.slice(5, 9)}***`
        : `ip:${key.slice(3, 7)}***`;
      console.warn(`[RateLimit] 429 Too Many Requests: limiter=${name} target=${req.baseUrl || ""}${req.path} key=${sanitizedKeyPrefix} retryAfter=${retryAfterSeconds}s`);

      return res.status(429).json({
        error: "Too Many Requests",
        message: message || `Rate limit exceeded. Please wait ${retryAfterSeconds} seconds before trying again.`,
        retryAfter: retryAfterSeconds,
        limit: max,
        remaining: 0,
        resetTime: resetEpochSeconds,
      });
    }

    // Record request timestamp
    timestamps.push(now);

    const remaining = Math.max(0, max - timestamps.length);
    const resetEpochSeconds = Math.ceil((now + windowMs) / 1000);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetEpochSeconds));

    next();
  };
}

/**
 * Periodically cleans up expired keys across all rate limiters to prevent memory leaks.
 */
function cleanupExpiredBuckets() {
  const now = Date.now();
  for (const [name, buckets] of limitersStore.entries()) {
    // Determine the window for this limiter by checking if there's any active entry
    for (const [key, timestamps] of buckets.entries()) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < now - 3600000) {
        buckets.delete(key);
      }
    }
  }
}

// Run cleanup every 5 minutes (unref ensures this timer does not prevent process exit)
const cleanupInterval = setInterval(cleanupExpiredBuckets, 5 * 60 * 1000);
if (typeof cleanupInterval.unref === "function") {
  cleanupInterval.unref();
}

/**
 * Testing & maintenance helper: clears all in-memory rate limit buckets.
 */
export function resetAllRateLimits() {
  for (const buckets of limitersStore.values()) {
    buckets.clear();
  }
}

/**
 * Safely parses integer environment variables with positive validation and alias support.
 * Warns if an invalid value or alias is detected, preventing silent misconfiguration.
 * 
 * @param {string} canonicalName - The primary standard environment variable name
 * @param {string[]} aliases - Alternative names accepted for backwards compatibility
 * @param {number} defaultValue - Default numeric value if unconfigured
 * @returns {number}
 */
export function parseConfigInt(canonicalName, aliases = [], defaultValue) {
  const rawValue = process.env[canonicalName];
  if (rawValue !== undefined && rawValue !== "") {
    const parsed = parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.warn(
        `[RateLimit Config Warning] Invalid value "${rawValue}" for ${canonicalName}. Must be a positive integer. Using default: ${defaultValue}`
      );
      return defaultValue;
    }
    return parsed;
  }

  // Check aliases to support backwards compatibility and prevent silent misconfiguration
  for (const alias of aliases) {
    const aliasVal = process.env[alias];
    if (aliasVal !== undefined && aliasVal !== "") {
      const parsed = parseInt(aliasVal, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        console.warn(
          `[RateLimit Config Warning] Invalid value "${aliasVal}" for alias ${alias}. Using default: ${defaultValue}`
        );
        return defaultValue;
      }
      console.warn(
        `[RateLimit Config Notice] Environment variable "${alias}" is recognized as an alias for "${canonicalName}". Please update to canonical name "${canonicalName}".`
      );
      return parsed;
    }
  }

  return defaultValue;
}

// ============================================================================
// PRE-CONFIGURED PRODUCTION RATE LIMITERS
// ============================================================================

/**
 * Dedicated endpoints covered by specialized, tight rate limiters:
 * - expensiveAiLimiter: /api/generate-problem, /api/evaluate-code, /api/hint, /api/explain-approach, /api/show-solution, /api/coach-chat, /api/behavioral-chat
 * - resumeReviewLimiter: /api/review-resume, /api/resume/review-resume, /api/interview/upload-resume
 * - interviewStartLimiter: /api/interview/start
 */
const DEDICATED_RATELIMIT_ROUTES = new Set([
  "/api/generate-problem",
  "/api/evaluate-code",
  "/api/hint",
  "/api/explain-approach",
  "/api/show-solution",
  "/api/coach-chat",
  "/api/behavioral-chat",
  "/api/review-resume",
  "/api/resume/review-resume",
  "/api/interview/upload-resume",
  "/api/interview/start",
]);

export function isDedicatedRateLimitedRoute(req) {
  const method = (req.method || "GET").toUpperCase();
  // Only state-changing / heavy operations on these endpoints trigger the specialized limiters
  if (method !== "POST") return false;

  const path = req.path || "";
  const fullPath = (req.baseUrl || "") + path;
  return DEDICATED_RATELIMIT_ROUTES.has(path) || DEDICATED_RATELIMIT_ROUTES.has(fullPath);
}

/**
 * General API Limiter:
 * Default: 100 requests per 15 minutes per authenticated user / IP.
 * Exempts internal health probes (`/` and `/ping`) and routes covered by dedicated specialized limiters.
 */
export const generalLimiter = createRateLimiter({
  name: "general-api",
  windowMs: parseConfigInt("RATE_LIMIT_GENERAL_WINDOW_MS", ["RATE_LIMIT_WINDOW_MS"], 15 * 60 * 1000), // 15 mins
  max: parseConfigInt("RATE_LIMIT_GENERAL_MAX", ["RATE_LIMIT_MAX_REQUESTS"], 100),
  message: "Too many requests to PrepAI API. Please slow down and try again shortly.",
  skip: (req) => {
    // Never throttle root health checks or ping probes
    const path = req.path;
    if (path === "/" || path === "/ping" || path === "/health") {
      return true;
    }
    // Skip dedicated AI & expensive operations covered by specialized limiters
    // to prevent double-counting against the general navigation quota
    return isDedicatedRateLimitedRoute(req);
  },
});

/**
 * Expensive AI Operations Limiter:
 * Applied to DSA problem generation, code evaluation, hint, solution, coach chat, behavioral chat.
 * Default: 10 requests per minute per authenticated user.
 */
export const expensiveAiLimiter = createRateLimiter({
  name: "expensive-ai",
  windowMs: parseConfigInt("RATE_LIMIT_AI_WINDOW_MS", ["RATE_LIMIT_EXPENSIVE_WINDOW_MS"], 60 * 1000), // 1 min
  max: parseConfigInt("RATE_LIMIT_AI_MAX", ["RATE_LIMIT_EXPENSIVE_MAX_REQUESTS"], 10),
  message: "AI request quota reached. Please wait a minute before requesting another AI problem or explanation.",
});

/**
 * Resume Analysis Limiter:
 * Applied to PDF resume uploads and ATS scoring analysis.
 * Default: 3 requests per 10 minutes per authenticated user.
 */
export const resumeReviewLimiter = createRateLimiter({
  name: "resume-review",
  windowMs: parseConfigInt("RATE_LIMIT_RESUME_WINDOW_MS", [], 10 * 60 * 1000), // 10 mins
  max: parseConfigInt("RATE_LIMIT_RESUME_MAX", ["RATE_LIMIT_RESUME_MAX_REQUESTS"], 3),
  message: "Resume review limit reached (maximum 3 reviews per 10 minutes). Please wait before uploading another resume.",
});

/**
 * Interview Start Limiter:
 * Applied to starting a new LangGraph interview session.
 * Default: 5 new interviews per 10 minutes per authenticated user.
 * Note: Follow-up answer turns (/:sessionId/answer) are NOT blocked by this limiter.
 */
export const interviewStartLimiter = createRateLimiter({
  name: "interview-start",
  windowMs: parseConfigInt("RATE_LIMIT_INTERVIEW_START_WINDOW_MS", ["RATE_LIMIT_INTERVIEW_WINDOW_MS"], 10 * 60 * 1000), // 10 mins
  max: parseConfigInt("RATE_LIMIT_INTERVIEW_START_MAX", ["RATE_LIMIT_INTERVIEW_MAX_REQUESTS"], 5),
  message: "Interview initiation limit reached. You can start up to 5 new interview sessions every 10 minutes.",
});

/**
 * Authentication Limiter:
 * Applied to any legacy or direct login/signup endpoints.
 * Default: 10 attempts per 15 minutes per IP.
 */
export const authLimiter = createRateLimiter({
  name: "auth-attempts",
  windowMs: parseConfigInt("RATE_LIMIT_AUTH_WINDOW_MS", [], 15 * 60 * 1000), // 15 mins
  max: parseConfigInt("RATE_LIMIT_AUTH_MAX", ["RATE_LIMIT_AUTH_MAX_REQUESTS"], 10),
  message: "Too many authentication attempts. Please wait 15 minutes before trying again.",
  keyGenerator: (req) => `auth-ip:${getClientIp(req)}`,
});
