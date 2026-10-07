from pydantic import BaseModel


class ResumeUploadResponse(BaseModel):
    document_id: str
    filename: str
    characters_extracted: int
    chunks_created: int
    chunks_stored: int