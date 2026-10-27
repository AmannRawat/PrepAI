/**
 * PrepAI Centralized HTTP Client & In-Flight Request Deduplication
 * 
 * Provides:
 * 1. Safe in-flight deduplication for identical concurrent GET requests
 *    - Eliminates duplicate requests from React StrictMode & multi-component mounts
 *    - Strict auth/user scoping to prevent cross-user data leakage
 *    - Automatically removes finished/failed requests from in-flight map
 * 2. Short-lived, bounded in-memory cache for safe read-only metadata:
 *    - /api/user/preferences (TTL: 60s)
 *    - /api/user/study-plan (TTL: 60s)
 *    - /api/interview/resume-status (TTL: 60s)
 *    - /api/user/progress (TTL: 30s)
 *    - /api/resume/my-resumes (TTL: 60s)
 * 3. Automatic cache invalidation upon non-GET mutations (POST/PUT/PATCH/DELETE)
 * 4. Graceful HTTP 429 (Rate Limit) handling with Retry-After normalization
 */

import axios from 'axios';

// ============================================================================
// IN-FLIGHT DEDUPLICATION & CACHING STORAGE
// ============================================================================

// Map<key, Promise<AxiosResponse>>
const inFlightRequests = new Map();

// Map<key, { data: any, status: number, statusText: string, headers: any, expiresAt: number }>
const responseCache = new Map();
const MAX_CACHE_ENTRIES = 100;

// Configured cacheable endpoints with bounded TTLs
export const CACHEABLE_ENDPOINTS = [
  { pattern: /\/api\/user\/preferences(\?|$)/, ttl: 60 * 1000 },
  { pattern: /\/api\/user\/study-plan(\?|$)/, ttl: 60 * 1000 },
  { pattern: /\/api\/interview\/resume-status(\?|$)/, ttl: 60 * 1000 },
  { pattern: /\/api\/user\/progress(\?|$)/, ttl: 30 * 1000 },
  { pattern: /\/api\/resume\/my-resumes(\?|$)/, ttl: 60 * 1000 },
  { pattern: /\/api\/my-resumes(\?|$)/, ttl: 60 * 1000 },
];

/**
 * Deterministically sorts object keys for stable URL param hashing.
 */
function sortParams(params) {
  if (!params || typeof params !== 'object') return '';
  try {
    const keys = Object.keys(params).sort();
    const sorted = {};
    for (const key of keys) {
      if (params[key] !== undefined) {
        sorted[key] = params[key];
      }
    }
    return JSON.stringify(sorted);
  } catch {
    return String(params);
  }
}

/**
 * Extracts a normalized user authentication scope from request headers.
 * Guarantees that unauthenticated callers, User A, and User B never share responses.
 */
function extractAuthScope(config) {
  const headers = config.headers || {};
  const authHeader =
    headers.Authorization ||
    headers.authorization ||
    (typeof headers.get === 'function' ? headers.get('Authorization') || headers.get('authorization') : null);

  if (typeof authHeader === 'string' && authHeader.trim() !== '') {
    // Hash or prefix token to isolate user context without exposing raw token in keys
    const trimmed = authHeader.trim();
    return `auth:${trimmed.slice(-24)}`;
  }

  return 'anon';
}

/**
 * Builds a deterministic key for in-flight requests and cached entries.
 */
export function buildRequestKey(config) {
  const method = (config.method || 'get').toUpperCase();
  const url = config.url || '';
  const paramsStr = sortParams(config.params);
  const authScope = extractAuthScope(config);

  return `${authScope}|${method}|${url}|${paramsStr}`;
}

/**
 * Deep clones data to ensure different callers do not mutate shared state.
 */
function cloneData(data) {
  if (data === undefined || data === null) return data;
  if (typeof data !== 'object') return data;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

/**
 * Clones an Axios response object with cloned data.
 */
function cloneResponse(res) {
  return {
    ...res,
    data: cloneData(res.data),
  };
}

/**
 * Checks if a GET endpoint is eligible for read-only caching.
 */
function getCacheTTL(url) {
  if (!url) return 0;
  for (const item of CACHEABLE_ENDPOINTS) {
    if (item.pattern.test(url)) {
      return item.ttl;
    }
  }
  return 0;
}

/**
 * Safely invalidates cache entries matching a regex pattern or resource key.
 */
export function invalidateApiCache(patternOrPrefix) {
  if (!patternOrPrefix) return;
  const regex = typeof patternOrPrefix === 'string'
    ? new RegExp(patternOrPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    : patternOrPrefix;

  for (const key of responseCache.keys()) {
    if (regex.test(key)) {
      responseCache.delete(key);
    }
  }
}

/**
 * Completely clears all in-memory cache and in-flight maps (useful on logout / testing).
 */
export function clearApiCache() {
  responseCache.clear();
  inFlightRequests.clear();
}

/**
 * Prunes expired cache entries to keep memory bounded.
 */
function pruneExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }
  // Enforce max entry limit
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const excess = responseCache.size - MAX_CACHE_ENTRIES;
    const iterator = responseCache.keys();
    for (let i = 0; i < excess; i++) {
      const nextKey = iterator.next().value;
      if (nextKey) responseCache.delete(nextKey);
    }
  }
}

/**
 * Automatically invalidates relevant caches upon successful mutations.
 */
function handleMutationInvalidation(config) {
  const url = config.url || '';
  const method = (config.method || 'get').toUpperCase();

  if (method === 'GET') return;

  // Invalidate preferences on career updates
  if (/\/api\/user\/preferences/.test(url)) {
    invalidateApiCache('/api/user/preferences');
  }

  // Invalidate study plan on plan updates or coach adjustments
  if (/\/api\/user\/study-plan/.test(url)) {
    invalidateApiCache('/api/user/study-plan');
  }

  // Invalidate resumes & resume status on upload or preferred toggle
  if (
    /\/api\/resume\/preferred/.test(url) ||
    /\/api\/preferred/.test(url) ||
    /\/api\/interview\/upload-resume/.test(url) ||
    /\/api\/review-resume/.test(url)
  ) {
    invalidateApiCache('/api/resume/my-resumes');
    invalidateApiCache('/api/my-resumes');
    invalidateApiCache('/api/interview/resume-status');
    invalidateApiCache('/api/review-resume/latest');
  }

  // Invalidate user progress & calendar on activity logging or evaluation
  if (
    /\/api\/user\/record-activity/.test(url) ||
    /\/api\/evaluate-code/.test(url) ||
    /\/api\/review-resume/.test(url) ||
    /\/api\/interview\/[a-zA-Z0-9_-]+\/answer/.test(url)
  ) {
    invalidateApiCache('/api/user/progress');
    invalidateApiCache('/api/user/calendar');
    invalidateApiCache('/api/user/dsa-stats');
  }
}

// ============================================================================
// AXIOS ADAPTER WRAPPER (IN-FLIGHT DEDUPLICATION + CACHING)
// ============================================================================

// Resolve original underlying adapter from Axios
const defaultAdapter = typeof axios.defaults.adapter === 'function'
  ? axios.defaults.adapter
  : (axios.getAdapter ? axios.getAdapter(axios.defaults.adapter) : null);

let customNetworkHandler = null;

/**
 * Testing helper allowing test suites to mock underlying network dispatch
 * without overriding or disconnecting the caching and deduplication wrapper.
 */
export function setNetworkHandlerForTesting(handler) {
  customNetworkHandler = handler;
}

if (defaultAdapter) {
  axios.defaults.adapter = async function prepAiCustomAdapter(config) {
    const method = (config.method || 'get').toUpperCase();
    const executeNetwork = customNetworkHandler || defaultAdapter;

    // 1. Non-GET requests: NEVER deduplicate, NEVER return from cache
    if (method !== 'GET') {
      try {
        const response = await executeNetwork(config);
        handleMutationInvalidation(config);
        return response;
      } catch (err) {
        throw err;
      }
    }

    const requestKey = buildRequestKey(config);
    const ttl = getCacheTTL(config.url);
    const now = Date.now();

    // 2. Cache Lookup (unless caller explicitly requested skipCache: true)
    if (ttl > 0 && !config.skipCache) {
      const cached = responseCache.get(requestKey);
      if (cached && cached.expiresAt > now) {
        return cloneResponse({
          data: cached.data,
          status: cached.status,
          statusText: cached.statusText,
          headers: { ...cached.headers, 'x-prepai-cache': 'HIT' },
          config,
          request: {},
        });
      } else if (cached) {
        responseCache.delete(requestKey);
      }
    }

    // 3. In-Flight Deduplication for Concurrent GETs
    if (inFlightRequests.has(requestKey)) {
      const sharedPromise = inFlightRequests.get(requestKey);
      return sharedPromise.then(cloneResponse);
    }

    // 4. Dispatch Network Request
    const networkPromise = (async () => {
      try {
        const response = await executeNetwork(config);

        // Store in cache if endpoint is eligible
        if (ttl > 0 && response.status >= 200 && response.status < 300) {
          pruneExpiredCache();
          responseCache.set(requestKey, {
            data: cloneData(response.data),
            status: response.status,
            statusText: response.statusText,
            headers: response.headers || {},
            expiresAt: Date.now() + ttl,
          });
        }

        return response;
      } finally {
        // Crucial: In-flight promise is ALWAYS removed whether resolved or rejected
        inFlightRequests.delete(requestKey);
      }
    })();

    inFlightRequests.set(requestKey, networkPromise);
    return networkPromise.then(cloneResponse);
  };
}

// ============================================================================
// GLOBAL RESPONSE INTERCEPTOR (429 & ERROR HANDLING)
// ============================================================================

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      const data = error.response.data;
      const retryAfterHeader = error.response.headers?.['retry-after'];
      const retryAfterSeconds = Number(data?.retryAfter || retryAfterHeader) || 60;

      const serverMessage = data?.message || data?.error;
      const friendlyMessage = serverMessage
        ? `${serverMessage} (Retry in ${retryAfterSeconds}s)`
        : `Rate limit reached. Please wait ${retryAfterSeconds} seconds before trying again.`;

      // Normalize response error text so existing catch handlers display it cleanly
      if (error.response.data && typeof error.response.data === 'object') {
        error.response.data.message = friendlyMessage;
        error.response.data.error = friendlyMessage;
        error.response.data.retryAfter = retryAfterSeconds;
      }
      error.message = friendlyMessage;
    }

    return Promise.reject(error);
  }
);

export default axios;
