/**
 * Service Availability & Cold-Start Utilities
 * 
 * Provides detection, error classification, and controlled backoff calculation
 * for Render free-tier multi-service cold starts (Node.js backend + FastAPI AI service).
 */

export const SERVICE_STATUS = {
  UNKNOWN: 'unknown',
  AVAILABLE: 'available',
  STARTING: 'starting',
  UNAVAILABLE: 'unavailable',
};

export const RECRUITER_MESSAGES = {
  NODE_STARTING_TITLE: 'Our demo server is waking up',
  NODE_STARTING_MSG:
    "PrepAI's free demo server may take a moment to start after inactivity. We're establishing a connection. Thanks for your patience.",

  AI_STARTING_TITLE: 'AI services are starting',
  AI_STARTING_MSG:
    'The application is available, but our AI processing service is temporarily starting up. Your session is safe. Please try again shortly.',

  BOTH_STARTING_TITLE: 'Demo environment is starting',
  BOTH_STARTING_MSG:
    "PrepAI's free demo servers are waking up after inactivity. Both the application server and AI service are initializing. Thanks for your patience.",
};

/**
 * Endpoint paths that proxy to or require the Python FastAPI AI service.
 */
const AI_ENDPOINT_PATTERNS = [
  /\/api\/interview(\/|$)/,
  /\/api\/behavioral-chat(\/|$)/,
  /\/api\/upload-resume(\/|$)/,
];

/**
 * Checks if a given request URL targets an AI-dependent service endpoint.
 */
export function isAiEndpoint(url) {
  if (!url || typeof url !== 'string') return false;
  return AI_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Checks if an error represents an authentication failure (401 or 403).
 * Authentication errors MUST NEVER be classified as service downtime.
 */
export function isAuthError(error) {
  const status = error?.response?.status || error?.status;
  return status === 401 || status === 403;
}

/**
 * Checks if an error indicates that a backend service is sleeping,
 * cold-starting, or temporarily unreachable.
 * 
 * Matches:
 * - Render cold-start gateway errors (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
 * - Browser network errors (ERR_NETWORK, Network Error, Failed to fetch)
 * - Abort / client connection timeouts (ECONNABORTED, TimeoutError)
 */
export function isColdStartError(error) {
  if (!error) return false;

  // Rule 1: Auth errors are application errors, never service downtime
  if (isAuthError(error)) return false;

  // Rule 2: Client validation or bad request (400, 404, 422) is not downtime
  const status = error?.response?.status || error?.status;
  if (status && status >= 400 && status < 500 && status !== 408) {
    return false;
  }

  // Rule 3: Upstream gateway or service unavailable
  if (status === 502 || status === 503 || status === 504) {
    return true;
  }

  // Rule 4: Network transport failure or connection dropped
  const code = error?.code || '';
  const message = (error?.message || '').toLowerCase();

  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes exponential backoff delay with bounded jitter.
 * 
 * Progression:
 * Attempt 1: ~3.0s
 * Attempt 2: ~4.8s
 * Attempt 3: ~7.6s
 * Attempt 4: ~12.0s
 * Attempt 5: ~15.0s (capped at maxDelay)
 * 
 * @param {number} attempt - 1-based retry attempt number
 * @param {number} baseDelayMs - Base delay in milliseconds (default: 3000ms)
 * @param {number} multiplier - Exponential growth factor (default: 1.6)
 * @param {number} maxDelayMs - Maximum delay cap (default: 15000ms)
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt,
  baseDelayMs = 3000,
  multiplier = 1.6,
  maxDelayMs = 15000
) {
  const safeAttempt = Math.max(1, attempt);
  const rawDelay = baseDelayMs * Math.pow(multiplier, safeAttempt - 1);
  const cappedDelay = Math.min(rawDelay, maxDelayMs);

  // Add small deterministic jitter (±10%) to prevent lockstep thundering herds
  const jitterRange = cappedDelay * 0.1;
  const jitter = (Math.sin(safeAttempt) * 0.5) * jitterRange;

  return Math.round(cappedDelay + jitter);
}

/**
 * Performs a lightweight health check against the Node backend's health probe.
 * 
 * @param {string} baseUrl - Backend API base URL
 * @param {AbortSignal} [signal] - Optional abort signal
 * @param {number} [timeoutMs=8000] - Request timeout
 * @returns {Promise<{ node: string, ai: string, raw: any }>}
 */
export async function probeServiceHealth(
  baseUrl = import.meta.env.VITE_API_URL || '',
  signal,
  timeoutMs = 8000
) {
  const cleanBase = String(baseUrl).replace(/\/+$/, '');
  const url = `${cleanBase}/api/health`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Link caller signal if provided
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // 502/503 from Render reverse proxy indicates Node server is starting
      return {
        node: SERVICE_STATUS.STARTING,
        ai: SERVICE_STATUS.UNKNOWN,
        raw: null,
      };
    }

    const data = await res.json();
    const nodeStatus =
      data?.services?.node?.status === 'available' || data?.services?.node?.available
        ? SERVICE_STATUS.AVAILABLE
        : SERVICE_STATUS.STARTING;

    const aiStatus =
      data?.services?.ai?.status === 'available' || data?.services?.ai?.available
        ? SERVICE_STATUS.AVAILABLE
        : SERVICE_STATUS.STARTING;

    return {
      node: nodeStatus,
      ai: aiStatus,
      raw: data,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // If fetch failed completely, Node server is unreachable (cold-starting or down)
    return {
      node: SERVICE_STATUS.STARTING,
      ai: SERVICE_STATUS.UNKNOWN,
      raw: null,
      error: err,
    };
  }
}

