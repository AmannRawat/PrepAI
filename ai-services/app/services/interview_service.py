from app.services.rag_service import retrieve_context
from app.services.gemini import generate_text


def generate_interview_response(
    document_id: str,
    question: str,
    answer: str,
):
    retrieval_query = f"""
Interview question:
{question}

Candidate answer:
{answer}
"""

    results = retrieve_context(
        query=retrieval_query,
        document_id=document_id,
    )

    context = "\n\n".join(
        result["text"]
        for result in results
    )

    prompt = f"""
You are PrepAI, an AI behavioral interview coach.

You are conducting an interview based on the candidate's resume.

Resume context:
{context}

Current interview question:
{question}

Candidate's answer:
{answer}

Analyze the candidate's answer and continue the interview.

Your response should:
1. Briefly acknowledge the answer.
2. Identify an important detail from the answer or resume.
3. Ask one relevant follow-up question.
4. Do not invent experience that is not present in the provided context.

Keep the response conversational and interview-focused.
"""

    response = generate_text(prompt)

    return {
        "response": response,
        "sources": results,
    }