import json

from app.services.gemini import generate_text


def extract_memories(
    question: str,
    answer: str,
    evaluation: str,
):
    prompt = f"""
You are extracting durable candidate information from a technical interview.

Interview question:
{question}

Candidate answer:
{answer}

Evaluation:
{evaluation}

Extract ONLY information that is useful for future interview sessions.

Possible categories:
- technical_weakness
- technical_strength
- interview_feedback
- preference
- experience
- goal

Do NOT create memories for temporary details.

Return ONLY valid JSON in this format:

{{
    "memories": [
        {{
            "category": "technical_weakness",
            "content": "Candidate struggles with binary search edge cases.",
            "confidence": 0.9
        }}
    ]
}}

If there is no useful durable information:

{{
    "memories": []
}}
"""

    response = generate_text(prompt)

    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {"memories": []}