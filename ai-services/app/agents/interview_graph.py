from typing import TypedDict

from langgraph.graph import StateGraph, START, END

from app.services.rag_service import retrieve_context
from app.services.interview_service import generate_interview_response
class InterviewState(TypedDict):
    user_id: str
    document_id: str

    target_role: str | None
    target_company: str | None

    resume_context: str
    memory_context: str

    current_question: str
    candidate_answer: str

    evaluation: str
    next_action: str
    
    interview_response: str
    sources: list[dict]

    final_report: str



def load_context(state: InterviewState):
    print("Loading candidate context...")

    resume_results = []

    if state["document_id"]:
        resume_results = retrieve_context(
            query=(
                f"Interview for {state['target_role'] or 'software engineering'} "
                f"at {state['target_company'] or 'a company'}. "
                "Retrieve relevant resume skills, projects, experience, "
                "and technologies."
            ),
            document_id=state["document_id"],
        )

    resume_context = "\n\n".join(
        result["text"]
        for result in resume_results
    )

    return {
        "resume_context": resume_context,
        "memory_context": state["memory_context"],
    }
    
def interview_turn(state: InterviewState):
    print("Running interview turn...")

    result = generate_interview_response(
        document_id=state["document_id"],
        question=state["current_question"],
        answer=state["candidate_answer"],
        target_role=state["target_role"],
        target_company=state["target_company"],
        use_resume_context=True,
        memory_context=state["memory_context"],
    )

    return {
        "interview_response": result["response"],
        "sources": result["sources"],
    }

graph_builder = StateGraph(InterviewState)

graph_builder.add_node("load_context", load_context)
graph_builder.add_node("generate_question", generate_question)

graph_builder.add_edge(START, "load_context")
graph_builder.add_edge("load_context", "generate_question")
graph_builder.add_edge("generate_question", END)

interview_graph = graph_builder.compile()

if __name__ == "__main__":
    result = interview_graph.invoke({
        "user_id": "test-user",
        "document_id": "test-document",

        "target_role": "AI Engineer",
        "target_company": "Google",

        "resume_context": "",
        "memory_context": "",

        "current_question": "",
        "candidate_answer": "",

        "evaluation": "",
        "next_action": "",

        "final_report": "",
    })

    print("\nFINAL STATE:")
    print(result)