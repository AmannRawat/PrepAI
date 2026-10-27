import logging
import time
from typing import List
from app.services.gemini import (
    get_client_for_slot,
    is_failover_enabled,
    is_primary_in_cooldown,
    mark_primary_exhausted,
    get_fallback_api_key,
    PRIMARY_COOLDOWN_SECONDS,
)
from app.services.gemini_classifier import classify_gemini_error, GeminiErrorCategory

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_MAX_ATTEMPTS = 2


def create_embedding(text: str) -> List[float]:
    """
    Generates text embeddings using gemini-embedding-2 with safe multi-project quota failover.
    Strictly preserves model 'gemini-embedding-2' and vector dimensions across failover.
    """
    failover_active = is_failover_enabled() and bool(get_fallback_api_key())
    in_cooldown = is_primary_in_cooldown()

    slots_to_try: List[str] = []
    if in_cooldown and failover_active:
        logger.warning(
            "[Embedding Service] Primary project quota is in cooldown. Routing embedding directly to fallback project."
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
            logger.error(f"[Embedding Service] Failed to initialize client for slot '{current_slot}': {init_err}")
            if current_slot == "primary" and failover_active and "fallback" in slots_to_try:
                continue
            raise init_err

        for attempt in range(1, EMBEDDING_MAX_ATTEMPTS + 1):
            try:
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=text,
                )
                return response.embeddings[0].values
            except Exception as e:
                last_error = e
                classification = classify_gemini_error(e)
                logger.warning(
                    f"[Embedding Service] Failure on slot '{current_slot}' attempt {attempt}/{EMBEDDING_MAX_ATTEMPTS} "
                    f"({classification['category']}): {e}"
                )

                # CASE 1: Confirmed Project Quota Exhaustion
                if classification["category"] == GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED:
                    if current_slot == "primary":
                        mark_primary_exhausted()
                        logger.warning(
                            f"[Embedding Service] Confirmed primary project quota exhausted. Cooldown set for {PRIMARY_COOLDOWN_SECONDS}s."
                        )
                        if failover_active and slot_idx + 1 < len(slots_to_try):
                            logger.warning(
                                "[Embedding Service] Failing over to fallback project credential for embeddings."
                            )
                            break
                        else:
                            raise RuntimeError(
                                "Gemini primary project quota exhausted for embeddings and no fallback project is configured."
                            ) from e
                    else:
                        raise RuntimeError(
                            "Gemini project quota exhausted for embeddings on both primary and fallback projects."
                        ) from e

                # CASE 2: Temporary Rate Limit (RPM/TPM or Ambiguous 429) -> Bounded retry within SAME slot
                if classification["category"] == GeminiErrorCategory.TEMPORARY_RATE_LIMIT:
                    if attempt < EMBEDDING_MAX_ATTEMPTS:
                        delay = classification["retry_delay_seconds"] or (0.5 * (2 ** (attempt - 1)))
                        time.sleep(delay)
                        continue
                    raise e

                # CASE 3: Transient Service/Network Failure (503, timeout, transport) -> Bounded retry within SAME slot
                if classification["category"] == GeminiErrorCategory.TRANSIENT_SERVICE:
                    if attempt < EMBEDDING_MAX_ATTEMPTS:
                        delay = classification["retry_delay_seconds"] or (0.5 * (2 ** (attempt - 1)))
                        time.sleep(delay)
                        continue
                    raise e

                # CASE 4: Permanent Errors or UNKNOWN -> Fail immediately
                raise e

    if last_error:
        raise last_error
    raise RuntimeError("Unexpected embedding failure without error.")