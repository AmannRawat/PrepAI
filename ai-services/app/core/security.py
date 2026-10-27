"""
PrepAI AI Service Resource Protection & Service-to-Service Security

Enforces:
1. Service-to-Service Authentication: Restricts AI service endpoints so it cannot
   be used as an unauthenticated public Gemini / LangGraph proxy.
2. AI Workflow Concurrency Semaphore: Bounds simultaneous expensive AI tasks to
   prevent memory spikes and CPU starvation on low-memory instances.
3. Payload Size Bounds: Enforces 413 Payload Too Large on oversized bodies.
4. Guaranteed Slot Release: Uses try/finally guarantees across timeouts,
   cancellations, and runtime exceptions.
"""

import asyncio
from typing import Optional
from fastapi import Request, HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader

from app.core.config import (
    AI_SERVICE_SECRET,
    MAX_CONCURRENT_AI_REQUESTS,
    MAX_REQUEST_BODY_BYTES,
)

api_key_header = APIKeyHeader(name="x-internal-service-key", auto_error=False)

# Process-local concurrency semaphore for expensive AI tasks
_concurrency_semaphore: Optional[asyncio.Semaphore] = None


def get_concurrency_semaphore() -> asyncio.Semaphore:
    global _concurrency_semaphore
    if _concurrency_semaphore is None:
        _concurrency_semaphore = asyncio.Semaphore(MAX_CONCURRENT_AI_REQUESTS)
    return _concurrency_semaphore


def reset_concurrency_semaphore(new_limit: Optional[int] = None) -> asyncio.Semaphore:
    """Helper for testing to reset or reconfigure the concurrency semaphore."""
    global _concurrency_semaphore
    limit = new_limit if new_limit is not None else MAX_CONCURRENT_AI_REQUESTS
    _concurrency_semaphore = asyncio.Semaphore(limit)
    return _concurrency_semaphore


import hmac

async def verify_internal_service_key(
    request: Request,
    key_from_header: Optional[str] = Security(api_key_header),
) -> None:
    """
    Validates that incoming requests originate from the trusted PrepAI Express backend.
    Checks x-internal-service-key header or Authorization: Bearer <secret>.
    Uses constant-time comparison to prevent timing attacks.
    """
    expected_secret = AI_SERVICE_SECRET

    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: AI_SERVICE_SECRET is not configured.",
        )

    provided_key = key_from_header

    # Also support Authorization: Bearer <key>
    if not provided_key:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            provided_key = auth_header[7:].strip()

    if not provided_key or not hmac.compare_digest(provided_key, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid or missing internal service key.",
        )


async def check_payload_size(request: Request) -> None:
    """
    Validates that incoming request Content-Length does not exceed MAX_REQUEST_BODY_BYTES.
    """
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            length = int(content_length)
            if length > MAX_REQUEST_BODY_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE if hasattr(status, "HTTP_413_CONTENT_TOO_LARGE") else 413,
                    detail=f"Payload Too Large: Request body ({length} bytes) exceeds limit ({MAX_REQUEST_BODY_BYTES} bytes).",
                )
        except ValueError:
            pass


class AIConcurrencyGuard:
    """
    Async context manager and FastAPI dependency that bounds concurrent AI tasks.
    Guarantees slot release on success, failure, timeout, or cancellation.
    """

    def __init__(self, acquire_timeout: float = 1.0):
        self.acquire_timeout = acquire_timeout
        self.acquired = False

    async def __aenter__(self):
        sem = get_concurrency_semaphore()
        try:
            # Attempt to acquire slot within acquire_timeout seconds
            acquired = await asyncio.wait_for(
                sem.acquire(),
                timeout=self.acquire_timeout,
            )
            self.acquired = True
            return self
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="AI service concurrency limit reached. The service is busy, please retry shortly.",
                headers={"Retry-After": "5"},
            )

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.acquired:
            sem = get_concurrency_semaphore()
            sem.release()
            self.acquired = False
