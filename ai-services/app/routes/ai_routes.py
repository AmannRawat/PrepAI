import uuid

from fastapi import APIRouter, File, UploadFile

from app.schemas.ai_schemas import ResumeUploadResponse

from app.services.document_service import (
    extract_pdf_text,
    chunk_text,
)
from app.services.gemini import generate_text
from app.services.rag_service import (
    ingest_chunks,
    retrieve_context,
    generate_rag_answer,
)


router = APIRouter()


@router.get("/test-gemini")
async def test_gemini():
    response = generate_text(
        "Say hello from the PrepAI AI service."
    )

    return {"response": response}


@router.post("/test-ingest")
async def test_ingest():
    return ingest_chunks(
        chunks=[
            "Binary search works on sorted data and has O(log n) time complexity."
        ],
        document_id=str(uuid.uuid4()),
        filename="test.txt",
    )


@router.get("/test-retrieval")
async def test_retrieval(query: str):
    return {
        "query": query,
        "results": retrieve_context(query),
    }


@router.post(
    "/upload-pdf",
    response_model=ResumeUploadResponse,
)
async def upload_pdf(file: UploadFile = File(...)):
    file_bytes = await file.read()

    text = extract_pdf_text(file_bytes)

    chunks = chunk_text(text)

    document_id = str(uuid.uuid4())

    result = ingest_chunks(
        chunks=chunks,
        document_id=document_id,
        filename=file.filename,
    )

    return {
        "document_id": document_id,
        "filename": file.filename,
        "characters_extracted": len(text),
        "chunks_created": len(chunks),
        **result,
    }


@router.get("/rag")
async def rag(
    query: str,
    document_id: str,
):
    return generate_rag_answer(
        query=query,
        document_id=document_id,
    )
    