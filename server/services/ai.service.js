export function getAiServiceUrl() {
  const rawUrl = process.env.AI_SERVICE_URL || "http://localhost:9000";
  return rawUrl.trim().replace(/\/+$/, "");
}

export const AI_SERVICE_URL = getAiServiceUrl();

export const AI_SERVICE_TIMEOUT_MS =
  parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 120000;

export class AiServiceError extends Error {
  constructor(message, { status, endpoint, responseBody, details } = {}) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
    this.statusCode = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
    this.details = details;
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

function getInternalHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  headers["x-internal-service-key"] = getAiServiceSecret();
  return headers;
}

async function parseAiResponse(response, endpoint) {
  if (response.ok) {
    return response.json();
  }

  const errorText = await response.text();
  let details = null;

  try {
    details = JSON.parse(errorText);
  } catch {
    // Non-JSON response
  }

  const detailMsg = details?.detail || details?.error || details?.message || errorText;
  const cleanDetail = detailMsg ? ` - ${typeof detailMsg === "string" ? detailMsg : JSON.stringify(detailMsg)}` : "";
  const message = `AI service error: ${response.status}${cleanDetail}`;

  throw new AiServiceError(message, {
    status: response.status,
    endpoint,
    responseBody: errorText,
    details,
  });
}

export async function uploadResume(file) {
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

  const response = await fetch(
    `${getAiServiceUrl()}/upload-pdf`,
    {
      method: "POST",
      headers: getInternalHeaders(),
      body: formData,
    }
  );

  return parseAiResponse(response, "/upload-pdf");
}

export async function retrieveResumeContext(
  query,
  documentId
) {
  const params = new URLSearchParams({
    query,
    document_id: documentId,
  });

  const response = await fetch(
    `${getAiServiceUrl()}/rag?${params.toString()}`,
    {
      headers: getInternalHeaders(),
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
    `${getAiServiceUrl()}/interview`,
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
    `${getAiServiceUrl()}/extract-memories`,
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

export async function startInterview(data) {
  const response = await fetch(
    `${getAiServiceUrl()}/interview/start`,
    {
      method: "POST",
      headers: getInternalHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, "/interview/start");
}

export async function submitInterviewAnswer(
  sessionId,
  answer
) {
  const response = await fetch(
    `${getAiServiceUrl()}/interview/${sessionId}/answer`,
    {
      method: "POST",
      headers: getInternalHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        answer,
      }),
      signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
    }
  );

  return parseAiResponse(response, `/interview/${sessionId}/answer`);
}