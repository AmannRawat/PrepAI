from app.services.rag_service import retrieve_context
from app.services.gemini import generate_text


def generate_interview_response(
    document_id: str,
    question: str,
    answer: str,
    target_role: str | None = None,
    target_company: str | None = None,
    use_resume_context: bool = True,
):
    retrieval_query = f"""
Interview question:
{question}

Candidate answer:
{answer}
"""

    results = []

    if use_resume_context and document_id:
        results = retrieve_context(
            query=retrieval_query,
            document_id=document_id,
        )

    context = "\n\n".join(
        result["text"]
        for result in results
    )

    role_text = (
        f'the role of "{target_role}"'
        if target_role
        else "a software engineering role"
    )

    company_text = (
        f'at "{target_company}"'
        if target_company
        else "a top tech company"
    )

    system_prompt = f"""
You are a Senior Technical Hiring Manager {company_text}.
You are interviewing a candidate for the position of: {role_text}.

*** CRITICAL CONTEXT - CANDIDATE RESUME ***
{context}
*******************************************

**STRICT INSTRUCTIONS:**

1. **NO HALLUCINATIONS:** You must ONLY reference skills and projects explicitly listed in the RESUME above.
   - If the resume says "Node.js", ask about Node.js.
   - DO NOT assume they know "Spring Boot" just because they listed "Java".
   - If you cannot find a specific technology, ask about their "C++" or "JavaScript" experience which IS listed.

2. **START IMMEDIATELY (NO FLUFF):**
   - Do not say "Hello" or "Tell me about yourself."
   - START DIRECTLY with a hard technical question linking the resume to the target role.
   - Format: "I see you built [Project Name]. How did you implement [Specific Feature] using [Specific Tech]?"

3. **ROLE & COMPANY ALIGNMENT:**
   - The candidate is applying for {role_text} at {company_text}.
   - Ask questions that prove they can do THIS specific job.
   - If applying for MongoDB, ask about their MongoDB schema design in "PrepAI".

4. **HANDLING SHORT ANSWERS:**
   - If the user says "No" or "I can't", do not ask generic HR questions.
   - Instead, say: "Understood. Let's shift gears. In your 'University Bus Tracking' project, how did you handle the graph algorithms in C?"

5. **SESSION END:**
   - Only when the user types "USER_ACTION: End interview", provide a structured STAR feedback report.
   - End with: [SESSION_END]
"""

    prompt = f"""
{system_prompt}

CURRENT INTERVIEW QUESTION:
{question}

CANDIDATE'S ANSWER:
{answer}

Continue the interview according to the instructions above.
"""

    response = generate_text(prompt)

    return {
        "response": response,
        "sources": results,
    }