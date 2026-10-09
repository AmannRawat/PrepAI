import uuid

from fastapi import APIRouter, File, UploadFile, HTTPException
from langgraph.types import Command

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

from app.services.interview_service import (
    generate_interview_response,
)

from app.services.memory_service import extract_memories

from app.schemas.ai_schemas import (
    ResumeUploadResponse,
    InterviewRequest,
    InterviewResponse,
    MemoryExtractionRequest,
    MemoryExtractionResponse,
    StartInterviewRequest,
    InterviewAnswerRequest,
)

from app.agents.interview_graph import interview_graph


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
async def upload_pdf(
    file: UploadFile = File(...),
):
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


# Existing non-LangGraph interview endpoint
@router.post(
    "/interview",
    response_model=InterviewResponse,
)
async def interview(
    request: InterviewRequest,
):
    return generate_interview_response(
        document_id=request.document_id,
        question=request.question,
        answer=request.answer,
        target_role=request.target_role,
        target_company=request.target_company,
        use_resume_context=request.use_resume_context,
        memory_context=request.memory_context,
    )


@router.post(
    "/extract-memories",
    response_model=MemoryExtractionResponse,
)
async def extract_memories_endpoint(
    request: MemoryExtractionRequest,
):
    return extract_memories(
        question=request.question,
        answer=request.answer,
        evaluation=request.evaluation,
    )


# Start a new LangGraph interview session
@router.post("/interview/start")
async def start_interview(request: StartInterviewRequest):
    config = {
        "configurable": {
            "thread_id": request.session_id,
        }
    }

    result = interview_graph.invoke(
        {
            "session_id": request.session_id,
            "user_id": request.user_id,
            "document_id": request.document_id,
            "target_role": request.target_role,
            "target_company": request.target_company,
            "resume_context": "",
            "memory_context": request.memory_context,
            "current_question": request.first_question,
            "candidate_answer": "",
            "evaluation": "",
            "next_action": "",
            "interview_response": "",
            "sources": [],
            "interview_history": [],
            "final_report": "",
            "memories": [],
        },
        config=config,
    )

    return {
        "session_id": request.session_id,
        "status": "waiting_for_answer",
        "question": request.first_question,
    }


# Submit an answer and resume the existing LangGraph session
@router.post("/interview/{session_id}/answer")
async def submit_interview_answer(
    session_id: str,
    request: InterviewAnswerRequest,
):
    config = {
        "configurable": {
            "thread_id": session_id,
        }
    }

    try:
        result = interview_graph.invoke(
            Command(resume=request.answer),
            config=config,
        )

        # Interview finished
        if result.get("final_report"):
            return {
                "session_id": session_id,
                "status": "completed",
                "final_report": result["final_report"],
                "memories": result.get("memories", []),
            }

        # Interview continues
        question = result.get("current_question")

        return {
            "session_id": session_id,
            "status": "waiting_for_answer",
            "question": question,
            "memories": result.get("memories", []),
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )