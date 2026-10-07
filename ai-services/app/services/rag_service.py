import uuid

from app.services.embedding_service import create_embedding
from app.services.qdrant_service import (
    create_collection,
    store_embedding,
    search_similar,
)
from app.services.gemini import generate_text


def ingest_text(
    text: str,
    document_id: str,
    filename: str,
    chunk_index: int,
):
    embedding = create_embedding(text)

    create_collection(len(embedding))

    point_id = str(uuid.uuid4())

    store_embedding(
        point_id=point_id,
        vector=embedding,
        text=text,
        document_id=document_id,
        filename=filename,
        chunk_index=chunk_index,
    )

    return {
        "message": "Text successfully stored",
        "point_id": point_id,
        "vector_dimension": len(embedding),
    }

def ingest_chunks(
    chunks: list[str],
    document_id: str,
    filename: str,
):
    stored_chunks = 0

    for chunk_index, chunk in enumerate(chunks):
        ingest_text(
            text=chunk,
            document_id=document_id,
            filename=filename,
            chunk_index=chunk_index,
        )

        stored_chunks += 1

    return {
        "chunks_stored": stored_chunks,
    }
    
def retrieve_context(query: str):
    query_embedding = create_embedding(query)

    results = search_similar(query_embedding)

    return results


def generate_rag_answer(query: str):
    results = retrieve_context(query)

    context = "\n\n".join(
        result["text"]
        for result in results
    )

    prompt = f"""
You are PrepAI, an AI interview preparation assistant.

Answer the user's question using the provided context.

If the context does not contain enough information to answer,
say that you don't have enough information.

Context:
{context}

User question:
{query}
"""

    answer = generate_text(prompt)

    return {
        "answer": answer,
        "sources": results,
    }