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

class StartInterviewRequest(BaseModel):
    session_id: str
    user_id: str
    document_id: str | None = ""

    target_role: str | None = None
    target_company: str | None = None
    interview_type: str | None = "Behavioral"
    difficulty: str | None = "Medium"
    stage_plan: list[str] | None = None
    current_stage_index: int | None = 0
    experience_level: str | None = "fresher"
    years_of_experience: str | int | float | None = None
    focus_areas: str | None = ""

    memory_context: str = ""

    first_question: str | None = None


class InterviewAnswerRequest(BaseModel):
    answer: str