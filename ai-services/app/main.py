from fastapi import FastAPI, Request, Depends

from app.routes.ai_routes import router as ai_router
from app.core.config import AI_SERVICE_SECRET
from app.core.security import verify_internal_service_key, check_payload_size


app = FastAPI(title="PrepAI AI Service")


@app.on_event("startup")
async def validate_service_secret_on_startup():
    if not AI_SERVICE_SECRET or not AI_SERVICE_SECRET.strip():
        raise RuntimeError(
            "[Startup Configuration Error] Missing required environment variable: AI_SERVICE_SECRET must be configured."
        )


# Rejects requests exceeding MAX_PAYLOAD_SIZE (default 5MB) before allocating memory for PDF extraction
@app.middleware("http")
async def payload_size_middleware(request: Request, call_next):
    await check_payload_size(request)
    return await call_next(request)


# All AI endpoints (RAG, Gemini chat, LangGraph agents) require the internal service key header
# to guarantee only the Node.js Express backend can invoke them.
app.include_router(ai_router, dependencies=[Depends(verify_internal_service_key)])


@app.get("/health")
async def health_check():
    """Unauthenticated liveness probe used by Docker and hosting container orchestrators."""
    return {"status": "healthy"}