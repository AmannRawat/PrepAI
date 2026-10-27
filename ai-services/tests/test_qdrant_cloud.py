import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Ensure app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.qdrant_service import (
    COLLECTION_NAME,
    DEFAULT_COLLECTION_NAME,
    DEFAULT_VECTOR_SIZE,
    VectorServiceError,
    VectorServiceConfigurationError,
    VectorServiceUnavailableError,
    VectorServiceIncompatibleError,
    get_collection_name,
    get_vector_size,
    get_qdrant_config,
    get_qdrant_client,
    set_mock_qdrant_client,
    reset_qdrant_client,
    create_collection,
    store_embedding,
    search_similar,
    sanitize_url,
    is_remote_or_cloud_endpoint,
)
from app.services.rag_service import ingest_text, ingest_chunks, retrieve_context, generate_rag_answer
from qdrant_client.models import Distance, VectorParams


class MockCollectionDescription:
    def __init__(self, name):
        self.name = name


class MockCollectionsResponse:
    def __init__(self, names):
        self.collections = [MockCollectionDescription(n) for n in names]


class MockCollectionInfo:
    def __init__(self, size=3072, distance=Distance.COSINE):
        self.config = MagicMock()
        self.config.params.vectors = VectorParams(size=size, distance=distance)


class MockPoint:
    def __init__(self, point_id, score, payload):
        self.id = point_id
        self.score = score
        self.payload = payload


class MockQueryResponse:
    def __init__(self, points):
        self.points = points


class TestQdrantCloudMigration(unittest.TestCase):

    def setUp(self):
        reset_qdrant_client()
        self.orig_url = os.environ.get("QDRANT_URL")
        self.orig_api_key = os.environ.get("QDRANT_API_KEY")
        self.orig_timeout = os.environ.get("QDRANT_TIMEOUT")
        self.orig_collection = os.environ.get("QDRANT_COLLECTION")
        self.orig_vector_size = os.environ.get("QDRANT_VECTOR_SIZE")

    def tearDown(self):
        reset_qdrant_client()
        if self.orig_url is not None:
            os.environ["QDRANT_URL"] = self.orig_url
        else:
            os.environ.pop("QDRANT_URL", None)

        if self.orig_api_key is not None:
            os.environ["QDRANT_API_KEY"] = self.orig_api_key
        else:
            os.environ.pop("QDRANT_API_KEY", None)

        if self.orig_timeout is not None:
            os.environ["QDRANT_TIMEOUT"] = self.orig_timeout
        else:
            os.environ.pop("QDRANT_TIMEOUT", None)

        if self.orig_collection is not None:
            os.environ["QDRANT_COLLECTION"] = self.orig_collection
        else:
            os.environ.pop("QDRANT_COLLECTION", None)

        if self.orig_vector_size is not None:
            os.environ["QDRANT_VECTOR_SIZE"] = self.orig_vector_size
        else:
            os.environ.pop("QDRANT_VECTOR_SIZE", None)

    # -------------------------------------------------------------------------
    # 1 & 2. Client Configuration & Local Fallback Tests
    # -------------------------------------------------------------------------

    def test_local_development_fallback_when_unconfigured(self):
        os.environ.pop("QDRANT_URL", None)
        os.environ.pop("QDRANT_API_KEY", None)

        cfg = get_qdrant_config()
        self.assertEqual(cfg["url"], "http://localhost:6333")
        self.assertEqual(cfg["api_key"], "")
        self.assertFalse(cfg["is_cloud"])
        self.assertEqual(cfg["timeout"], 10.0)

    def test_cloud_configuration_with_url_and_api_key(self):
        os.environ["QDRANT_URL"] = "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333"
        os.environ["QDRANT_API_KEY"] = "mock_secret_cloud_api_key"
        os.environ["QDRANT_TIMEOUT"] = "15.0"

        cfg = get_qdrant_config()
        self.assertEqual(cfg["url"], "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333")
        self.assertEqual(cfg["api_key"], "mock_secret_cloud_api_key")
        self.assertTrue(cfg["is_cloud"])
        self.assertEqual(cfg["timeout"], 15.0)

    # -------------------------------------------------------------------------
    # 3. Missing Cloud API Key Handling
    # -------------------------------------------------------------------------

    def test_missing_cloud_api_key_raises_configuration_error(self):
        os.environ["QDRANT_URL"] = "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333"
        os.environ.pop("QDRANT_API_KEY", None)

        with self.assertRaises(VectorServiceConfigurationError) as ctx:
            get_qdrant_config()

        self.assertIn("QDRANT_API_KEY is required", str(ctx.exception))
        # Ensure sanitized URL in error message (no leaked secrets)
        self.assertIn("xyz-example.eu-central.aws.cloud.qdrant.io:6333", str(ctx.exception))

    def test_sanitize_url_removes_embedded_credentials(self):
        url_with_creds = "https://user:super_secret_pass@xyz.cloud.qdrant.io:6333/path?token=1234"
        clean = sanitize_url(url_with_creds)
        self.assertEqual(clean, "https://xyz.cloud.qdrant.io:6333/path")
        self.assertNotIn("super_secret_pass", clean)
        self.assertNotIn("token=1234", clean)

    # -------------------------------------------------------------------------
    # 4. Collection Creation Preserves 3072 Dimensions & Cosine Distance
    # -------------------------------------------------------------------------

    def test_create_collection_creates_with_3072_and_cosine(self):
        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse([])
        set_mock_qdrant_client(mock_client)

        create_collection(vector_size=3072)

        mock_client.create_collection.assert_called_once()
        call_kwargs = mock_client.create_collection.call_args[1]
        self.assertEqual(call_kwargs["collection_name"], "prepai_knowledge")
        vector_params = call_kwargs["vectors_config"]
        self.assertEqual(vector_params.size, 3072)
        self.assertEqual(vector_params.distance, Distance.COSINE)

    def test_create_collection_existing_compatible_does_not_recreate(self):
        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse(["prepai_knowledge"])
        mock_client.get_collection.return_value = MockCollectionInfo(size=3072, distance=Distance.COSINE)
        set_mock_qdrant_client(mock_client)

        create_collection(vector_size=3072)

        # Must not call create_collection again
        mock_client.create_collection.assert_not_called()

    def test_create_collection_incompatible_schema_raises_error(self):
        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse(["prepai_knowledge"])
        # Existing collection has vector size 1536 instead of 3072
        mock_client.get_collection.return_value = MockCollectionInfo(size=1536, distance=Distance.COSINE)
        set_mock_qdrant_client(mock_client)

        with self.assertRaises(VectorServiceIncompatibleError) as ctx:
            create_collection(vector_size=3072)

        self.assertIn("incompatible", str(ctx.exception).lower())
        self.assertIn("1536", str(ctx.exception))
        self.assertIn("3072", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 5. Vector Writes Preserve Payload Fields
    # -------------------------------------------------------------------------

    def test_store_embedding_preserves_required_payload_fields(self):
        mock_client = MagicMock()
        set_mock_qdrant_client(mock_client)

        dummy_vector = [0.1] * 3072
        store_embedding(
            point_id="p-101",
            vector=dummy_vector,
            text="Resume text excerpt",
            document_id="doc-abc",
            filename="my_resume.pdf",
            chunk_index=2,
        )

        mock_client.upsert.assert_called_once()
        call_kwargs = mock_client.upsert.call_args[1]
        self.assertEqual(call_kwargs["collection_name"], "prepai_knowledge")
        points = call_kwargs["points"]
        self.assertEqual(len(points), 1)
        point = points[0]
        self.assertEqual(point.id, "p-101")
        self.assertEqual(point.vector, dummy_vector)
        self.assertEqual(
            point.payload,
            {
                "text": "Resume text excerpt",
                "document_id": "doc-abc",
                "filename": "my_resume.pdf",
                "chunk_index": 2,
            },
        )

    # -------------------------------------------------------------------------
    # 6. Similarity Search Preserves document_id Filtering
    # -------------------------------------------------------------------------

    def test_search_similar_preserves_document_id_filtering(self):
        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse(["prepai_knowledge"])
        mock_client.query_points.return_value = MockQueryResponse(
            [
                MockPoint(
                    point_id="p-1",
                    score=0.92,
                    payload={
                        "text": "Relevant candidate project",
                        "document_id": "target-doc-99",
                        "filename": "resume.pdf",
                        "chunk_index": 0,
                    },
                )
            ]
        )
        set_mock_qdrant_client(mock_client)

        query_vec = [0.05] * 3072
        results = search_similar(query_vec, document_id="target-doc-99", limit=3)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["text"], "Relevant candidate project")
        self.assertEqual(results[0]["document_id"], "target-doc-99")

        mock_client.query_points.assert_called_once()
        call_kwargs = mock_client.query_points.call_args[1]
        self.assertEqual(call_kwargs["collection_name"], "prepai_knowledge")
        self.assertEqual(call_kwargs["limit"], 3)

        # Inspect Filter condition
        query_filter = call_kwargs["query_filter"]
        condition = query_filter.must[0]
        self.assertEqual(condition.key, "document_id")
        self.assertEqual(condition.match.value, "target-doc-99")

    # -------------------------------------------------------------------------
    # 7 & 8. Outage & Authentication Error Handling
    # -------------------------------------------------------------------------

    def test_store_embedding_connection_failure_raises_unavailable_error(self):
        mock_client = MagicMock()
        mock_client.upsert.side_effect = ConnectionError("Connection refused by host")
        set_mock_qdrant_client(mock_client)

        with self.assertRaises(VectorServiceUnavailableError) as ctx:
            store_embedding("p-1", [0.1] * 3072, "text", "doc", "file.pdf", 0)

        self.assertIn("temporarily unavailable", str(ctx.exception))

    def test_store_embedding_unauthorized_error_handled_sanitized(self):
        mock_client = MagicMock()
        auth_err = Exception("HTTP 401 Unauthorized: Invalid API Key")
        setattr(auth_err, "status_code", 401)
        mock_client.upsert.side_effect = auth_err
        set_mock_qdrant_client(mock_client)

        with self.assertRaises(VectorServiceConfigurationError) as ctx:
            store_embedding("p-1", [0.1] * 3072, "text", "doc", "file.pdf", 0)

        self.assertIn("authentication failed", str(ctx.exception).lower())
        self.assertNotIn("secret", str(ctx.exception).lower())

    # -------------------------------------------------------------------------
    # 9. Ingestion Fails Closed: No False Success on Vector Storage Failure
    # -------------------------------------------------------------------------

    def test_failed_vector_storage_cannot_report_successful_ingestion(self):
        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse(["prepai_knowledge"])
        mock_client.get_collection.return_value = MockCollectionInfo(size=3072, distance=Distance.COSINE)
        mock_client.upsert.side_effect = TimeoutError("Timed out writing to Qdrant Cloud cluster")
        set_mock_qdrant_client(mock_client)

        with patch("app.services.rag_service.create_embedding", return_value=[0.1] * 3072):
            # ingest_text must raise VectorServiceUnavailableError, NOT return "Text successfully stored"
            with self.assertRaises(VectorServiceUnavailableError):
                ingest_text("Test chunk", "doc-1", "test.pdf", 0)

            # ingest_chunks must raise VectorServiceUnavailableError, NOT return "chunks_stored: 2"
            with self.assertRaises(VectorServiceUnavailableError):
                ingest_chunks(["Chunk 1", "Chunk 2"], "doc-1", "test.pdf")

    # -------------------------------------------------------------------------
    # 10. Search Error Handling in generate_rag_answer
    # -------------------------------------------------------------------------

    def test_generate_rag_answer_raises_unavailable_when_search_fails(self):
        mock_client = MagicMock()
        mock_client.get_collections.side_effect = ConnectionError("Qdrant cloud cluster unreachable")
        set_mock_qdrant_client(mock_client)

        with patch("app.services.rag_service.create_embedding", return_value=[0.1] * 3072):
            with self.assertRaises(VectorServiceUnavailableError):
                generate_rag_answer("Query about experience", "doc-123")

    # -------------------------------------------------------------------------
    # 11. Dedicated Collection Name & SiteMind Cluster Coexistence
    # -------------------------------------------------------------------------

    def test_default_collection_and_vector_size(self):
        os.environ.pop("QDRANT_COLLECTION", None)
        os.environ.pop("QDRANT_VECTOR_SIZE", None)
        self.assertEqual(get_collection_name(), "prepai_knowledge")
        self.assertEqual(get_vector_size(), 3072)
        self.assertEqual(COLLECTION_NAME, "prepai_knowledge")

    def test_custom_collection_name_from_env(self):
        os.environ["QDRANT_COLLECTION"] = "prepai_custom_cloud"
        self.assertEqual(get_collection_name(), "prepai_custom_cloud")

        mock_client = MagicMock()
        mock_client.get_collections.return_value = MockCollectionsResponse([])
        set_mock_qdrant_client(mock_client)

        create_collection(vector_size=3072)
        mock_client.create_collection.assert_called_once()
        self.assertEqual(mock_client.create_collection.call_args[1]["collection_name"], "prepai_custom_cloud")

        # store_embedding targets custom collection
        store_embedding("p-custom", [0.1] * 3072, "test", "doc", "f.pdf", 0)
        self.assertEqual(mock_client.upsert.call_args[1]["collection_name"], "prepai_custom_cloud")

        # search_similar targets custom collection
        mock_client.get_collections.return_value = MockCollectionsResponse(["prepai_custom_cloud"])
        mock_client.query_points.return_value = MockQueryResponse([])
        search_similar([0.1] * 3072, document_id="doc-test")
        self.assertEqual(mock_client.query_points.call_args[1]["collection_name"], "prepai_custom_cloud")

    def test_dedicated_collection_separation_from_sitemind(self):
        """Verify PrepAI operates strictly in its dedicated collection and never touches SiteMind collections."""
        mock_client = MagicMock()
        # Cluster already contains SiteMind collections
        existing_cluster_collections = ["sitemind_production", "sitemind_vectors", "sitemind_rag"]
        mock_client.get_collections.return_value = MockCollectionsResponse(existing_cluster_collections)
        set_mock_qdrant_client(mock_client)

        create_collection(vector_size=3072)

        # Must create PrepAI's dedicated collection
        mock_client.create_collection.assert_called_once()
        created_name = mock_client.create_collection.call_args[1]["collection_name"]
        self.assertEqual(created_name, "prepai_knowledge")

        # Must NOT delete or alter any existing collections
        mock_client.delete_collection.assert_not_called()

    def test_custom_vector_size_from_env(self):
        os.environ["QDRANT_VECTOR_SIZE"] = "1536"
        self.assertEqual(get_vector_size(), 1536)

        # Invalid string falls back safely to default 3072
        os.environ["QDRANT_VECTOR_SIZE"] = "invalid_number"
        self.assertEqual(get_vector_size(), 3072)


if __name__ == "__main__":
    unittest.main()
