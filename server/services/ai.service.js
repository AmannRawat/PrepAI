const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://localhost:9000";

async function uploadResume(file) {
  const formData = new FormData();

  const blob = new Blob(
    [file.buffer],
    { type: file.mimetype }
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

async function retrieveResumeContext(
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

module.exports = {
  uploadResume,
  retrieveResumeContext,
};