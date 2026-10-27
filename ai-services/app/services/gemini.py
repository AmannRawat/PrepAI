import logging
import os
import time
from typing import Any, Dict, List, Optional
from google import genai

from app.core.config import (
    GEMINI_API_KEY,
    GEMINI_FALLBACK_API_KEY,
    GEMINI_FAILOVER_ENABLED,
    GEMINI_MAX_RETRIES,
)
from app.services.gemini_classifier import classify_gemini_error, GeminiErrorCategory
from app.services.langsmith_service import start_trace, end_trace

logger = logging.getLogger(__name__)

PRIMARY_COOLDOWN_SECONDS = 300.0  # 5 minutes cooldown when primary project quota is confirmed exhausted
_primary_quota_exhausted_until: float = 0.0

_primary_client: Optional[genai.Client] = None
_fallback_client: Optional[genai.Client] = None
_mock_primary_client: Any = None
_mock_fallback_client: Any = None


def is_failover_enabled() -> bool:
    """Returns True if failover feature flag is enabled."""
    val = os.getenv("GEMINI_FAILOVER_ENABLED", "")
    if val:
        return val.lower() in ("true", "1")
    return GEMINI_FAILOVER_ENABLED


def get_fallback_api_key() -> str:
    """Returns configured fallback API key if any."""
    return os.getenv("GEMINI_FALLBACK_API_KEY", GEMINI_FALLBACK_API_KEY or "")


def is_primary_in_cooldown() -> bool:
    """Returns True if the primary project quota is currently in cooldown."""
    return time.time() < _primary_quota_exhausted_until


def mark_primary_exhausted() -> None:
    """Places the primary project into quota cooldown."""
    global _primary_quota_exhausted_until
    _primary_quota_exhausted_until = time.time() + PRIMARY_COOLDOWN_SECONDS


def reset_failover_state() -> None:
    """Resets failover cooldown and mock clients for testing."""
    global _primary_quota_exhausted_until, _mock_primary_client, _mock_fallback_client
    _primary_quota_exhausted_until = 0.0
    _mock_primary_client = None
    _mock_fallback_client = None


def set_mock_clients(primary_client: Any = None, fallback_client: Any = None) -> None:
    """Testing utility to inject mock clients without live API keys."""
    global _mock_primary_client, _mock_fallback_client
    _mock_primary_client = primary_client
    _mock_fallback_client = fallback_client


def get_failover_status() -> Dict[str, Any]:
    """Returns sanitized operational metrics without secrets."""
    in_cooldown = is_primary_in_cooldown()
    return {
        "failover_enabled": is_failover_enabled(),
        "has_primary_configured": bool(os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)),
        "has_fallback_configured": bool(get_fallback_api_key()),
        "is_primary_in_cooldown": in_cooldown,
        "primary_cooldown_remaining_seconds": max(0.0, round(_primary_quota_exhausted_until - time.time(), 1)) if in_cooldown else 0.0,
    }


def get_client_for_slot(slot: str) -> Any:
    """Retrieves client instance for the requested slot ('primary' or 'fallback')."""
    global _primary_client, _fallback_client

    if slot == "primary":
        if _mock_primary_client is not None:
            return _mock_primary_client
        if _primary_client is None:
            key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
            if not key:
                raise ValueError("GEMINI_API_KEY is not configured.")
            _primary_client = genai.Client(api_key=key)
        return _primary_client

    if slot == "fallback":
        if _mock_fallback_client is not None:
            return _mock_fallback_client
        if _fallback_client is None:
            fallback_key = get_fallback_api_key()
            if not fallback_key:
                raise ValueError("GEMINI_FALLBACK_API_KEY is not configured for fallback.")
            _fallback_client = genai.Client(api_key=fallback_key)
        return _fallback_client

    raise ValueError(f"Unknown Gemini slot: {slot}")


def generate_text(prompt: str, stage: str = "interview_agent", max_attempts: int = GEMINI_MAX_RETRIES) -> str:
    """
    Core text generation with automatic, safe Gemini multi-project quota failover.
    Preserves gemini-3.5-flash-lite model, prompt, and response structures.
    """
    start_time = time.perf_counter()
    prompt_len = len(prompt) if isinstance(prompt, str) else 0

    failover_active = is_failover_enabled() and bool(get_fallback_api_key() or _mock_fallback_client is not None)
    in_cooldown = is_primary_in_cooldown()

    # Determine progression: if primary is already in cooldown, start directly with fallback
    slots_to_try: List[str] = []
    if in_cooldown and failover_active:
        logger.warning(
            "[Gemini Service] Primary project quota is in cooldown. Routing request directly to fallback project."
        )
        slots_to_try = ["fallback"]
    else:
        slots_to_try = ["primary"]
        if failover_active:
            slots_to_try.append("fallback")

    last_error = None

    for slot_idx, current_slot in enumerate(slots_to_try):
        try:
            client = get_client_for_slot(current_slot)
        except Exception as init_err:
            last_error = init_err
            logger.error(f"[Gemini Service] Failed to initialize client for slot '{current_slot}': {init_err}")
            if current_slot == "primary" and failover_active and "fallback" in slots_to_try:
                continue
            raise init_err

        for attempt in range(1, max_attempts + 1):
            attempt_start = time.perf_counter()
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

                duration_ms = round((time.perf_counter() - attempt_start) * 1000, 2)
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
                last_error = e
                duration_ms = round((time.perf_counter() - attempt_start) * 1000, 2)

                if trace_run:
                    end_trace(
                        run=trace_run,
                        duration_ms=duration_ms,
                        error=e,
                        model="gemini-3.5-flash-lite",
                    )

                classification = classify_gemini_error(e)
                logger.warning(
                    f"[Gemini Service] Stage '{stage}' failure on slot '{current_slot}' attempt {attempt}/{max_attempts} "
                    f"({classification['category']}): {e}"
                )

                # CASE 1: Confirmed Project Quota Exhaustion
                if classification["category"] == GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED:
                    if current_slot == "primary":
                        mark_primary_exhausted()
                        logger.warning(
                            f"[Gemini Service] Confirmed primary project quota exhausted. Placed primary in cooldown for {PRIMARY_COOLDOWN_SECONDS}s."
                        )

                        if failover_active and slot_idx + 1 < len(slots_to_try):
                            logger.warning(
                                f"[Gemini Service] Failing over to fallback project credential for stage '{stage}'."
                            )
                            # Break inner loop to try fallback slot
                            break
                        else:
                            raise RuntimeError(
                                "Gemini primary project quota exhausted and no fallback project is configured or enabled."
                            ) from e
                    else:
                        raise RuntimeError(
                            "Gemini project quota exhausted on both primary and fallback projects."
                        ) from e

                # CASE 2: Temporary Rate Limit (RPM/TPM or Ambiguous 429) -> Bounded retry within SAME slot
                if classification["category"] == GeminiErrorCategory.TEMPORARY_RATE_LIMIT:
                    if attempt < max_attempts:
                        delay = classification["retry_delay_seconds"] or (0.5 * (2 ** (attempt - 1)))
                        logger.warning(f"[Gemini Service] Short-term rate limit on '{current_slot}'. Retrying in {delay}s...")
                        time.sleep(delay)
                        continue
                    raise e

                # CASE 3: Transient Service/Network Failure (503, timeout, transport) -> Bounded retry within SAME slot
                if classification["category"] == GeminiErrorCategory.TRANSIENT_SERVICE:
                    if attempt < max_attempts:
                        delay = classification["retry_delay_seconds"] or (0.5 * (2 ** (attempt - 1)))
                        logger.warning(f"[Gemini Service] Transient failure on '{current_slot}'. Retrying in {delay}s...")
                        time.sleep(delay)
                        continue
                    raise e

                # CASE 4: Permanent Errors (400, 401, 403, invalid argument, auth) or UNKNOWN -> Fail immediately
                raise e

    if last_error:
        raise last_error
    raise RuntimeError("Unexpected Gemini execution failure without error.")