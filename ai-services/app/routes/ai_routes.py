from fastapi import APIRouter

from app.services.gemini import generate_text
from app.services.rag_service import ingest_text, retrieve_context
    
from app.services.rag_service import (
    ingest_text,
    retrieve_context,
    generate_rag_answer,
)


router = APIRouter()


@router.get("/test-gemini")
async def test_gemini():
    response = generate_text(
        "Say hello from the PrepAI AI service."
    )

    return {
        "response": response
    }


@router.post("/test-ingest")
async def test_ingest():
    return ingest_text(
        "Binary search works on sorted data and has O(log n) time complexity."
    )


@router.get("/test-retrieval")
async def test_retrieval(query: str):
    return {
        "query": query,
        "results": retrieve_context(query),
    }
@router.get("/rag")
async def rag(query: str):
    return generate_rag_answer(query)