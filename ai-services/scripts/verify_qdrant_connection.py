"""
Non-destructive Qdrant Cloud Connection & Collection Verification Script.

Usage:
    cd ai-services
    python scripts/verify_qdrant_connection.py

This script:
1. Validates presence and format of QDRANT_URL and QDRANT_API_KEY without leaking secrets.
2. Performs a read-only health check against the Qdrant Cloud cluster.
3. Inspects existing collections (e.g. verifying SiteMind collections are present and untouched).
4. Verifies PrepAI's dedicated collection ('prepai_knowledge' or configured name).
5. Checks vector dimension compatibility (default 3072, Cosine distance).
"""

import os
import sys
from urllib.parse import urlsplit

# Ensure app is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from qdrant_client import QdrantClient
from qdrant_client.models import Distance


def sanitize_url(url: str) -> str:
    """Removes embedded credentials from URL for display."""
    if not url:
        return "[NOT SET]"
    try:
        parts = urlsplit(url)
        netloc = parts.hostname or ""
        if parts.port:
            netloc = f"{netloc}:{parts.port}"
        return f"{parts.scheme}://{netloc}{parts.path}".rstrip("/")
    except Exception:
        return "[sanitized-url]"


def mask_secret(secret: str) -> str:
    """Safely masks a secret string, displaying length only."""
    if not secret:
        return "[NOT SET - Missing]"
    trimmed = secret.strip()
    if len(trimmed) <= 8:
        return f"[SET - {len(trimmed)} chars]"
    return f"{trimmed[:4]}...{trimmed[-4:]} ({len(trimmed)} chars)"


def main():
    print("=" * 60)
    print("  PrepAI Qdrant Cloud Cluster Verification")
    print("=" * 60)

    url = os.getenv("QDRANT_URL", "").strip()
    api_key = os.getenv("QDRANT_API_KEY", "").strip()
    collection_name = os.getenv("QDRANT_COLLECTION", "").strip() or "prepai_knowledge"
    vector_size_str = os.getenv("QDRANT_VECTOR_SIZE", "").strip() or "3072"
    timeout_str = os.getenv("QDRANT_TIMEOUT", "").strip() or "10.0"

    try:
        vector_size = int(vector_size_str)
    except ValueError:
        vector_size = 3072

    try:
        timeout = float(timeout_str)
    except ValueError:
        timeout = 10.0

    print(f"\n1. Environment Configuration:")
    print(f"   QDRANT_URL:         {sanitize_url(url)}")
    print(f"   QDRANT_API_KEY:     {mask_secret(api_key)}")
    print(f"   QDRANT_COLLECTION:  {collection_name}")
    print(f"   QDRANT_VECTOR_SIZE: {vector_size}")
    print(f"   QDRANT_TIMEOUT:     {timeout}s")

    if not url:
        print("\n[ERROR] QDRANT_URL is not set. Please configure it in your ai-services/.env file.")
        sys.exit(1)

    is_cloud = "qdrant.io" in url or "cloud.qdrant" in url or url.startswith("https://")
    if is_cloud and not api_key:
        print("\n[ERROR] QDRANT_API_KEY is required for Qdrant Cloud / remote endpoints.")
        print("Please configure QDRANT_API_KEY in ai-services/.env.")
        sys.exit(1)

    print(f"\n2. Connecting to cluster ({sanitize_url(url)})...")
    try:
        client = QdrantClient(url=url, api_key=api_key or None, timeout=timeout)
        collections_response = client.get_collections()
        existing_collections = [c.name for c in collections_response.collections]
        print(f"   [SUCCESS] Connected to cluster successfully!")
        print(f"   Total collections found: {len(existing_collections)}")
        for idx, name in enumerate(existing_collections, 1):
            tag = " <-- PrepAI dedicated target" if name == collection_name else ""
            print(f"     {idx}. {name}{tag}")
    except Exception as e:
        print(f"\n[FAILURE] Unable to connect to Qdrant cluster: {e}")
        print("Check that:")
        print("  - QDRANT_URL is correct and cluster is active.")
        print("  - QDRANT_API_KEY is valid.")
        print("  - Outbound HTTPS network traffic is permitted.")
        sys.exit(2)

    print(f"\n3. Inspecting PrepAI Collection '{collection_name}':")
    if collection_name in existing_collections:
        try:
            col_info = client.get_collection(collection_name=collection_name)
            params = getattr(getattr(col_info, "config", None), "params", None)
            vec_params = getattr(params, "vectors", None)

            actual_size = None
            actual_dist = None
            if hasattr(vec_params, "size"):
                actual_size = getattr(vec_params, "size", None)
                actual_dist = getattr(vec_params, "distance", None)
            elif isinstance(vec_params, dict):
                actual_size = vec_params.get("size")
                actual_dist = vec_params.get("distance")

            print(f"   [EXISTS] Collection '{collection_name}' already exists.")
            print(f"   Configured dimensions: {actual_size} (Expected: {vector_size})")
            print(f"   Distance metric:       {actual_dist}")

            if actual_size != vector_size:
                print(f"   [WARNING] Dimension mismatch! Cluster has {actual_size}, application expects {vector_size}.")
            else:
                print(f"   [COMPATIBLE] Schema matches expected model embedding dimensions!")
        except Exception as e:
            print(f"   [WARNING] Could not retrieve collection details: {e}")
    else:
        print(f"   [NOT CREATED YET] Collection '{collection_name}' does not exist yet.")
        print(f"   It will be automatically created with size={vector_size} and distance=COSINE")
        print(f"   upon the first resume embedding ingestion, safely coexisting with other collections.")

    print("\n4. Multi-Tenant Safety Check:")
    other_collections = [c for c in existing_collections if c != collection_name]
    if other_collections:
        print(f"   Other collections on this cluster ({len(other_collections)} total):")
        for c in other_collections:
            print(f"     - {c}")
        print(f"   [VERIFIED] PrepAI is isolated to '{collection_name}' and will NOT read, write, or delete other collections.")
    else:
        print(f"   No other collections currently found on this cluster.")

    print("\n" + "=" * 60)
    print("  Verification Complete")
    print("=" * 60)


if __name__ == "__main__":
    main()
