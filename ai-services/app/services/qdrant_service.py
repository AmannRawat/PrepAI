import logging
import os
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

logger = logging.getLogger(__name__)

DEFAULT_COLLECTION_NAME = "prepai_knowledge"
DEFAULT_VECTOR_SIZE = 3072
DEFAULT_LOCAL_URL = "http://localhost:6333"
DEFAULT_TIMEOUT_SECONDS = 10.0


def get_collection_name() -> str:
    """
    Returns the configured PrepAI collection name, defaulting to 'prepai_knowledge'.
    Ensures PrepAI uses its own dedicated collection and never touches other collections
    (e.g. SiteMind) on a shared Qdrant cluster.
    """
    return os.getenv("QDRANT_COLLECTION", "").strip() or DEFAULT_COLLECTION_NAME


def get_vector_size() -> int:
    """
    Returns the configured vector dimension, defaulting to 3072
    (matching gemini-embedding-2 / text-embedding-004 native dimensions).
    """
    try:
        return int(os.getenv("QDRANT_VECTOR_SIZE", str(DEFAULT_VECTOR_SIZE)))
    except ValueError:
        return DEFAULT_VECTOR_SIZE


COLLECTION_NAME = get_collection_name()

# Process-local client caching & mock injection
_client_instance: Optional[QdrantClient] = None
_mock_client: Any = None


class VectorServiceError(Exception):
    """Base exception for PrepAI vector service operations."""
    pass


class VectorServiceConfigurationError(VectorServiceError):
    """Raised when Qdrant configuration or authentication is invalid."""
    pass


class VectorServiceUnavailableError(VectorServiceError):
    """Raised when Qdrant is temporarily unreachable, timed out, or unavailable."""
    pass


class VectorServiceIncompatibleError(VectorServiceError):
    """Raised when an existing Qdrant collection schema does not match application requirements."""
    pass


def sanitize_url(url: Optional[str]) -> str:
    """Removes embedded credentials from URLs for safe logging and error messages."""
    if not url:
        return ""
    try:
        parts = urlsplit(url)
        netloc = parts.hostname or ""
        if parts.port:
            netloc = f"{netloc}:{parts.port}"
        return f"{parts.scheme}://{netloc}{parts.path}".rstrip("/")
    except Exception:
        return "[sanitized-url]"


def is_remote_or_cloud_endpoint(url: Optional[str]) -> bool:
    """
    Returns True if the URL targets Qdrant Cloud or a remote instance
    that requires authentication.
    """
    if not url:
        return False
    try:
        parts = urlsplit(url)
        hostname = (parts.hostname or "").lower()
        if not hostname:
            return False

        local_hosts = ("localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal", "prepai-qdrant", "qdrant")
        if hostname in local_hosts:
            return False

        if "qdrant.io" in hostname or "cloud.qdrant" in hostname or parts.scheme == "https":
            return True

        return True
    except Exception:
        return False


def get_qdrant_config() -> Dict[str, Any]:
    """Resolves and validates Qdrant configuration from environment."""
    url = os.getenv("QDRANT_URL", "").strip() or DEFAULT_LOCAL_URL
    api_key = os.getenv("QDRANT_API_KEY", "").strip()

    try:
        timeout = float(os.getenv("QDRANT_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS)))
    except ValueError:
        timeout = DEFAULT_TIMEOUT_SECONDS

    # If endpoint is a cloud or remote host, require QDRANT_API_KEY
    if is_remote_or_cloud_endpoint(url) and not api_key:
        raise VectorServiceConfigurationError(
            f"QDRANT_API_KEY is required when connecting to Qdrant Cloud or remote endpoint ({sanitize_url(url)}). "
            "Please configure QDRANT_API_KEY in your environment."
        )

    return {
        "url": url,
        "api_key": api_key,
        "timeout": timeout,
        "collection": get_collection_name(),
        "vector_size": get_vector_size(),
        "is_cloud": is_remote_or_cloud_endpoint(url),
    }


def set_mock_qdrant_client(mock_client: Any) -> None:
    """Testing hook to inject mock Qdrant client without external network calls."""
    global _mock_client
    _mock_client = mock_client


def reset_qdrant_client() -> None:
    """Resets cached client instances for clean unit testing."""
    global _client_instance, _mock_client
    _client_instance = None
    _mock_client = None


def get_qdrant_client() -> QdrantClient:
    """
    Returns a configured QdrantClient instance with bounded timeout and safe credentials.
    Lazily initialized to prevent network connections at module import time.
    """
    global _client_instance
    if _mock_client is not None:
        return _mock_client

    if _client_instance is not None:
        return _client_instance

    config = get_qdrant_config()
    try:
        _client_instance = QdrantClient(
            url=config["url"],
            api_key=config["api_key"] or None,
            timeout=config["timeout"],
        )
        return _client_instance
    except Exception as e:
        logger.error(f"[Qdrant Service] Failed to initialize QdrantClient for {sanitize_url(config['url'])}: {e}")
        raise VectorServiceUnavailableError(
            f"Unable to initialize vector database connection to {sanitize_url(config['url'])}."
        ) from e


def _handle_qdrant_exception(e: Exception, operation: str) -> None:
    """Translates raw SDK/HTTP exceptions into sanitized domain exceptions."""
    err_str = str(e).lower()
    status_code = getattr(e, "status_code", None)

    # Check for authentication / authorization failures
    if status_code in (401, 403) or "unauthorized" in err_str or "forbidden" in err_str or "api-key" in err_str:
        logger.error(f"[Qdrant Service] Authentication failed during {operation} (HTTP {status_code or 401})")
        raise VectorServiceConfigurationError(
            "Vector service authentication failed. Please verify your QDRANT_API_KEY."
        ) from e

    # Check for transient network failures, timeouts, connection refused
    if (
        status_code in (502, 503, 504)
        or "connect" in err_str
        or "timeout" in err_str
        or "timed out" in err_str
        or "connection refused" in err_str
        or "econnrefused" in err_str
    ):
        logger.warning(f"[Qdrant Service] Service unavailable during {operation}: {e}")
        raise VectorServiceUnavailableError(
            f"Vector storage service is temporarily unavailable during {operation}."
        ) from e

    # General unexpected vector error
    logger.error(f"[Qdrant Service] Unexpected error during {operation}: {e}")
    raise VectorServiceUnavailableError(f"Vector storage operation '{operation}' failed.") from e


def create_collection(vector_size: Optional[int] = None) -> None:
    """
    Creates or validates the dedicated PrepAI collection (default prepai_knowledge)
    with specified dimensions (default 3072) and Cosine distance.
    Validates schema compatibility if collection already exists.
    """
    if vector_size is None:
        try:
            vector_size = int(os.getenv("QDRANT_VECTOR_SIZE", str(DEFAULT_VECTOR_SIZE)))
        except ValueError:
            vector_size = DEFAULT_VECTOR_SIZE

    client = get_qdrant_client()
    target_collection = get_collection_name()

    try:
        collections_response = client.get_collections()
        existing_names = [c.name for c in collections_response.collections]

        if target_collection in existing_names:
            # Validate schema compatibility
            col_info = client.get_collection(collection_name=target_collection)
            vectors_cfg = getattr(getattr(col_info, "config", None), "params", None)
            vectors_params = getattr(vectors_cfg, "vectors", None)

            actual_size = None
            actual_distance = None

            if hasattr(vectors_params, "size"):
                actual_size = getattr(vectors_params, "size", None)
                actual_distance = getattr(vectors_params, "distance", None)
            elif isinstance(vectors_params, dict):
                actual_size = vectors_params.get("size")
                actual_distance = vectors_params.get("distance")

            if actual_size is not None and actual_size != vector_size:
                raise VectorServiceIncompatibleError(
                    f"Vector collection '{target_collection}' exists with dimension {actual_size}, "
                    f"which is incompatible with required model dimension {vector_size}."
                )
            return

        # Collection does not exist: create with strict schema
        client.create_collection(
            collection_name=target_collection,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE,
            ),
        )
        logger.info(f"[Qdrant Service] Created collection '{target_collection}' (size={vector_size}, distance=COSINE)")

    except VectorServiceIncompatibleError:
        raise
    except Exception as e:
        _handle_qdrant_exception(e, "collection_initialization")


def store_embedding(
    point_id: str,
    vector: List[float],
    text: str,
    document_id: str,
    filename: str,
    chunk_index: int,
) -> None:
    """
    Stores a text chunk embedding and metadata in Qdrant.
    Raises VectorServiceUnavailableError on storage failure (never reports false success).
    """
    client = get_qdrant_client()

    try:
        client.upsert(
            collection_name=get_collection_name(),
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "text": text,
                        "document_id": document_id,
                        "filename": filename,
                        "chunk_index": chunk_index,
                    },
                )
            ],
        )
    except Exception as e:
        _handle_qdrant_exception(e, "embedding_storage")


def search_similar(
    vector: List[float],
    document_id: str,
    limit: int = 3,
    raise_on_error: bool = False,
) -> List[Dict[str, Any]]:
    """
    Searches for similar resume chunks filtered strictly by document_id.
    """
    try:
        client = get_qdrant_client()
        target_collection = get_collection_name()
        collections_response = client.get_collections()
        if not any(c.name == target_collection for c in collections_response.collections):
            return []

        results = client.query_points(
            collection_name=target_collection,
            query=vector,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=document_id),
                    )
                ]
            ),
            limit=limit,
        )

        return [
            {
                "text": point.payload.get("text", ""),
                "score": getattr(point, "score", 0.0),
                "document_id": point.payload.get("document_id", ""),
                "filename": point.payload.get("filename", ""),
                "chunk_index": point.payload.get("chunk_index", 0),
            }
            for point in results.points
        ]
    except Exception as e:
        if raise_on_error:
            _handle_qdrant_exception(e, "similarity_search")
        logger.warning(f"[Qdrant Service] Search failed gracefully: {e}")
        return []


def get_vector_service_status() -> Dict[str, Any]:
    """Returns sanitized operational metrics without disclosing secrets."""
    url = os.getenv("QDRANT_URL", "").strip() or DEFAULT_LOCAL_URL
    api_key = os.getenv("QDRANT_API_KEY", "").strip()
    return {
        "endpoint": sanitize_url(url),
        "is_cloud": is_remote_or_cloud_endpoint(url),
        "has_api_key_configured": bool(api_key),
        "collection_name": get_collection_name(),
        "vector_dimension": get_vector_size(),
        "distance": "Cosine",
    }


# Backward compatibility for any direct module-level client attribute lookup
def __getattr__(name: str) -> Any:
    if name == "client":
        return get_qdrant_client()
    if name == "COLLECTION_NAME":
        return get_collection_name()
    if name == "DEFAULT_VECTOR_SIZE":
        return get_vector_size()
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")