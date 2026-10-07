from fastapi import FastAPI

from app.routes.ai_routes import router as ai_router


app = FastAPI(title="PrepAI AI Service")


app.include_router(ai_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}