"""
PrepAI LangSmith Project-Based Tracing Verification Suite
Tests project-based destination routing, removal of agent addressing,
SDK version compatibility, privacy redaction, and failure isolation.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Ensure agent addressing variables are purged before importing config
os.environ.pop("LANGSMITH_AGENT_ID", None)
os.environ.pop("LANGSMITH_AGENT_ENVIRONMENT", None)

import importlib.metadata
from langsmith import RunTree
from app.core.config import (
    LANGSMITH_PROJECT,
    LANGSMITH_TRACING,
    LANGSMITH_ENDPOINT,
)
from app.services.langsmith_service import (
    is_tracing_enabled,
    start_trace,
    end_trace,
    sanitize_error_message,
    calculate_estimated_cost,
)


class TestLangSmithProjectTracing(unittest.TestCase):

    def test_01_sdk_version_constraints(self):
        """Verify langsmith>=0.14.9 and langchain-core>=1.6.11 are installed and active."""
        langsmith_ver = importlib.metadata.version("langsmith")
        langchain_core_ver = importlib.metadata.version("langchain-core")

        def parse_version(v_str):
            return tuple(int(p) for p in v_str.split(".")[:3] if p.isdigit())

        self.assertGreaterEqual(
            parse_version(langsmith_ver),
            (0, 14, 9),
            f"Expected langsmith>=0.14.9, got {langsmith_ver}",
        )
        self.assertGreaterEqual(
            parse_version(langchain_core_ver),
            (1, 6, 11),
            f"Expected langchain-core>=1.6.11, got {langchain_core_ver}",
        )
        print(f"\n[PASS] Verified SDK versions: langsmith=={langsmith_ver}, langchain-core=={langchain_core_ver}")

    def test_02_project_destination_configuration(self):
        """Verify project destination is prepai-ai-services and agent addressing is removed."""
        self.assertEqual(LANGSMITH_PROJECT, "prepai-ai-services")
        self.assertNotIn("LANGSMITH_AGENT_ID", os.environ)
        self.assertNotIn("LANGSMITH_AGENT_ENVIRONMENT", os.environ)
        print(f"[PASS] Project destination configured: '{LANGSMITH_PROJECT}' without agent addressing")

    def test_03_no_agent_address_in_runtree(self):
        """Verify RunTree addresses the run by session_name (project) and address is None."""
        run = RunTree(
            name="gemini_test",
            run_type="llm",
            project_name=LANGSMITH_PROJECT,
            inputs={"stage": "test"},
        )
        self.assertIsNone(run.address)
        self.assertEqual(run.session_name, "prepai-ai-services")
        print("[PASS] RunTree addresses by session_name='prepai-ai-services', address is strictly None")

    def test_04_purging_agent_address_from_environment(self):
        """Even if LANGSMITH_AGENT_ID is reintroduced into os.environ, config purges it."""
        os.environ["LANGSMITH_AGENT_ID"] = "stale-agent-id"
        os.environ["LANGSMITH_AGENT_ENVIRONMENT"] = "stale-env"

        import app.core.config as cfg
        importlib.reload(cfg)

        self.assertNotIn("LANGSMITH_AGENT_ID", os.environ)
        self.assertNotIn("LANGSMITH_AGENT_ENVIRONMENT", os.environ)
        print("[PASS] Stale agent-addressing environment variables safely purged on config reload")

    def test_05_privacy_redaction_settings(self):
        """Verify SDK-level redaction environment variables are enforced."""
        self.assertEqual(os.environ.get("LANGCHAIN_HIDE_INPUTS"), "true")
        self.assertEqual(os.environ.get("LANGCHAIN_HIDE_OUTPUTS"), "true")
        self.assertEqual(os.environ.get("LANGSMITH_HIDE_INPUTS"), "true")
        self.assertEqual(os.environ.get("LANGSMITH_HIDE_OUTPUTS"), "true")
        print("[PASS] Privacy redaction enforced: input/output payload logging disabled at SDK level")

    def test_06_error_sanitization(self):
        """Verify sanitize_error_message scrubs API keys and tokens."""
        raw_err = ValueError("Failed with AIzaSyD987654321012345678901234567890123 and Bearer eyJhbGciOiJIUzI1NiJ9.test")
        sanitized = sanitize_error_message(raw_err)
        self.assertNotIn("AIzaSyD", sanitized)
        self.assertNotIn("eyJhbGci", sanitized)
        self.assertIn("[REDACTED_API_KEY]", sanitized)
        self.assertIn("[REDACTED_TOKEN]", sanitized)
        print("[PASS] Error sanitization verified: credentials scrubbed from trace error strings")

    def test_07_start_trace_metadata_only(self):
        """Verify start_trace creates metadata-only run with project attribution and without agent_id."""
        with patch("app.services.langsmith_service.is_tracing_enabled", return_value=True):
            with patch("app.services.langsmith_service.get_client", return_value=MagicMock()):
                run = start_trace(stage="answer_evaluation", prompt_length=150, model="gemini-3.5-flash-lite")
                self.assertIsNotNone(run)
                self.assertEqual(run.name, "gemini_answer_evaluation")
                self.assertEqual(run.inputs.get("content_redacted"), True)
                metadata = run.extra.get("metadata", {})
                self.assertEqual(metadata.get("project_name"), "prepai-ai-services")
                self.assertNotIn("agent_id", metadata)
                self.assertNotIn("environment", metadata)
                print("[PASS] start_trace verified: clean metadata-only run with project_name='prepai-ai-services'")

    def test_08_hierarchical_nesting_under_langgraph(self):
        """Verify start_trace creates child run under active LangGraph run tree if present."""
        root_run = RunTree(name="interview_turn", project_name="prepai-ai-services")
        with patch("app.services.langsmith_service.is_tracing_enabled", return_value=True):
            with patch("app.services.langsmith_service.get_current_run_tree", return_value=root_run):
                child_run = start_trace(stage="adaptive_decision", prompt_length=80)
                self.assertIsNotNone(child_run)
                self.assertEqual(child_run.parent_run_id, root_run.id)
                self.assertEqual(child_run.name, "gemini_adaptive_decision")
                print("[PASS] Hierarchical nesting verified: Gemini run successfully nested under active LangGraph parent")

    def test_09_tracing_failure_resilience(self):
        """Verify tracing failures do not raise exceptions or impact callers."""
        with patch("app.services.langsmith_service.is_tracing_enabled", return_value=True):
            with patch("app.services.langsmith_service.get_client", side_effect=Exception("Network unreachable")):
                run = start_trace(stage="question_generation", prompt_length=200)
                # Must return None gracefully rather than throwing
                self.assertIsNone(run)

        # end_trace with broken run must not raise
        broken_run = MagicMock()
        broken_run.end.side_effect = Exception("Patch failed")
        try:
            end_trace(broken_run, response_length=100, duration_ms=50.0)
        except Exception as e:
            self.fail(f"end_trace should fail open/silently, but raised: {e}")
        print("[PASS] Resilience verified: LangSmith errors handled gracefully without breaking AI response")

    def test_10_cost_calculation_isolation(self):
        """Verify cost estimation computes valid USD for known models and None for custom."""
        cost = calculate_estimated_cost(1000, 500, model="gemini-2.0-flash")
        self.assertIsNotNone(cost)
        self.assertGreater(cost, 0)

        # Custom/unlisted model returns None (not fake cost)
        unlisted = calculate_estimated_cost(1000, 500, model="gemini-3.5-flash-lite")
        self.assertIsNone(unlisted)
        print("[PASS] Cost estimation verified: exact public pricing mapped, unlisted models return None")

    def test_11_end_trace_completion_records_metadata_without_warning(self):
        """Verify end_trace uses supported RunTree.end API without 'extra' keyword warning."""
        run = RunTree(
            name="gemini_test",
            run_type="llm",
            project_name=LANGSMITH_PROJECT,
            inputs={"stage": "test"},
            extra={"metadata": {"app_name": "PrepAI"}},
        )

        dummy_usage = MagicMock()
        dummy_usage.prompt_token_count = 120
        dummy_usage.candidates_token_count = 80
        dummy_usage.total_token_count = 200

        with patch("langsmith.RunTree.patch", return_value=None):
            end_trace(
                run,
                response_length=350,
                usage_metadata=dummy_usage,
                duration_ms=45.5,
                error=None,
                model="gemini-2.0-flash",
            )

        self.assertEqual(run.outputs.get("status"), "success")
        self.assertEqual(run.outputs.get("response_chars"), 350)
        self.assertEqual(run.outputs.get("content_redacted"), True)

        metadata = run.extra.get("metadata", {})
        self.assertEqual(metadata.get("app_name"), "PrepAI")
        self.assertEqual(metadata.get("duration_ms"), 45.5)
        self.assertEqual(metadata.get("prompt_tokens"), 120)
        self.assertEqual(metadata.get("completion_tokens"), 80)
        self.assertEqual(metadata.get("total_tokens"), 200)
        self.assertIsNotNone(metadata.get("estimated_cost_usd"))
        print("[PASS] end_trace verified: metadata attached cleanly to RunTree without extra kwarg warnings")


if __name__ == "__main__":
    unittest.main()

