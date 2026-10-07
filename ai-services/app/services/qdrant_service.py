from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct


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
):
    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            PointStruct(
                id=point_id,
                vector=vector,
                payload={
                    "text": text,
                },
            )
        ],
    )


def search_similar(vector: list[float], limit: int = 3):
    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=vector,
        limit=limit,
    )

    return [
        {
            "text": point.payload["text"],
            "score": point.score,
        }
        for point in results.points
    ]