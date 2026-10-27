import os

from dotenv import load_dotenv


load_dotenv()


# Strictly purge any agent-addressing environment variables to prevent LangSmith
# run addressing conflicts (HTTP 400: address cannot be combined with session_id/session_name).
os.environ.pop("LANGSMITH_AGENT_ID", None)
os.environ.pop("LANGSMITH_AGENT_ENVIRONMENT", None)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", os.getenv("LANGCHAIN_TRACING_V2", "false")).lower() in ("true", "1")
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY", os.getenv("LANGCHAIN_API_KEY", ""))
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", os.getenv("LANGCHAIN_PROJECT", "prepai-ai-services"))
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", os.getenv("LANGCHAIN_ENDPOINT", "https://api.smith.langchain.com"))

# Standardize environment for both automatic LangGraph/LangChain tracing and direct LangSmith client
if LANGSMITH_TRACING and LANGSMITH_API_KEY:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = LANGSMITH_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = LANGSMITH_PROJECT
    os.environ["LANGCHAIN_ENDPOINT"] = LANGSMITH_ENDPOINT
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_PROJECT"] = LANGSMITH_PROJECT
    os.environ["LANGSMITH_ENDPOINT"] = LANGSMITH_ENDPOINT