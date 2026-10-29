import os
import re
import time
from typing import Optional
from langsmith import Client, RunTree
from langsmith.run_helpers import get_current_run_tree

from app.core.config import (
    LANGSMITH_TRACING,
    LANGSMITH_API_KEY,
    LANGSMITH_PROJECT,
    LANGSMITH_ENDPOINT,
)

# Unconditionally enforce SDK-level redaction of LangGraph node inputs and outputs
# to guarantee no candidate transcripts, resume text, or code solutions leave the runtime
os.environ["LANGCHAIN_HIDE_INPUTS"] = "true"
os.environ["LANGCHAIN_HIDE_OUTPUTS"] = "true"
os.environ["LANGSMITH_HIDE_INPUTS"] = "true"
os.environ["LANGSMITH_HIDE_OUTPUTS"] = "true"

_client: Optional[Client] = None


def is_tracing_enabled() -> bool:
    return bool(LANGSMITH_TRACING and LANGSMITH_API_KEY and LANGSMITH_API_KEY.strip())


def get_client() -> Optional[Client]:
    global _client
    if not is_tracing_enabled():
        return None
    if _client is None:
        try:
            _client = Client(
                api_key=LANGSMITH_API_KEY,
                api_url=LANGSMITH_ENDPOINT or "https://api.smith.langchain.com",
            )
        except Exception as e:
            print(f"[LangSmith Python] Warning: Failed to initialize Client: {e}")
            return None
    return _client


def calculate_estimated_cost(
    prompt_tokens: Optional[int],
    completion_tokens: Optional[int],
    model: str = "gemini-3.5-flash-lite",
) -> Optional[float]:
    """
    Calculate estimated USD cost for officially published Google Gemini pricing tiers.
    Returns None when pricing cannot be established reliably for unlisted/custom models.
    Note: Under Google AI Studio Free Tier, billed cost is $0.00.
    """
    if prompt_tokens is None or completion_tokens is None:
        return None

    # "gemini-3.5-flash-lite" is an unlisted model ID without official published pricing sheets.
    # Official published rates exist for:
    # - "gemini-1.5-flash": $0.075 / 1M input, $0.30 / 1M output (<=128k prompt)
    # - "gemini-2.0-flash": $0.10 / 1M input, $0.40 / 1M output
    # - "gemini-2.0-flash-lite-preview-02-05": $0.075 / 1M input, $0.30 / 1M output
    if model in ("gemini-1.5-flash", "gemini-2.0-flash-lite-preview-02-05"):
        input_cost = prompt_tokens * 0.000000075
        output_cost = completion_tokens * 0.00000030
        return round(input_cost + output_cost, 8)

    if model == "gemini-2.0-flash":
        input_cost = prompt_tokens * 0.00000010
        output_cost = completion_tokens * 0.00000040
        return round(input_cost + output_cost, 8)

    return None


def sanitize_error_message(error: Optional[Exception]) -> Optional[str]:
    """
    Sanitize error message to prevent prompts, candidate answers, or API keys from leaking into traces.
    """
    if not error:
        return None
    raw = str(error)
    # Scrub API keys and auth tokens
    scrubbed = re.sub(r"AIza[0-9A-Za-z-_]{35}", "[REDACTED_API_KEY]", raw)
    scrubbed = re.sub(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", "Bearer [REDACTED_TOKEN]", scrubbed, flags=re.IGNORECASE)
    clean_snippet = " ".join(scrubbed[:80].split())
    return f"{type(error).__name__}: {clean_snippet}"


def start_trace(
    stage: str = "general",
    prompt_length: int = 0,
    model: str = "gemini-3.5-flash-lite",
) -> Optional[RunTree]:
    """
    Start a privacy-guarded LLM run.
    Never transmits candidate transcripts, answers, resume text, or code solutions.
    Attaches as child run if active LangGraph run tree is present, otherwise routes to project.
    """
    if not is_tracing_enabled():
        return None

    try:
        inputs = {
            "stage": stage,
            "prompt_chars": prompt_length,
            "content_redacted": True,
        }
        metadata = {
            "app_name": "PrepAI",
            "service": "ai-services",
            "project_name": LANGSMITH_PROJECT or "prepai-ai-services",
            "provider": "google",
            "model": model,
            "stage": stage,
            "privacy_mode": "metadata_only",
        }

        # If executing inside an active LangGraph execution context, nest cleanly
        parent = get_current_run_tree()
        if parent is not None:
            run = parent.create_child(
                name=f"gemini_{stage}",
                run_type="llm",
                inputs=inputs,
                extra={"metadata": metadata},
            )
        else:
            client = get_client()
            run = RunTree(
                name=f"gemini_{stage}",
                run_type="llm",
                inputs=inputs,
                extra={"metadata": metadata},
                client=client,
                project_name=LANGSMITH_PROJECT or "prepai-ai-services",
            )

        run.post()
        return run
    except Exception as e:
        print(f"[LangSmith Python] start_trace warning ({stage}): {e}")
        return None


def end_trace(
    run: Optional[RunTree],
    response_length: int = 0,
    usage_metadata: Optional[object] = None,
    duration_ms: float = 0.0,
    error: Optional[Exception] = None,
    model: str = "gemini-3.5-flash-lite",
):
    """
    Complete an LLM run recording token counts, latency, and status.
    Never transmits model responses or raw payloads.
    """
    if not run:
        return

    try:
        prompt_tokens = getattr(usage_metadata, "prompt_token_count", None) if usage_metadata else None
        completion_tokens = getattr(usage_metadata, "candidates_token_count", None) if usage_metadata else None
        total_tokens = getattr(usage_metadata, "total_token_count", None) if usage_metadata else None
        estimated_cost_usd = calculate_estimated_cost(prompt_tokens, completion_tokens, model)

        usage_info = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completionTokens if (completionTokens := completion_tokens) is not None else None,
            "total_tokens": total_tokens,
            "token_source": "provider_reported" if prompt_tokens is not None else "unavailable",
            "estimated_cost_usd": estimated_cost_usd,
            "billed_cost_usd": 0.00,  # Under active Google AI Studio Free Tier
            "cost_status": "calculated" if estimated_cost_usd is not None else "pricing_unavailable_for_model",
            "cost_note": (
                f"Official pricing cannot be established reliably for model '{model}'; actual billed cost under Google AI Studio free tier is $0.00"
                if estimated_cost_usd is None
                else None
            ),
        }

        sanitized_error = sanitize_error_message(error)

        metadata_to_record = {
            "duration_ms": duration_ms,
            **usage_info,
        }

        outputs = (
            {
                "status": "failed",
                "error_type": type(error).__name__,
                "content_redacted": True,
            }
            if error
            else {
                "status": "success",
                "response_chars": response_length,
                "content_redacted": True,
            }
        )

        try:
            if error:
                run.end(
                    outputs=outputs,
                    error=sanitized_error,
                    metadata=metadata_to_record,
                )
            else:
                run.end(
                    outputs=outputs,
                    metadata=metadata_to_record,
                )
        except TypeError:
            # Fallback if run.end does not accept metadata kwarg in older/mock implementations
            if hasattr(run, "add_metadata"):
                run.add_metadata(metadata_to_record)
            elif hasattr(run, "extra") and isinstance(run.extra, dict):
                run.extra.setdefault("metadata", {}).update(metadata_to_record)
            if error:
                run.end(outputs=outputs, error=sanitized_error)
            else:
                run.end(outputs=outputs)

        run.patch()
    except Exception as e:
        # Non-blocking: tracing failures must never impact live user requests
        print(f"[LangSmith Python] end_trace warning: {e}")
