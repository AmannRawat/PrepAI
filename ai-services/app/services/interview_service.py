from app.services.gemini import generate_text


def generate_interview_response(
    document_id: str,
    question: str,
    answer: str,
    target_role: str | None = None,
    target_company: str | None = None,
    use_resume_context: bool = True,
    memory_context: str = "",
    resume_context: str = "",
):
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
{resume_context}
*******************************************

*** CANDIDATE MEMORY ***
{memory_context}
************************

**STRICT INSTRUCTIONS:**

1. **NO HALLUCINATIONS:** You must ONLY reference skills and projects explicitly listed in the RESUME above.
   - If the resume says "Node.js", ask about Node.js.
   - DO NOT assume they know "Spring Boot" just because they listed "Java".
   - If you cannot find a specific technology, ask about their "C++" or "JavaScript" experience which IS listed.

2. **START IMMEDIATELY:**
   - Do not say "Hello" or "Tell me about yourself."
   - Start directly with a technical question or follow-up.
   - Format questions around the candidate's actual experience.

3. **ROLE & COMPANY ALIGNMENT:**
   - The candidate is applying for {role_text} at {company_text}.
   - Ask questions that prove they can do THIS specific job.

4. **HANDLING SHORT ANSWERS:**
   - If the user says "No" or "I can't", do not ask generic HR questions.
   - Instead, shift to another relevant technical area from the resume.

5. **SESSION END:**
   - The interview workflow will decide when the session ends.
"""

    prompt = f"""
{system_prompt}

CURRENT INTERVIEW QUESTION:
{question}

CANDIDATE'S ANSWER:
{answer}

Generate the interviewer's response.
"""

    response = generate_text(prompt)

    return {
        "response": response,
        "sources": [],
    }