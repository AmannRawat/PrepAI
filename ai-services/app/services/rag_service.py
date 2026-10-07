from app.services.embedding_service import create_embedding
from app.services.qdrant_service import (
    create_collection,
    store_embedding,
    search_similar,
)
from app.services.gemini import generate_text

def ingest_text(text: str):
    embedding = create_embedding(text)

    create_collection(len(embedding))

    store_embedding(
        point_id=1,
        vector=embedding,
        text=text,
    )

    return {
        "message": "Text successfully stored",
        "vector_dimension": len(embedding),
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