import os
import sys
import unittest
from unittest.mock import MagicMock

# Ensure app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.gemini_classifier import (
    classify_gemini_error,
    extract_status_code,
    extract_retry_delay_seconds,
    GeminiErrorCategory,
)
from app.services.gemini import (
    generate_text,
    reset_failover_state,
    set_mock_clients,
    is_primary_in_cooldown,
    get_failover_status,
)
from app.services.embedding_service import create_embedding


class MockAPIError(Exception):
    def __init__(self, code, message, status=None, details=None, response_json=None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.status = status or "RESOURCE_EXHAUSTED"
        self.response_json = response_json or {
            "error": {
                "code": code,
                "message": message,
                "status": self.status,
                "details": details or [],
            }
        }


def make_quota_exhausted_error():
    return MockAPIError(
        code=429,
        message="Resource has been exhausted. Daily request limit reached for generateContentRequestsPerDay.",
        details=[
            {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                "reason": "RATE_LIMIT_EXCEEDED",
                "metadata": {"quota_limit": "generateContentRequestsPerDay"},
            }
        ],
    )


def make_rpm_rate_limit_error():
    return MockAPIError(
        code=429,
        message="Resource has been exhausted. Please retry after 0.01s.",
        details=[
            {
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                "reason": "RATE_LIMIT_EXCEEDED",
                "metadata": {"quota_limit": "generateContentRequestsPerMinute"},
            },
            {
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                "retryDelay": "0.01s",
            },
        ],
    )


def make_ambiguous_429_error():
    return MockAPIError(
        code=429,
        message="Too many requests",
        details=[],
    )


def make_503_error():
    return MockAPIError(
        code=503,
        message="The model is temporarily overloaded.",
        status="UNAVAILABLE",
    )


def make_auth_error():
    return MockAPIError(
        code=400,
        message="API key not valid. Please pass a valid API key.",
        status="INVALID_ARGUMENT",
    )


class TestGeminiMultiProjectFailover(unittest.TestCase):

    def setUp(self):
        reset_failover_state()
        self.orig_primary = os.environ.get("GEMINI_API_KEY")
        self.orig_fallback = os.environ.get("GEMINI_FALLBACK_API_KEY")
        self.orig_failover = os.environ.get("GEMINI_FAILOVER_ENABLED")

    def tearDown(self):
        reset_failover_state()
        if self.orig_primary is not None:
            os.environ["GEMINI_API_KEY"] = self.orig_primary
        else:
            os.environ.pop("GEMINI_API_KEY", None)

        if self.orig_fallback is not None:
            os.environ["GEMINI_FALLBACK_API_KEY"] = self.orig_fallback
        else:
            os.environ.pop("GEMINI_FALLBACK_API_KEY", None)

        if self.orig_failover is not None:
            os.environ["GEMINI_FAILOVER_ENABLED"] = self.orig_failover
        else:
            os.environ.pop("GEMINI_FAILOVER_ENABLED", None)

    # -------------------------------------------------------------------------
    # Classifier Tests
    # -------------------------------------------------------------------------

    def test_classifier_extracts_status_code(self):
        self.assertEqual(extract_status_code(MockAPIError(429, "Too many requests")), 429)
        self.assertEqual(extract_status_code(MockAPIError(503, "Unavailable")), 503)
        self.assertEqual(extract_status_code(Exception("[400 Bad Request] Invalid argument")), 400)
        self.assertIsNone(extract_status_code(None))

    def test_classifier_extracts_retry_delay(self):
        err = make_rpm_rate_limit_error()
        delay = extract_retry_delay_seconds(err)
        self.assertEqual(delay, 0.01)

    def test_classifier_classifies_confirmed_daily_quota_exhaustion(self):
        err = make_quota_exhausted_error()
        res = classify_gemini_error(err)
        self.assertEqual(res["category"], GeminiErrorCategory.PROJECT_QUOTA_EXHAUSTED)
        self.assertTrue(res["is_quota_exhausted"])
        self.assertFalse(res["is_transient"])

    def test_classifier_classifies_rpm_rate_limit(self):
        err = make_rpm_rate_limit_error()
        res = classify_gemini_error(err)
        self.assertEqual(res["category"], GeminiErrorCategory.TEMPORARY_RATE_LIMIT)
        self.assertFalse(res["is_quota_exhausted"])
        self.assertTrue(res["is_transient"])

    def test_classifier_classifies_ambiguous_429_as_temporary(self):
        err = make_ambiguous_429_error()
        res = classify_gemini_error(err)
        self.assertEqual(res["category"], GeminiErrorCategory.TEMPORARY_RATE_LIMIT)
        self.assertFalse(res["is_quota_exhausted"])

    def test_classifier_classifies_503_as_transient(self):
        err = make_503_error()
        res = classify_gemini_error(err)
        self.assertEqual(res["category"], GeminiErrorCategory.TRANSIENT_SERVICE)
        self.assertTrue(res["is_transient"])
        self.assertFalse(res["is_quota_exhausted"])

    def test_classifier_classifies_auth_error_as_permanent(self):
        err = make_auth_error()
        res = classify_gemini_error(err)
        self.assertEqual(res["category"], GeminiErrorCategory.PERMANENT_ERROR)
        self.assertTrue(res["is_permanent"])
        self.assertFalse(res["is_quota_exhausted"])

    # -------------------------------------------------------------------------
    # generate_text Failover Tests
    # -------------------------------------------------------------------------

    def test_primary_success_never_calls_fallback(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary_resp = MagicMock()
        mock_primary_resp.text = "Primary answer"
        mock_primary.models.generate_content.return_value = mock_primary_resp

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        res = generate_text("Hello", stage="test")
        self.assertEqual(res, "Primary answer")
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)

    def test_primary_quota_exhaustion_triggers_fallback_and_succeeds(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.generate_content.side_effect = make_quota_exhausted_error()

        mock_fallback = MagicMock()
        mock_fallback_resp = MagicMock()
        mock_fallback_resp.text = "Recovered via fallback project"
        mock_fallback.models.generate_content.return_value = mock_fallback_resp

        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        res = generate_text("Test prompt", stage="test")
        self.assertEqual(res, "Recovered via fallback project")
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 1)
        self.assertTrue(is_primary_in_cooldown())

    def test_primary_rpm_rate_limit_retries_on_primary_without_failover(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary_resp = MagicMock()
        mock_primary_resp.text = "Success on attempt 2"
        mock_primary.models.generate_content.side_effect = [make_rpm_rate_limit_error(), mock_primary_resp]

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        res = generate_text("Test RPM", stage="test", max_attempts=2)
        self.assertEqual(res, "Success on attempt 2")
        self.assertEqual(mock_primary.models.generate_content.call_count, 2)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)
        self.assertFalse(is_primary_in_cooldown())

    def test_primary_503_retries_on_primary_without_failover(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary_resp = MagicMock()
        mock_primary_resp.text = "Success on attempt 2 after 503"
        mock_primary.models.generate_content.side_effect = [make_503_error(), mock_primary_resp]

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        res = generate_text("Test 503", stage="test", max_attempts=2)
        self.assertEqual(res, "Success on attempt 2 after 503")
        self.assertEqual(mock_primary.models.generate_content.call_count, 2)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)

    def test_ambiguous_429_does_not_trigger_failover(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary_resp = MagicMock()
        mock_primary_resp.text = "Recovered after ambiguous 429"
        mock_primary.models.generate_content.side_effect = [make_ambiguous_429_error(), mock_primary_resp]

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        res = generate_text("Test ambiguous 429", stage="test", max_attempts=2)
        self.assertEqual(res, "Recovered after ambiguous 429")
        self.assertEqual(mock_primary.models.generate_content.call_count, 2)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)

    def test_permanent_error_fails_immediately_without_retry_or_failover(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.generate_content.side_effect = make_auth_error()

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        with self.assertRaises(MockAPIError):
            generate_text("Test auth error", stage="test", max_attempts=2)

        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)

    def test_fallback_exhaustion_raises_controlled_error(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.generate_content.side_effect = make_quota_exhausted_error()

        mock_fallback = MagicMock()
        mock_fallback.models.generate_content.side_effect = make_quota_exhausted_error()

        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        with self.assertRaises(RuntimeError) as ctx:
            generate_text("Test double exhaustion", stage="test")

        self.assertIn("both primary and fallback", str(ctx.exception))
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 1)

    def test_failover_disabled_primary_quota_exhaustion_raises_controlled_error(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "false"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.generate_content.side_effect = make_quota_exhausted_error()

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        with self.assertRaises(RuntimeError) as ctx:
            generate_text("Test disabled failover", stage="test")

        self.assertIn("no fallback project is configured or enabled", str(ctx.exception))
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 0)

    def test_in_memory_cooldown_skips_primary_for_subsequent_requests(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.generate_content.side_effect = make_quota_exhausted_error()

        mock_fallback = MagicMock()
        mock_fallback_resp1 = MagicMock()
        mock_fallback_resp1.text = "Fallback resp 1"
        mock_fallback_resp2 = MagicMock()
        mock_fallback_resp2.text = "Fallback resp 2"
        mock_fallback.models.generate_content.side_effect = [mock_fallback_resp1, mock_fallback_resp2]

        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        # Call 1: exhausts primary, sets cooldown, uses fallback
        res1 = generate_text("Call 1", stage="test")
        self.assertEqual(res1, "Fallback resp 1")
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 1)
        self.assertTrue(is_primary_in_cooldown())

        # Call 2: primary in cooldown, immediately routes to fallback
        res2 = generate_text("Call 2", stage="test")
        self.assertEqual(res2, "Fallback resp 2")
        self.assertEqual(mock_primary.models.generate_content.call_count, 1)
        self.assertEqual(mock_fallback.models.generate_content.call_count, 2)

    # -------------------------------------------------------------------------
    # Embedding Tests
    # -------------------------------------------------------------------------

    def test_embedding_primary_success(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary_embed_val = [0.1] * 768
        mock_primary_emb_obj = MagicMock()
        mock_primary_emb_obj.values = mock_primary_embed_val
        mock_primary_resp = MagicMock()
        mock_primary_resp.embeddings = [mock_primary_emb_obj]
        mock_primary.models.embed_content.return_value = mock_primary_resp

        mock_fallback = MagicMock()
        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        vec = create_embedding("test embedding text")
        self.assertEqual(len(vec), 768)
        self.assertEqual(mock_primary.models.embed_content.call_count, 1)
        self.assertEqual(mock_fallback.models.embed_content.call_count, 0)
        # Verify model used was gemini-embedding-2
        mock_primary.models.embed_content.assert_called_with(
            model="gemini-embedding-2",
            contents="test embedding text",
        )

    def test_embedding_primary_quota_exhaustion_fails_over_to_fallback(self):
        os.environ["GEMINI_FAILOVER_ENABLED"] = "true"
        os.environ["GEMINI_FALLBACK_API_KEY"] = "mock_fallback_key"

        mock_primary = MagicMock()
        mock_primary.models.embed_content.side_effect = make_quota_exhausted_error()

        mock_fallback = MagicMock()
        mock_fallback_embed_val = [0.2] * 768
        mock_fallback_emb_obj = MagicMock()
        mock_fallback_emb_obj.values = mock_fallback_embed_val
        mock_fallback_resp = MagicMock()
        mock_fallback_resp.embeddings = [mock_fallback_emb_obj]
        mock_fallback.models.embed_content.return_value = mock_fallback_resp

        set_mock_clients(primary_client=mock_primary, fallback_client=mock_fallback)

        vec = create_embedding("test failover embedding")
        self.assertEqual(len(vec), 768)
        self.assertEqual(vec[0], 0.2)
        self.assertEqual(mock_primary.models.embed_content.call_count, 1)
        self.assertEqual(mock_fallback.models.embed_content.call_count, 1)
        mock_fallback.models.embed_content.assert_called_with(
            model="gemini-embedding-2",
            contents="test failover embedding",
        )

    def test_get_failover_status_is_sanitized(self):
        status = get_failover_status()
        self.assertIn("failover_enabled", status)
        self.assertIn("has_primary_configured", status)
        self.assertIn("has_fallback_configured", status)
        self.assertIn("is_primary_in_cooldown", status)
        self.assertNotIn("api_key", status)
        self.assertNotIn("fallback_api_key", status)


if __name__ == "__main__":
    unittest.main()
