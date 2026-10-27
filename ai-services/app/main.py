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


@app.middleware("http")
async def payload_size_middleware(request: Request, call_next):
    # Enforce maximum payload size bounds (e.g. 5MB)
    await check_payload_size(request)
    return await call_next(request)


# Include AI routes protected by internal service authentication
app.include_router(ai_router, dependencies=[Depends(verify_internal_service_key)])


@app.get("/health")
async def health_check():
    """Unauthenticated health check probe for orchestration/monitoring."""
    return {"status": "healthy"}