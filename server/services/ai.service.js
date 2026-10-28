/**
 * Express-to-FastAPI AI Service Client Bridge
 * 
 * Centralizes all HTTP communication between the Node.js backend and the Python FastAPI
 * AI microservice (RAG, Qdrant vector storage, LangGraph interview graphs).
 * 
 * Security & Reliability model:
 * - Authenticates requests using a shared secret header (`x-internal-service-key`).
 * - Guards long-running generative workflows with an explicit abort timeout (AI_SERVICE_TIMEOUT_MS).
 * - Standardizes FastAPI error responses (including `detail` JSON payloads) into typed AiServiceError instances.
 */

export function getAiServiceUrl() {
  const rawUrl = process.env.AI_SERVICE_URL || "http://localhost:9000";
  return rawUrl.trim().replace(/\/+$/, "");
}

/**
 * Normalizes and safely joins base AI service URL and endpoint path to prevent double-slash 404s.
 */
export function buildAiServiceUrl(path) {
  const baseUrl = getAiServiceUrl();
  const normalizedPath = "/" + String(path || "").replace(/^\/+/, "");
  return `${baseUrl}${normalizedPath}`;
}

export const AI_SERVICE_URL = getAiServiceUrl();

// 120s default timeout allows multi-step LangGraph graph execution (RAG retrieval + Gemini LLM generation) to complete
export const AI_SERVICE_TIMEOUT_MS =
  parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 120000;

export class AiServiceError extends Error {
  constructor(message, { status, endpoint, responseBody, details, retryAfter = null, headers = {} } = {}) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
    this.statusCode = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
    this.details = details;
    this.retryAfter = retryAfter;
    this.headers = headers;
    this.isRateLimited = status === 429;
  }
}

export function getAiServiceSecret() {
  const secret = process.env.AI_SERVICE_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error(
      "[Configuration Error] Missing required environment variable: AI_SERVICE_SECRET must be configured to communicate with AI services."
    );
  }
  return secret.trim();
}

// Injects the shared service-to-service key into every upstream request to prevent unauthorized public access
function getInternalHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  headers["x-internal-service-key"] = getAiServiceSecret();
  return headers;
}

// Unpacks successful responses as JSON or extracts structured error messages and rate-limiting metadata from upstream
export async function parseAiResponse(response, endpoint) {
  if (response.ok) {
    return response.json();
  }

  const errorText = await response.text();
  let details = null;

  try {
    details = JSON.parse(errorText);
  } catch {
    // Non-JSON response (e.g. plain text "Too Many Requests" from reverse proxies)
  }

  // Safely extract rate-limiting response headers without logging secrets or credentials
  const retryAfterHeader = response.headers?.get ? response.headers.get("retry-after") : null;
  let retryAfterSeconds = null;

  if (retryAfterHeader) {
    const parsedSeconds = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(parsedSeconds) && parsedSeconds >= 0) {
      retryAfterSeconds = parsedSeconds;
    } else {
      const parsedDate = new Date(retryAfterHeader).getTime();
      if (!Number.isNaN(parsedDate)) {
        retryAfterSeconds = Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
      }
    }
  }

  // Collect safe non-sensitive headers for structured diagnostics
  const safeHeaders = {};
  if (response.headers?.get) {
    for (const h of ["retry-after", "content-type", "server", "cf-ray", "x-render-origin-server"]) {
      const val = response.headers.get(h);
      if (val) safeHeaders[h] = val;
    }
  }

  // If status is 429 and upstream did not supply a Retry-After header, provide a safe default of 10s
  if (response.status === 429 && retryAfterSeconds === null) {
    retryAfterSeconds = 10;
  }

  const detailMsg = details?.detail || details?.error || details?.message || errorText;
  const cleanDetail = detailMsg ? ` - ${typeof detailMsg === "string" ? detailMsg : JSON.stringify(detailMsg)}` : "";
  const message = `AI service error: ${response.status}${cleanDetail}`;

  throw new AiServiceError(message, {
    status: response.status,
    endpoint,
    responseBody: errorText,
    details,
    retryAfter: retryAfterSeconds,
    headers: safeHeaders,
  });
}

export async function uploadResume(file, options = {}) {
  const formData = new FormData();

  const blob = new Blob(
    [file.buffer],
    {
      type: file.mimetype,
    }
  );

  formData.append(
    "file",
    blob,
    file.originalname
  );

  const customHeaders = {};
  const correlationId = options.correlationId || options.requestId;
  if (correlationId) {
    customHeaders["x-correlation-id"] = correlationId;
    customHeaders["x-request-id"] = correlationId;
  }

  const response = await fetch(
    buildAiServiceUrl("/upload-pdf"),
    {
      method: "POST",
      headers: getInternalHeaders(customHeaders),
      body: formData,
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, "/upload-pdf");
}

export async function retrieveResumeContext(
  query,
  documentId,
  options = {}
) {
  const params = new URLSearchParams({
    query,
    document_id: documentId,
  });

  const customHeaders = {};
  const correlationId = options.correlationId || options.requestId;
  if (correlationId) {
    customHeaders["x-correlation-id"] = correlationId;
    customHeaders["x-request-id"] = correlationId;
  }

  const response = await fetch(
    buildAiServiceUrl(`/rag?${params.toString()}`),
    {
      headers: getInternalHeaders(customHeaders),
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, "/rag");
}

export async function generateInterviewResponse(
  documentId,
  question,
  answer,
  targetRole,
  targetCompany,
  useResumeContext,
  memoryContext
) {
  const response = await fetch(
    buildAiServiceUrl("/interview"),
    {
      method: "POST",
      headers: getInternalHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        document_id: documentId,
        question,
        answer,
        target_role: targetRole,
        target_company: targetCompany,
        use_resume_context: useResumeContext,
        memory_context: memoryContext,
      }),
    }
  );

  return parseAiResponse(response, "/interview");
}

export async function extractMemories(
  question,
  answer,
  evaluation
) {
  const response = await fetch(
    buildAiServiceUrl("/extract-memories"),
    {
      method: "POST",
      headers: getInternalHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        question,
        answer,
        evaluation,
      }),
    }
  );

  return parseAiResponse(response, "/extract-memories");
}

export async function startInterview(data, options = {}) {
  const customHeaders = {
    "Content-Type": "application/json",
  };
  const correlationId = options.correlationId || options.requestId;
  if (correlationId) {
    customHeaders["x-correlation-id"] = correlationId;
    customHeaders["x-request-id"] = correlationId;
  }

  const response = await fetch(
    buildAiServiceUrl("/interview/start"),
    {
      method: "POST",
      headers: getInternalHeaders(customHeaders),
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, "/interview/start");
}

export async function submitInterviewAnswer(
  sessionId,
  answer,
  options = {}
) {
  const customHeaders = {
    "Content-Type": "application/json",
  };
  const correlationId = options.correlationId || options.requestId;
  if (correlationId) {
    customHeaders["x-correlation-id"] = correlationId;
    customHeaders["x-request-id"] = correlationId;
  }

  const response = await fetch(
    buildAiServiceUrl(`/interview/${sessionId}/answer`),
    {
      method: "POST",
      headers: getInternalHeaders(customHeaders),
      body: JSON.stringify({
        answer,
      }),
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, `/interview/${sessionId}/answer`);
}