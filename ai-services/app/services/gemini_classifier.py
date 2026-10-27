"""
PrepAI Gemini Error Classifier (Python)

Provides centralized, testable classification of Google GenAI errors across
FastAPI endpoints, LangGraph interview nodes, RAG retrieval, and embedding services:
- PROJECT_QUOTA_EXHAUSTED: Confirmed daily/project-level quota exhaustion (eligible for failover)
- TEMPORARY_RATE_LIMIT: Short-lived RPM/TPM rate limits (retry with backoff, no failover)
- TRANSIENT_SERVICE: Network errors, timeouts, 503 Service Unavailable (retry, no failover)
- PERMANENT_ERROR: 400 Bad Request, 401 Invalid Key, 403 Forbidden (no retry, no failover)
- UNKNOWN: Unclassified errors (safe default handling)
"""

from enum import Enum
import re
from typing import Any, Dict, List, Optional


class GeminiErrorCategory(str, Enum):
    PROJECT_QUOTA_EXHAUSTED = "PROJECT_QUOTA_EXHAUSTED"
    TEMPORARY_RATE_LIMIT = "TEMPORARY_RATE_LIMIT"
    TRANSIENT_SERVICE = "TRANSIENT_SERVICE"
    PERMANENT_ERROR = "PERMANENT_ERROR"
    UNKNOWN = "UNKNOWN"


def extract_status_code(err: Any) -> Optional[int]:
    """Extracts numeric HTTP status code from error object or message."""
    if err is None:
        return None

    # google.genai.errors.APIError has code: int
    if hasattr(err, "code") and isinstance(err.code, int):
        return err.code

    if hasattr(err, "status_code") and isinstance(err.status_code, int):
        return err.status_code

    if hasattr(err, "response") and hasattr(err.response, "status_code"):
        return int(err.response.status_code)

    msg = str(err)
    match = re.search(r"\[(\d{3})\s+[^\]]+\]", msg) or re.search(r"\bstatus(?:\s+code)?[:\s]+(\d{3})\b", msg, re.I)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass

    return None


def extract_error_details(err: Any) -> List[Dict[str, Any]]:
    """Extracts structured details list from APIError response_json."""
    if err is None:
        return []

    details: List[Dict[str, Any]] = []

    # google.genai.errors.APIError.response_json
    response_json = getattr(err, "response_json", None)
    if isinstance(response_json, dict):
        err_dict = response_json.get("error", {})
        if isinstance(err_dict, dict) and isinstance(err_dict.get("details"), list):
            details.extend(err_dict["details"])

    if hasattr(err, "details") and isinstance(err.details, list):
        details.extend(err.details)

    return details


def extract_retry_delay_seconds(err: Any) -> Optional[float]:
    """Extracts suggested retry delay in seconds if provided by headers or RetryInfo."""
    if err is None:
        return None

    # Check Retry-After in response headers if present
    response = getattr(err, "response", None)
    if response and hasattr(response, "headers"):
        retry_after = response.headers.get("retry-after")
        if retry_after:
            try:
                val = float(retry_after)
                if val > 0:
                    return val
            except ValueError:
                pass

    # Check RetryInfo in structured details
    details = extract_error_details(err)
    for item in details:
        if isinstance(item, dict) and "RetryInfo" in item.get("@type", ""):
            retry_delay = item.get("retryDelay")
            if isinstance(retry_delay, str):
                match = re.search(r"^([\d.]+)\s*s?", retry_delay)
                if match:
                    try:
                        return float(match.group(1))
                    except ValueError:
                        pass

    return None


def classify_gemini_error(err: Any) -> Dict[str, Any]:
    """
    Classifies a Gemini API exception into a standardized, actionable category.
    """
    if err is None:
        return {
            "category": GeminiErrorCategory.UNKNOWN,
            "status_code": None,
            "is_quota_exhausted": False,
            "is_transient": False,
            "is_permanent": False,
            "retry_delay_seconds": None,
            "reason": "No error provided",
        }

    status_code = extract_status_code(err)
    details = extract_error_details(err)
    msg = str(err).lower()
    retry_delay_seconds = extract_retry_delay_seconds(err)

    status_str = ""
    if hasattr(err, "status") and isinstance(err.status, str):
        status_str = err.status.upper()
    elif isinstance(getattr(err, "response_json", None), dict):
        status_str = str(err.response_json.get("error", {}).get("status", "")).upper()

    # 1. Permanent Client / Auth / Permission Errors
    if (
        status_code in (400, 401, 403, 404)
        or status_str in ("INVALID_ARGUMENT", "PERMISSION_DENIED", "NOT_FOUND")
        or "api_key_invalid" in msg
        or "api key not valid" in msg
        or "permission denied" in msg
        or "billing has not been enabled" in msg
    ):
        return {
            "category": GeminiErrorCategory.PERMANENT_ERROR,
            "status_code": status_code,
            "is_quota_exhausted": False,
            "is_transient": False,
            "is_permanent": True,
            "retry_delay_seconds": None,
            "reason": "Permanent client, authentication, or permission error",
        }

    # 2. Transient Network / Infrastructure / 503 Errors
    err_class_name = err.__class__.__name__.lower()
    is_timeout = (
        "timeout" in err_class_name
        or "timed out" in msg
        or "timeout" in msg
        or "deadline exceeded" in msg
    )
    is_transport = (
        "connect" in err_class_name
        or "connection reset" in msg
        or "econnreset" in msg
        or "fetch failed" in msg
        or "broken pipe" in msg
    )

    if status_code in (502, 503, 504) or is_timeout or is_transport:
        return {
            "category": GeminiErrorCategory.TRANSIENT_SERVICE,
            "status_code": status_code or 503,
            "is_quota_exhausted": False,
            "is_transient": True,
            "is_permanent": False,
            "retry_delay_seconds": retry_delay_seconds or 0.5,
            "reason": "Request timed out" if is_timeout else "Network transport failure" if is_transport else "Service temporarily unavailable (503)",
        }

    # 3. Rate Limit / Quota Errors (HTTP 429 or RESOURCE_EXHAUSTED)
    if status_code == 429 or status_str == "RESOURCE_EXHAUSTED" or "429" in msg or "resource_exhausted" in msg:
        is_daily_or_project_quota = False
        is_per_minute_rate_limit = False

        # Inspect details metadata and QuotaFailure violations
        for item in details:
            metadata = item.get("metadata", {})
            quota_limit = str(metadata.get("quota_limit", "")).lower()

            if any(k in quota_limit for k in ("day", "daily", "project")):
                is_daily_or_project_quota = True
            if any(k in quota_limit for k in ("minute", "rpm", "tpm")):
                is_per_minute_rate_limit = True

            violations = item.get("violations", [])
            if isinstance(violations, list):
                for v in violations:
                    desc = str(v.get("description", "")).lower()
                    if any(k in desc for k in ("day", "daily", "quota exceeded")):
                        is_daily_or_project_quota = True
                    if any(k in desc for k in ("minute", "per minute")):
                        is_per_minute_rate_limit = True

        # Heuristic string checks
        if any(k in msg for k in ("per day", "perday", "daily request limit", "generatecontentrequestsperday", "free tier limit reached")):
            is_daily_or_project_quota = True

        if any(k in msg for k in ("per minute", "requests per minute", "tokens per minute", "rpm", "tpm")):
            is_per_minute_rate_limit = True

        # Confirmed project daily quota exhaustion (eligible for failover)
        if is_daily_or_project_quota and not is_per_minute_rate_limit:
            return {
                "category": GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED,
                "status_code": 429,
                "is_quota_exhausted": True,
                "is_transient": False,
                "is_permanent": False,
                "retry_delay_seconds": None,
                "reason": "Confirmed project daily/monthly quota exhaustion",
            }

        # Explicit per-minute rate limit (retry with backoff, NOT failover)
        if is_per_minute_rate_limit:
            return {
                "category": GeminiErrorCategory.TEMPORARY_RATE_LIMIT,
                "status_code": 429,
                "is_quota_exhausted": False,
                "is_transient": True,
                "is_permanent": False,
                "retry_delay_seconds": retry_delay_seconds or 1.0,
                "reason": "Short-term RPM/TPM rate limit; retry with backoff",
            }

        # Ambiguous 429: Requirement 10.6 mandates that an ambiguous 429 does NOT automatically trigger failover.
        return {
            "category": GeminiErrorCategory.TEMPORARY_RATE_LIMIT,
            "status_code": 429,
            "is_quota_exhausted": False,
            "is_transient": True,
            "is_permanent": False,
            "retry_delay_seconds": retry_delay_seconds or 1.0,
            "reason": "Ambiguous 429 rate limit; treated as temporary rate limit (no immediate failover)",
        }

    return {
        "category": GeminiErrorCategory.UNKNOWN,
        "status_code": status_code,
        "is_quota_exhausted": False,
        "is_transient": False,
        "is_permanent": False,
        "retry_delay_seconds": None,
        "reason": f"Unclassified error: {msg[:100]}",
    }
