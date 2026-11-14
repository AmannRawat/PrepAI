/**
 * Service Availability & Cold-Start Utilities
 * 
 * Provides detection, error classification, URL resolution, and state machine definitions
 * for Render free-tier multi-service cold starts (Node.js backend + FastAPI AI service).
 */

export const AVAILABILITY_STATE = {
  IDLE: 'IDLE',               // Initial state before health check begins
  CHECKING: 'CHECKING',       // In-flight active network health probe
  AVAILABLE: 'AVAILABLE',     // All required backend services are responsive
  CONNECTING: 'CONNECTING',   // Waiting on exponential backoff timer for next auto-retry
  UNAVAILABLE: 'UNAVAILABLE', // Automatic retries exhausted; demo server unavailable
  PAUSED: 'PAUSED',           // Automatic retry limit reached; waiting for manual user retry
};

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

  UNAVAILABLE_TITLE: 'Unable to connect to the demo server',
  UNAVAILABLE_MSG:
    'Our demo server is currently unavailable or taking longer than expected to start. Please try reconnecting.',
};

/**
 * Resolves the backend API base URL consistently across dev and production.
 * Prevents empty or malformed strings from causing requests to route into the Vite dev server.
 */
export function getApiBaseUrl() {
  const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : null;
  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // If running in browser on localhost or 127.0.0.1, default to Node on port 5000
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:5000`;
    }
  }

  return 'http://localhost:5000';
}

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
  const name = error?.name || '';
  const message = (error?.message || '').toLowerCase();

  if (
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('aborted')
  ) {
    return true;
  }

  return false;
}

/**
 * Safe diagnostic logging helper for service availability troubleshooting.
 * Never logs secrets, tokens, or sensitive headers.
 */
export function logAvailabilityDiagnostic(event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[PrepAI:Availability][${timestamp}] ${event}`, details);
}

/**
 * Computes exponential backoff delay with bounded jitter.
 * 
 * Progression:
 * Attempt 1: ~2.0s
 * Attempt 2: ~3.0s
 * Attempt 3: ~4.5s
 * Attempt 4: ~6.8s
 * Attempt 5: ~8.0s (capped at maxDelay)
 */
export function calculateBackoffDelay(
  attempt,
  baseDelayMs = 2000,
  multiplier = 1.5,
  maxDelayMs = 8000
) {
  const safeAttempt = Math.max(1, attempt);
  const rawDelay = baseDelayMs * Math.pow(multiplier, safeAttempt - 1);
  const cappedDelay = Math.min(rawDelay, maxDelayMs);

  // Add small deterministic jitter (±10%) to prevent lockstep thundering herds
  const jitterRange = cappedDelay * 0.1;
  const jitter = Math.sin(safeAttempt) * 0.5 * jitterRange;

  return Math.round(cappedDelay + jitter);
}

/**
 * Performs a lightweight health check against the Node backend's health probe.
 * 
 * @param {string} [baseUrl] - Backend API base URL (defaults to getApiBaseUrl())
 * @param {AbortSignal} [signal] - Optional caller abort signal (e.g., superseding manual retry)
 * @param {number} [timeoutMs=5000] - Bounded request timeout (defaults to 5000ms)
 * @returns {Promise<{ node: string, ai: string, raw: any, isAborted: boolean, isTimeout: boolean, error?: any }>}
 */
export async function probeServiceHealth(
  baseUrl,
  signal,
  timeoutMs = 5000,
  probeId = `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
) {
  const resolvedBase = baseUrl || getApiBaseUrl();
  const cleanBase = String(resolvedBase).replace(/\/+$/, '');
  const url = `${cleanBase}/api/health`;

  logAvailabilityDiagnostic('Health-check request preparing', { probeId, service: 'node', url });

  let didTimeout = false;
  const internalController = new AbortController();
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    logAvailabilityDiagnostic('Health-check request timed out', { probeId, timeoutMs });
    internalController.abort();
  }, timeoutMs);

  // Link caller signal if provided
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      logAvailabilityDiagnostic('Caller aborted request (already aborted)', { probeId });
      internalController.abort();
    } else {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        logAvailabilityDiagnostic('Caller aborted request', { probeId });
        internalController.abort();
      }, { once: true });
    }
  }

  logAvailabilityDiagnostic('Health-check request sent', { probeId, url, timeoutMs });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: internalController.signal,
    });

    clearTimeout(timeoutId);

    // If caller aborted while fetch was resolving, discard result immediately
    if (signal?.aborted) {
      logAvailabilityDiagnostic('Caller aborted request before response processing', { probeId });
      return {
        node: SERVICE_STATUS.STARTING,
        ai: SERVICE_STATUS.UNKNOWN,
        raw: null,
        isAborted: true,
        isTimeout: false,
      };
    }

    if (!res.ok) {
      logAvailabilityDiagnostic('Health-check request returned gateway error', { probeId, status: res.status });
      // 502/503 from Render reverse proxy indicates Node server is starting
      return {
        node: SERVICE_STATUS.STARTING,
        ai: SERVICE_STATUS.UNKNOWN,
        raw: null,
        isAborted: false,
        isTimeout: false,
      };
    }

    const data = await res.json();
    logAvailabilityDiagnostic('Health-check request succeeded', { probeId, status: res.status });

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
      isAborted: false,
      isTimeout: false,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    // If aborted explicitly by caller (e.g. superseding manual retry or unmount), propagate flag
    const isCallerAborted = Boolean(signal?.aborted);
    if (isCallerAborted) {
      logAvailabilityDiagnostic('Caller aborted request in catch', { probeId, error: err?.message || String(err) });
      return {
        node: SERVICE_STATUS.STARTING,
        ai: SERVICE_STATUS.UNKNOWN,
        raw: null,
        isAborted: true,
        isTimeout: false,
        error: err,
      };
    }

    logAvailabilityDiagnostic('Health-check request failed', {
      probeId,
      isTimeout: didTimeout,
      error: err?.message || String(err),
    });

    // Network error, connection refused, or request timeout (must NOT be treated as aborted)
    return {
      node: SERVICE_STATUS.STARTING,
      ai: SERVICE_STATUS.UNKNOWN,
      raw: null,
      isAborted: false,
      isTimeout: didTimeout,
      error: err,
    };
  }
}
