from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

QDRANT_URL = "http://localhost:6333"
COLLECTION_NAME = "prepai_knowledge"

client = QdrantClient(url=QDRANT_URL)


def create_collection(vector_size: int):
    collections = client.get_collections().collections

    if any(collection.name == COLLECTION_NAME for collection in collections):
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=vector_size,
            distance=Distance.COSINE,
        ),
    )


def store_embedding(
    point_id: str,
    vector: list[float],
    text: str,
    document_id: str,
    filename: str,
    chunk_index: int,
):
    client.upsert(
        collection_name=COLLECTION_NAME,
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


def search_similar(
    vector: list[float],
    document_id: str,
    limit: int = 3,
):
    results = client.query_points(
        collection_name=COLLECTION_NAME,
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
            "text": point.payload["text"],
            "score": point.score,
            "document_id": point.payload["document_id"],
            "filename": point.payload["filename"],
            "chunk_index": point.payload["chunk_index"],
        }
        for point in results.points
    ]