from typing import TypedDict
import sqlite3

from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.sqlite import SqliteSaver

from app.services.rag_service import retrieve_context
from app.services.interview_service import generate_interview_response
from app.services.gemini import generate_text


class InterviewState(TypedDict):
    session_id: str
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

    interview_history: list[dict]

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


def wait_for_candidate_answer(state: InterviewState):
    print("Waiting for candidate answer...")

    answer = interrupt({
        "type": "candidate_input",
        "question": state["current_question"],
    })

    return {
        "candidate_answer": answer
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
        resume_context=state["resume_context"],
    )

    return {
        "interview_response": result["response"],
        "sources": result["sources"],
    }


def evaluate_answer(state: InterviewState):
    print("Evaluating candidate answer...")

    prompt = f"""
Evaluate this candidate's answer during a technical interview.

Target role:
{state["target_role"] or "Software Engineer"}

Question:
{state["current_question"]}

Candidate answer:
{state["candidate_answer"]}

Evaluate:

1. Technical correctness
2. Depth of understanding
3. Missing important concepts
4. Strengths
5. Weaknesses

Return a concise evaluation.
"""

    evaluation = generate_text(prompt)

    return {
        "evaluation": evaluation.strip()
    }


def update_interview_history(state: InterviewState):
    print("Updating interview history...")

    history = list(state["interview_history"])

    history.append({
        "question": state["current_question"],
        "answer": state["candidate_answer"],
        "evaluation": state["evaluation"],
    })

    return {
        "interview_history": history
    }


def decide_next_action(state: InterviewState):
    print("Deciding next interview action...")

    prompt = f"""
You are deciding the next step in a technical interview.

Target role:
{state["target_role"] or "Software Engineer"}

Current question:
{state["current_question"]}

Candidate answer:
{state["candidate_answer"]}

Evaluation:
{state["evaluation"]}

Questions already asked:
{len(state["interview_history"])}

Choose exactly ONE action:

EASIER
SIMILAR
HARDER
END

Rules:

EASIER:
Candidate struggled significantly.

SIMILAR:
Candidate demonstrated reasonable understanding.

HARDER:
Candidate demonstrated strong understanding.

END:
The interview has enough information or the candidate should receive
the final report.

Return ONLY one word:
EASIER, SIMILAR, HARDER, or END.
"""

    action = generate_text(prompt).strip().upper()

    allowed_actions = {
        "EASIER",
        "SIMILAR",
        "HARDER",
        "END",
    }

    if action not in allowed_actions:
        action = "SIMILAR"

    return {
        "next_action": action
    }


def generate_next_question(state: InterviewState):
    print("Generating next question...")

    difficulty = state["next_action"]

    history_text = "\n\n".join(
        f"""
Question:
{item["question"]}

Answer:
{item["answer"]}

Evaluation:
{item["evaluation"]}
"""
        for item in state["interview_history"]
    )

    prompt = f"""
You are a senior technical interviewer.

Candidate is interviewing for:
{state["target_role"] or "Software Engineer"}

Company:
{state["target_company"] or "a company"}

Resume context:
{state["resume_context"]}

Candidate memory:
{state["memory_context"]}

Interview history:
{history_text}

The previous answer was evaluated as:

{state["evaluation"]}

The required difficulty direction is:

{difficulty}

Generate exactly ONE next technical interview question.

Rules:

- Base the question on the candidate's actual resume.
- Do not invent technologies.
- Do not repeat previous questions.
- EASIER means reduce complexity.
- SIMILAR means maintain similar difficulty.
- HARDER means increase technical depth.
- Keep the question concise.
- Return ONLY the question.
"""

    question = generate_text(prompt).strip()

    return {
        "current_question": question,
        "candidate_answer": "",
        "interview_response": "",
        "evaluation": "",
    }


def generate_final_report(state: InterviewState):
    print("Generating final interview report...")

    history_text = "\n\n".join(
        f"""
Question:
{item["question"]}

Candidate Answer:
{item["answer"]}

Evaluation:
{item["evaluation"]}
"""
        for item in state["interview_history"]
    )

    prompt = f"""
You are a senior technical interviewer.

Generate a final interview feedback report.

Target role:
{state["target_role"] or "Software Engineer"}

Company:
{state["target_company"] or "a company"}

Interview history:
{history_text}

Return a structured report containing:

Overall Assessment
Technical Strengths
Technical Weaknesses
Communication Assessment
Recommended Areas to Improve
Hiring Recommendation

Keep it concise but useful.
"""

    report = generate_text(prompt)

    return {
        "final_report": report.strip()
    }


def route_next_action(state: InterviewState):
    if state["next_action"] == "END":
        return "final_report"

    return "generate_next_question"


graph_builder = StateGraph(InterviewState)

graph_builder.add_node(
    "load_context",
    load_context,
)

graph_builder.add_node(
    "wait_for_candidate_answer",
    wait_for_candidate_answer,
)

graph_builder.add_node(
    "interview_turn",
    interview_turn,
)

graph_builder.add_node(
    "evaluate_answer",
    evaluate_answer,
)

graph_builder.add_node(
    "update_interview_history",
    update_interview_history,
)

graph_builder.add_node(
    "decide_next_action",
    decide_next_action,
)

graph_builder.add_node(
    "generate_next_question",
    generate_next_question,
)

graph_builder.add_node(
    "generate_final_report",
    generate_final_report,
)


graph_builder.add_edge(
    START,
    "load_context",
)

graph_builder.add_edge(
    "load_context",
    "wait_for_candidate_answer",
)

graph_builder.add_edge(
    "wait_for_candidate_answer",
    "interview_turn",
)

graph_builder.add_edge(
    "interview_turn",
    "evaluate_answer",
)

graph_builder.add_edge(
    "evaluate_answer",
    "update_interview_history",
)

graph_builder.add_edge(
    "update_interview_history",
    "decide_next_action",
)


graph_builder.add_conditional_edges(
    "decide_next_action",
    route_next_action,
    {
        "generate_next_question": "generate_next_question",
        "final_report": "generate_final_report",
    },
)


graph_builder.add_edge(
    "generate_next_question",
    "wait_for_candidate_answer",
)

graph_builder.add_edge(
    "generate_final_report",
    END,
)


conn = sqlite3.connect(
    "interview_sessions.db",
    check_same_thread=False,
)

checkpointer = SqliteSaver(conn)

interview_graph = graph_builder.compile(
    checkpointer=checkpointer
)