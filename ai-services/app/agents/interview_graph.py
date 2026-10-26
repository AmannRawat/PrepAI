from typing import TypedDict
import sqlite3
import time

from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langgraph.checkpoint.sqlite import SqliteSaver

from app.services.rag_service import retrieve_context
from app.services.interview_service import generate_interview_response
from app.services.gemini import generate_text
from app.services.memory_service import extract_memories


class InterviewState(TypedDict):
    session_id: str
    user_id: str
    document_id: str

    target_role: str | None
    target_company: str | None
    interview_type: str
    difficulty: str
    starting_difficulty: str
    adaptive_difficulty: str
    stage_plan: list[str]
    current_stage_index: int
    experience_level: str
    years_of_experience: str
    focus_areas: str

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
    memories: list[dict]


def load_context(state: InterviewState):
    print("Loading candidate context...")

    resume_results = []
    doc_id = state.get("document_id") or ""

    if doc_id:
        resume_results = retrieve_context(
            query=(
                f"Interview for {state.get('target_role') or 'software engineering'} "
                f"at {state.get('target_company') or 'a company'}. "
                f"Candidate experience level: {state.get('experience_level') or 'fresher'}. "
                "Retrieve relevant resume skills, projects, experience, "
                "and technologies."
            ),
            document_id=doc_id,
        )

    resume_context = "\n\n".join(
        result["text"]
        for result in resume_results
    ).strip()

    status_label = "retrieved" if resume_context else ("empty_or_unavailable" if doc_id else "none_provided")
    print(f"[Resume Context] document_id={doc_id or 'none'} chunks={len(resume_results)} chars={len(resume_context)} status={status_label}")

    return {
        "resume_context": resume_context,
        "memory_context": state.get("memory_context") or "",
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
    # Latency Optimization:
    # interview_turn previously made a redundant, unconsumed LLM call (generate_interview_response)
    # that wasted 10-20s per turn. Bypassing it preserves the full state schema without unnecessary overhead.
    t0 = time.perf_counter()
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=interview_turn duration_ms={duration_ms} status=bypassed")

    return {
        "interview_response": "",
        "sources": [],
    }


def evaluate_answer(state: InterviewState):
    print("Evaluating candidate answer...")
    t0 = time.perf_counter()

    exp_level = state.get("experience_level") or "fresher"
    interview_type = state.get("interview_type") or "Behavioral"
    years = state.get("years_of_experience")
    years_str = f" ({years} years)" if years else ""
    focus = f"\nCandidate focus areas: {state.get('focus_areas')}" if state.get("focus_areas") else ""
    stage_plan = state.get("stage_plan") or []
    current_idx = state.get("current_stage_index") or 0
    current_stage_name = stage_plan[current_idx] if (stage_plan and current_idx < len(stage_plan)) else "Discussion"

    # Stage-aware and interview-type-aware evaluation guidelines
    is_intro_stage = current_idx == 0 or "intro" in current_stage_name.lower() or "welcome" in current_stage_name.lower()

    if is_intro_stage:
        eval_focus = """
This is the Welcome & Introduction stage.
Evaluate:
1. Communication clarity, self-presentation, and poise.
2. Background summary: key skills, projects, or interests highlighted.
3. Warmth, engagement, and alignment with the target role.
4. Constructive feedback and positive encouragement.
Do NOT penalize or evaluate code correctness for an introductory greeting.
"""
    elif "behav" in interview_type.lower():
        eval_focus = f"""
This is a Behavioral Interview targeting stage '{current_stage_name}'.
Evaluate:
1. STAR structure (Situation, Task, Action, Result) or clarity of narrative.
2. Core behavioral competencies demonstrated: ownership, teamwork, communication, handling pressure/conflict, learning mindset.
3. Authenticity, depth, and relevance to the role ({state.get("target_role") or "Software Engineer"}).
4. Constructive feedback on how to strengthen behavioral examples.
"""
    elif "tech" in interview_type.lower():
        eval_focus = f"""
This is a Technical Interview targeting stage '{current_stage_name}'.
Evaluate:
1. Technical correctness, conceptual depth, and sound problem-solving reasoning (calibrated to {exp_level}).
2. Understanding of trade-offs, edge cases, and design choices.
3. Clarity in communicating technical ideas.
4. Constructive feedback on missing considerations or technical nuances.
"""
    else:
        # Mixed
        eval_focus = f"""
This is a Mixed Interview targeting stage '{current_stage_name}'.
Evaluate:
1. Appropriateness to the current stage theme ('{current_stage_name}')—balancing technical reasoning or behavioral ownership.
2. Clear problem-solving methodology and communication.
3. Strengths shown and missing concepts.
4. Constructive feedback.
"""

    prompt = f"""
You are an expert interviewer evaluating a candidate's answer.

Target role:
{state.get("target_role") or "Software Engineer"}

Interview type:
{interview_type}

Declared experience level:
{exp_level}{years_str}{focus}

Current stage:
{current_stage_name}

Current question:
{state["current_question"]}

Candidate answer:
{state["candidate_answer"]}

Evaluation Guidelines:
- Evaluate fairly against the declared experience level ({exp_level}).
  * For a student or fresher: Prioritize fundamentals, reasoning ability, coursework understanding, and willingness to learn. Do NOT penalize for lacking enterprise production or architecture experience.
  * For junior or mid-level: Evaluate implementation choices, debugging, trade-offs, and practical design appropriate for their level.
  * For senior: Expect depth on system design, architecture, reliability trade-offs, and operational realities.
- If the candidate says "I don't know" or expresses uncertainty:
  Acknowledge their honesty. Do not treat "I don't know" as an automatic failure or fabricate knowledge. Note that they need guidance or a simpler foundational angle.
- Never pretend an incorrect answer is correct or inflate technical accuracy.
- Distinguish demonstrated knowledge, missing evidence, and areas for improvement.

{eval_focus}

Return a concise evaluation.
"""

    evaluation = generate_text(prompt)
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=evaluate_answer duration_ms={duration_ms} status=success")

    return {
        "evaluation": evaluation.strip()
    }


def extract_interview_memories(state: InterviewState):
    print("Extracting interview memories...")
    t0 = time.perf_counter()

    result = extract_memories(
        question=state["current_question"],
        answer=state["candidate_answer"],
        evaluation=state["evaluation"],
    )

    memories_list = result.get("memories", [])
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=extract_interview_memories duration_ms={duration_ms} count={len(memories_list)} status=success")

    return {
        "memories": memories_list
    }


def update_interview_history(state: InterviewState):
    print("Updating interview history...")
    t0 = time.perf_counter()

    history = list(state["interview_history"])

    history.append({
        "question": state["current_question"],
        "answer": state["candidate_answer"],
        "evaluation": state["evaluation"],
    })

    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=update_interview_history duration_ms={duration_ms} total_questions={len(history)} status=success")

    return {
        "interview_history": history
    }


DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"]


def compute_adaptive_difficulty(current_diff: str, action: str) -> str:
    cur = (current_diff or "Medium").capitalize()
    if cur not in DIFFICULTY_LEVELS:
        cur = "Medium"

    idx = DIFFICULTY_LEVELS.index(cur)
    if action == "HARDER":
        new_idx = min(idx + 1, len(DIFFICULTY_LEVELS) - 1)
    elif action == "EASIER":
        new_idx = max(idx - 1, 0)
    else:
        new_idx = idx

    return DIFFICULTY_LEVELS[new_idx]


def decide_next_action(state: InterviewState):
    print("Deciding next interview action...")
    t0 = time.perf_counter()

    exp_level = state.get("experience_level") or "fresher"
    answer_lower = state["candidate_answer"].strip().lower()
    questions_count = len(state["interview_history"])
    stage_plan = state.get("stage_plan") or []
    current_idx = state.get("current_stage_index") or 0
    cur_diff = state.get("adaptive_difficulty") or state.get("difficulty") or "Medium"
    starting_diff = state.get("starting_difficulty") or cur_diff

    # If candidate explicitly requests to end the interview, respect it
    end_signals = ["end interview", "i want to stop", "stop interview", "quit", "wrap up", "exit interview", "i am done", "that's all i have"]
    if any(sig in answer_lower for sig in end_signals):
        print(f"[Turn Timing] operation=decide_next_action duration_ms=0.01 action=END reason=candidate_requested")
        return {
            "next_action": "END",
            "current_stage_index": max(0, len(stage_plan) - 1),
            "adaptive_difficulty": cur_diff,
            "difficulty": cur_diff,
            "starting_difficulty": starting_diff,
        }

    # If candidate says "I don't know" or is stuck, NEVER prematurely end the interview
    idk_signals = ["i don't know", "i dont know", "not sure", "no idea", "i am not familiar", "haven't learned", "skip this"]
    is_idk = any(sig in answer_lower for sig in idk_signals)

    # If candidate just completed the Introduction stage (turn 0), advance to Stage 1
    is_intro_stage = current_idx == 0 or (stage_plan and "intro" in stage_plan[0].lower())
    if is_intro_stage and questions_count <= 1:
        next_stage_idx = min(1, max(0, len(stage_plan) - 1))
        duration_ms = round((time.perf_counter() - t0) * 1000, 2)
        print(f"[Turn Timing] operation=decide_next_action duration_ms={duration_ms} action=SIMILAR next_stage_idx={next_stage_idx} reason=intro_completed")
        return {
            "next_action": "SIMILAR",
            "current_stage_index": next_stage_idx,
            "adaptive_difficulty": cur_diff,
            "difficulty": cur_diff,
            "starting_difficulty": starting_diff,
        }

    # If all stages in the stage plan have already been answered
    if stage_plan and current_idx >= len(stage_plan) - 1 and questions_count >= len(stage_plan) - 1:
        print(f"[Turn Timing] operation=decide_next_action action=END reason=stage_plan_completed")
        return {
            "next_action": "END",
            "current_stage_index": len(stage_plan) - 1,
            "adaptive_difficulty": cur_diff,
            "difficulty": cur_diff,
            "starting_difficulty": starting_diff,
        }

    prompt = f"""
You are deciding the next step in an adaptive interview.

Target role:
{state.get("target_role") or "Software Engineer"}

Interview type:
{state.get("interview_type") or "Behavioral"}

Current adaptive difficulty:
{cur_diff}

Candidate experience level:
{exp_level}

Current question:
{state["current_question"]}

Candidate answer:
{state["candidate_answer"]}

Evaluation:
{state["evaluation"]}

Questions asked so far:
{questions_count}

Choose exactly ONE action:
EASIER
SIMILAR
HARDER
END

Decision Rules:
- If the candidate said "I don't know", is stuck, or struggled significantly:
  Choose EASIER (to offer a hint or simpler related question) or SIMILAR (to pivot to a different core area).
  DO NOT choose END on "I don't know".
- EASIER: Candidate struggled or was unsure; reduce complexity, break down the problem, or provide an approachable angle.
- SIMILAR: Candidate demonstrated reasonable understanding; maintain level or explore a parallel topic.
- HARDER: Candidate demonstrated strong technical or behavioral mastery; increase depth, introduce constraints or architectural/situational trade-offs.
- END: Choose END ONLY if:
  1. All stages of the stage plan are complete OR at least 4 questions have already been completed AND you have sufficient balanced evidence to write a thorough final report.
  Do NOT end after only 1 or 2 questions unless the candidate explicitly requested to stop.

Return ONLY one word:
EASIER, SIMILAR, HARDER, or END.
"""

    action = generate_text(prompt).strip().upper()

    allowed_actions = {"EASIER", "SIMILAR", "HARDER", "END"}
    if action not in allowed_actions:
        action = "SIMILAR"

    # Safety guard: if candidate said "I don't know" or questions_count < 2, prevent accidental premature END
    if action == "END" and (is_idk or questions_count < 2):
        action = "EASIER" if is_idk else "SIMILAR"

    # Advance stage index when candidate successfully answers; if candidate said "I don't know", stay in current stage for a simpler follow-up/hint
    next_stage_idx = current_idx
    if action != "END":
        if is_idk:
            next_stage_idx = current_idx  # Keep candidate in current stage for follow-up/hint
        else:
            next_stage_idx = min(current_idx + 1, max(0, len(stage_plan) - 1))

    # Compute updated adaptive difficulty
    new_adaptive_diff = compute_adaptive_difficulty(cur_diff, action)

    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=decide_next_action duration_ms={duration_ms} action={action} cur_diff={cur_diff} new_diff={new_adaptive_diff} next_stage_idx={next_stage_idx} status=success")

    return {
        "next_action": action,
        "current_stage_index": next_stage_idx,
        "adaptive_difficulty": new_adaptive_diff,
        "difficulty": new_adaptive_diff,
        "starting_difficulty": starting_diff,
    }


def generate_next_question(state: InterviewState):
    print("Generating next question...")
    t0 = time.perf_counter()

    difficulty_dir = state.get("next_action") or "SIMILAR"
    exp_level = state.get("experience_level") or "fresher"
    interview_type = state.get("interview_type") or "Behavioral"
    adaptive_diff = state.get("adaptive_difficulty") or state.get("difficulty") or "Medium"
    starting_diff = state.get("starting_difficulty") or adaptive_diff
    years = state.get("years_of_experience")
    years_str = f" ({years} years)" if years else ""
    focus = f"\nCandidate focus areas: {state.get('focus_areas')}" if state.get("focus_areas") else ""

    stage_plan = state.get("stage_plan") or []
    current_idx = state.get("current_stage_index") or 0
    current_stage_name = stage_plan[current_idx] if (stage_plan and current_idx < len(stage_plan)) else "In-depth Discussion"

    # Active adaptive difficulty instructions
    diff_instructions = ""
    if adaptive_diff.lower() == "easy":
        diff_instructions = "Active Adaptive Difficulty: Easy. Prioritize foundational principles, direct applications, and approachable questions with gentle guidance."
    elif adaptive_diff.lower() == "hard":
        diff_instructions = "Active Adaptive Difficulty: Hard. Probe for deep architectural or situational reasoning, complex edge cases, non-trivial constraints, and high-stakes trade-offs."
    else:
        diff_instructions = "Active Adaptive Difficulty: Medium. Focus on practical real-world applications, multi-step problem solving, and standard trade-offs."

    # Interview type instructions
    type_instructions = ""
    if "tech" in interview_type.lower():
        type_instructions = "Interview Focus: STRICTLY Technical. Focus on computer science fundamentals, engineering trade-offs, debugging, or system architecture appropriate to their level. Do NOT ask behavioral questions."
    elif "behav" in interview_type.lower():
        type_instructions = "Interview Focus: STRICTLY Behavioral. Focus on teamwork, conflict resolution, ownership, communication, adaptability, and decision-making (using STAR framework context). Do NOT ask technical coding problems or DSA algorithm puzzles."
    else:
        type_instructions = f"Interview Focus: Mixed Technical & Behavioral. Calibrate question to Current Stage '{current_stage_name}'—combining technical execution and behavioral depth across the interview."

    # Company guidance: contextual expectations without claiming official questions
    company = state.get("target_company") or "Tech Company"
    company_guidance = f"Target Company Context: {company}. Align expectations with standards at {company}, but do NOT claim this is an official or leaked company question."

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

    resume_block = (
        f"Resume context:\n{state['resume_context']}"
        if state.get("resume_context")
        else "[Resume context unavailable. Ask role- and experience-appropriate questions based on the candidate's declared profile. Do not invent unmentioned candidate projects or resume details.]"
    )

    prompt = f"""
You are an interviewer conducting an adaptive interview.

Target role:
{state.get("target_role") or "Software Engineer"}

Company:
{company}

Interview type:
{interview_type}

Candidate declared experience level:
{exp_level}{years_str}{focus}

Current Interview Stage:
{current_stage_name} (Stage {current_idx + 1} of {len(stage_plan) if stage_plan else 'ongoing'})

{diff_instructions}
{type_instructions}
{company_guidance}

{resume_block}

Candidate memory context:
{state.get("memory_context") or "None"}

Interview history:
{history_text}

Previous answer evaluation:
{state["evaluation"]}

Adaptive difficulty adjustment from previous answer:
{difficulty_dir}

Generate exactly ONE next interview question targeting the Current Interview Stage: {current_stage_name}.

Rules:
1. Stage Alignment:
   - The question MUST focus on the theme of '{current_stage_name}'.
2. Interview Type Discipline:
   - If interview type is Behavioral: Under NO circumstances should you ask for code, algorithms, data structures, or technical system design questions. Focus on human collaboration, situational judgment, ownership, and learning.
   - If interview type is Technical: Focus on technical reasoning, implementation trade-offs, debugging, or system architecture appropriate to {exp_level}.
3. Experience Level Calibration ({exp_level}):
   - Fresher / Student: Focus on fundamentals, core concepts, coursework projects, or academic collaboration. Do NOT demand multi-year production experience or complex enterprise system design.
   - Junior (1-3 years): Focus on real implementation, debugging scenarios, component structure, teamwork, and trade-offs.
   - Mid-level (3-5 years): Focus on practical system design, component integration, project ownership, performance trade-offs, and edge cases.
   - Senior (5+ years): Focus on large-scale architecture, reliability, scaling trade-offs, organizational influence, and technical leadership.
4. If the candidate's last response was "I don't know" or they struggled:
   - If difficulty adjustment is EASIER: Offer a friendly, constructive hint or reframe the concept into a simpler, more intuitive question or scenario within the current stage. Do NOT repeat the exact same question word-for-word.
5. If resume context is available:
   - Ground questions in their listed technologies or project domains.
   - Do NOT invent companies or technologies not in their resume.
6. If resume context is absent:
   - Ask standard role-relevant questions suited for a {exp_level}.
7. Do NOT repeat previously asked questions.
8. Keep the question concise, direct, and conversational.
9. Return ONLY the question text.
"""

    question = generate_text(prompt).strip()
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=generate_next_question duration_ms={duration_ms} status=success")

    return {
        "current_question": question,
        "candidate_answer": "",
        "interview_response": "",
        "evaluation": "",
    }


def generate_final_report(state: InterviewState):
    print("Generating final interview report...")
    t0 = time.perf_counter()

    exp_level = state.get("experience_level") or "fresher"
    interview_type = state.get("interview_type") or "Behavioral"
    difficulty = state.get("difficulty") or "Medium"
    years = state.get("years_of_experience")
    years_str = f" ({years} years)" if years else ""

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
You are a senior hiring committee lead and expert interviewer.

Generate a comprehensive final interview feedback report for this candidate.

Target role:
{state.get("target_role") or "Software Engineer"}

Company:
{state.get("target_company") or "a tech company"}

Interview Type:
{interview_type}

Configured Baseline Difficulty:
{difficulty}

Declared experience level:
{exp_level}{years_str}

Interview history:
{history_text}

Evaluation & Reporting Rules:
1. Calibrate fairly against the candidate's declared experience level ({exp_level}), interview type ({interview_type}), and difficulty ({difficulty}).
   - A student or fresher should be evaluated on potential, fundamentals, problem-solving, and communication. They MUST NOT receive a negative verdict simply for lacking enterprise production experience.
   - Senior candidates should be evaluated on architectural depth, trade-offs, and leadership.
2. Be completely honest and evidence-grounded:
   - Highlight what the candidate actually demonstrated in their answers.
   - Accurately note missing evidence or misconceptions without harshness or artificial score inflation.
   - Never fabricate candidate experience, project ownership, or unmentioned skills.

Format the report with these clear sections using Markdown:

### Overall Assessment
[2-3 paragraph summary of candidate's overall performance calibrated to their experience level, interview type, and difficulty]

### Demonstrated Strengths
- [Key strength with evidence from their answers]
- [Key strength with evidence from their answers]

### Gaps & Areas for Improvement
- [Specific concept or area needing deeper study/preparation]
- [Specific concept or area needing deeper study/preparation]

### Communication & Problem-Solving
[Assessment of how clearly they articulated thoughts, honesty when unsure, and approach to hints]

### Actionable Next Steps
- [Concrete study recommendation or project to build]
- [Concrete study recommendation or project to build]

### Hiring Verdict
**Verdict:** [Clear recommendation: e.g. "Strong Hire", "Hire", "Leaning Hire", "Leaning No Hire", or "No Hire" - appropriately calibrated for {exp_level}]
**Rationale:** [1-2 sentences summarizing the justification for this verdict based strictly on demonstrated evidence]
"""

    report = generate_text(prompt)
    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"[Turn Timing] operation=generate_final_report duration_ms={duration_ms} length={len(report)} status=success")

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
    "extract_interview_memories",
    extract_interview_memories,
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
    "extract_interview_memories",
)

graph_builder.add_edge(
    "extract_interview_memories",
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