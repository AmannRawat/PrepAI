import os

from dotenv import load_dotenv
from fastapi import FastAPI
from google import genai


# Load variables from .env
load_dotenv()


app = FastAPI(title="PrepAI AI Service")


# Create Gemini client
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/test-gemini")
async def test_gemini():
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Say hello from the PrepAI AI service."
    )

    return {
        "response": response.text
    }