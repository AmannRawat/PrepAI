import time
from google import genai

from app.core.config import GEMINI_API_KEY
from app.services.langsmith_service import start_trace, end_trace


client = genai.Client(api_key=GEMINI_API_KEY)


def generate_text(prompt: str, stage: str = "interview_agent") -> str:
    start_time = time.perf_counter()
    prompt_len = len(prompt) if isinstance(prompt, str) else 0

    trace_run = start_trace(
        stage=stage,
        prompt_length=prompt_len,
        model="gemini-3.5-flash-lite",
    )

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
        )

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response_text = response.text or ""
        usage_metadata = getattr(response, "usage_metadata", None)

        if trace_run:
            end_trace(
                run=trace_run,
                response_length=len(response_text),
                usage_metadata=usage_metadata,
                duration_ms=duration_ms,
                model="gemini-3.5-flash-lite",
            )

        return response_text
    except Exception as e:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        if trace_run:
            end_trace(
                run=trace_run,
                duration_ms=duration_ms,
                error=e,
                model="gemini-3.5-flash-lite",
            )
        raise