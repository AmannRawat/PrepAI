const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:9000";

export const AI_SERVICE_TIMEOUT_MS =
  parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 120000;

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
    `${AI_SERVICE_URL}/upload-pdf`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI service error: ${response.status} ${errorText}`
    );
  }

  return response.json();
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
    `${AI_SERVICE_URL}/rag?${params.toString()}`
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI service error: ${response.status} ${errorText}`
    );
  }

  return response.json();
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
    `${AI_SERVICE_URL}/interview`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

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

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI service error: ${response.status} ${errorText}`
    );
  }

  return response.json();
}

export async function extractMemories(
  question,
  answer,
  evaluation
) {
  const response = await fetch(
    `${AI_SERVICE_URL}/extract-memories`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        answer,
        evaluation,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `AI memory service error: ${response.status} ${errorText}`
    );
  }

  return response.json();
}

export async function startInterview(data) {
    const response = await fetch(
        `${AI_SERVICE_URL}/interview/start`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `AI interview service error: ${response.status} ${errorText}`
        );
    }

    return response.json();
}


export async function submitInterviewAnswer(
    sessionId,
    answer
) {
    const response = await fetch(
        `${AI_SERVICE_URL}/interview/${sessionId}/answer`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                answer,
            }),
            signal: AbortSignal.timeout(AI_SERVICE_TIMEOUT_MS),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `AI interview service error: ${response.status} ${errorText}`
        );
    }

    return response.json();
}