"""
PrepAI AI Service Protection & Concurrency Test Suite
Tests:
1. Service-to-service internal authentication (rejection of missing/invalid keys, acceptance of valid keys and Bearer auth).
2. Unauthenticated public health checks (/health).
3. Concurrency guard semaphore bounding and HTTP 429 responses with Retry-After.
4. Concurrency slot release guarantees across successes, errors, and cancellations.
5. Payload size bounds (HTTP 413 on oversized request bodies).
"""

import os
import sys
import unittest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

# Ensure ai-services root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.config import AI_SERVICE_SECRET, MAX_REQUEST_BODY_BYTES
from app.core.security import (
    verify_internal_service_key,
    check_payload_size,
    AIConcurrencyGuard,
    get_concurrency_semaphore,
    reset_concurrency_semaphore,
)
from app.main import app


class TestAIServiceProtection(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        reset_concurrency_semaphore(5)
        self.client = TestClient(app)

    # -------------------------------------------------------------------------
    # 1. Health Probe Access
    # -------------------------------------------------------------------------
    def test_01_health_probe_accessible_without_key(self):
        """Health check endpoint must remain public for container orchestration."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "healthy"})

    # -------------------------------------------------------------------------
    # 2. Service-to-Service Authentication
    # -------------------------------------------------------------------------
    def test_02_missing_service_key_rejected(self):
        """Protected endpoints must reject requests without x-internal-service-key."""
        response = self.client.get("/test-gemini")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Invalid or missing internal service key", response.json()["detail"])

    def test_03_invalid_service_key_rejected(self):
        """Protected endpoints must reject invalid keys with HTTP 403."""
        response = self.client.get(
            "/test-gemini",
            headers={"x-internal-service-key": "invalid-secret-attempt"},
        )
        self.assertEqual(response.status_code, 403)

    def test_04_valid_service_key_accepted(self):
        """Protected endpoints must accept requests with the valid internal service key."""
        mock_req = MagicMock()
        mock_req.headers = {"x-internal-service-key": AI_SERVICE_SECRET}

        # Should complete without raising HTTPException
        asyncio.run(verify_internal_service_key(mock_req, key_from_header=AI_SERVICE_SECRET))

    def test_05_bearer_token_accepted(self):
        """Protected endpoints must accept Authorization: Bearer <secret> format."""
        mock_req = MagicMock()
        mock_req.headers = {"authorization": f"Bearer {AI_SERVICE_SECRET}"}

        # Should complete without raising HTTPException
        asyncio.run(verify_internal_service_key(mock_req, key_from_header=None))

    # -------------------------------------------------------------------------
    # 3. Payload Size Bounds
    # -------------------------------------------------------------------------
    async def test_06_payload_size_enforcement(self):
        """Oversized request bodies must trigger HTTP 413 Payload Too Large."""
        oversized_req = MagicMock()
        oversized_req.headers = {"content-length": str(MAX_REQUEST_BODY_BYTES + 1024)}

        with self.assertRaises(HTTPException) as ctx:
            await check_payload_size(oversized_req)
        self.assertEqual(ctx.exception.status_code, 413)

        # Within bounds must pass
        valid_req = MagicMock()
        valid_req.headers = {"content-length": str(1024 * 100)}
        await check_payload_size(valid_req)

    # -------------------------------------------------------------------------
    # 4. Concurrency Guard & Slot Release
    # -------------------------------------------------------------------------
    async def test_07_concurrency_guard_bounds_concurrent_requests(self):
        """Semaphore bounds simultaneous executions and raises HTTP 429 when saturated."""
        # Configure a tight limit of 2 concurrent tasks
        reset_concurrency_semaphore(2)

        guard1 = AIConcurrencyGuard(acquire_timeout=0.1)
        guard2 = AIConcurrencyGuard(acquire_timeout=0.1)
        guard3 = AIConcurrencyGuard(acquire_timeout=0.1)

        async with guard1:
            async with guard2:
                # 3rd concurrent request should time out and raise 429
                with self.assertRaises(HTTPException) as ctx:
                    async with guard3:
                        pass
                self.assertEqual(ctx.exception.status_code, 429)
                self.assertEqual(ctx.exception.headers.get("Retry-After"), "5")

    async def test_08_concurrency_guard_releases_slot_on_exception(self):
        """Ensures semaphore slot is released even when guarded task throws an exception."""
        reset_concurrency_semaphore(1)

        guard = AIConcurrencyGuard(acquire_timeout=0.1)

        try:
            async with guard:
                raise ValueError("Simulated AI workflow failure")
        except ValueError:
            pass

        # Verify that slot was released: next task can acquire immediately
        next_guard = AIConcurrencyGuard(acquire_timeout=0.1)
        acquired = False
        async with next_guard:
            acquired = True

        self.assertTrue(acquired, "Slot must be available for subsequent requests after exception")


if __name__ == "__main__":
    unittest.main()
