from pydantic import BaseModel


class ResumeUploadResponse(BaseModel):
    document_id: str
    filename: str
    characters_extracted: int
    chunks_created: int
    chunks_stored: int


class InterviewRequest(BaseModel):
    document_id: str
    question: str
    answer: str
    target_role: str | None = None
    target_company: str | None = None
    use_resume_context: bool = True
    memory_context: str = ""


class InterviewResponse(BaseModel):
    response: str
    sources: list[dict]

class MemoryExtractionRequest(BaseModel):
    question: str
    answer: str
    evaluation: str


class MemoryExtractionResponse(BaseModel):
    memories: list[dict]