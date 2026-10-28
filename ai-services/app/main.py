import time
from datetime import datetime, timezone
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


# Temporary request tracing middleware (outermost wrapper) to diagnose production 429 boundaries
@app.middleware("http")
async def request_tracing_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    timestamp_utc = datetime.now(timezone.utc).isoformat()
    correlation_id = (
        request.headers.get("x-correlation-id")
        or request.headers.get("x-request-id")
        or "-"
    )
    method = request.method
    path = request.url.path

    print(
        f"[AI Inbound START] timestamp={timestamp_utc} correlation_id={correlation_id} "
        f"method={method} path={path}"
    )

    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        print(
            f"[AI Inbound COMPLETE] timestamp={datetime.now(timezone.utc).isoformat()} "
            f"correlation_id={correlation_id} method={method} path={path} "
            f"status={response.status_code} duration_ms={duration_ms}"
        )
        return response
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        print(
            f"[AI Inbound ERROR] timestamp={datetime.now(timezone.utc).isoformat()} "
            f"correlation_id={correlation_id} method={method} path={path} "
            f"duration_ms={duration_ms} error_type={type(exc).__name__}"
        )
        raise


# All AI endpoints (RAG, Gemini chat, LangGraph agents) require the internal service key header
# to guarantee only the Node.js Express backend can invoke them.
app.include_router(ai_router, dependencies=[Depends(verify_internal_service_key)])


@app.get("/health")
async def health_check():
    """Unauthenticated liveness probe used by Docker and hosting container orchestrators."""
    return {"status": "healthy"}