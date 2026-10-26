import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  startInterviewController,
  submitInterviewAnswerController,
  getInterviewSessionController,
  getResumeStatusController,
  uploadInterviewResumeController,
  buildAdaptiveStagePlan
} from "./controllers/interview.controller.js";
import { ChatSession } from "./models/BehavioralChat.model.js";
import UserMemory from "./models/UserMemory.model.js";
import User from "./models/User.model.js";
import ResumeReview from "./models/ResumeReview.model.js";
import * as memoryService from "./services/memory.service.js";
import { AI_SERVICE_TIMEOUT_MS } from "./services/ai.service.js";

import { setCustomTextGenerator } from "./services/gemini.service.js";
let lastGeneratedPrompt = "";
setCustomTextGenerator(async (prompt) => {
  lastGeneratedPrompt = prompt;
  if (prompt.includes("Fresher") || prompt.includes("student")) {
    return "Could you tell me about a foundational coursework project you built and how you approached testing it?";
  }
  return "Can you tell me about your background and a challenging technical project you architected?";
});

// Helper to create mock Express req/res
function createMockReqRes({ user, body = {}, params = {}, query = {}, file = null } = {}) {
  const req = {
    user,
    body,
    params,
    query,
    file
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

// In-memory mock storage for tests
const inMemoryChatSessions = new Map();
const inMemoryMemories = [];

ChatSession.findOneAndUpdate = async (query, update, options) => {
  const existing = inMemoryChatSessions.get(query.sessionId) || {
    sessionId: query.sessionId,
    messages: []
  };

  const fields = update.$set ? { ...update, ...update.$set } : update;
  const setOnInsert = update.$setOnInsert || {};
  const updated = {
    ...existing,
    ...fields,
    user: fields.user || setOnInsert.user || existing.user,
    sessionId: query.sessionId,
    messages: fields.messages ? [...fields.messages] : (existing.messages || []),
    save: async function () {
      inMemoryChatSessions.set(this.sessionId, this);
      return this;
    }
  };

  inMemoryChatSessions.set(query.sessionId, updated);
  return updated;
};

ChatSession.findOne = async (query) => {
  const session = inMemoryChatSessions.get(query.sessionId);
  if (!session) return null;
  if (query.user && String(session.user) !== String(query.user)) return null;
  return {
    ...session,
    save: async function () {
      inMemoryChatSessions.set(this.sessionId, this);
      return this;
    }
  };
};

let mockUserResumeDocId = "doc-test-123";
User.findById = (id) => ({
  select: () => Promise.resolve({ _id: id, resumeDocumentId: mockUserResumeDocId })
});

User.findByIdAndUpdate = async (id, update) => {
  if (update.$set?.resumeDocumentId) {
    mockUserResumeDocId = update.$set.resumeDocumentId;
  }
  return { _id: id, resumeDocumentId: mockUserResumeDocId };
};

ResumeReview.findOne = () => ({
  sort: () => ({
    select: () => Promise.resolve(null)
  })
});

UserMemory.find = () => ({
  sort: () => ({
    limit: () => Promise.resolve([])
  })
});
UserMemory.create = async (doc) => {
  inMemoryMemories.push(doc);
  return doc;
};

// Mock global.fetch to intercept HTTP calls made by ai.service.js
let mockFetchHandler = null;
const nativeFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (mockFetchHandler) {
    return mockFetchHandler(url, opts);
  }
  return nativeFetch ? nativeFetch(url, opts) : { ok: true, json: async () => ({}) };
};

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(` [PASS] ${name}`);
    passedTests++;
  } catch (error) {
    console.error(` [FAIL] ${name}`);
    console.error(error);
  }
}

async function runAllTests() {
  console.log("=================================================");
  console.log("  LANGGRAPH & BEHAVIORAL INTERVIEW TEST SUITE");
  console.log("=================================================\n");

  const userA = { id: new mongoose.Types.ObjectId().toString() };
  const userB = { id: new mongoose.Types.ObjectId().toString() };
  let activeSessionId = null;

  // 1. Authentication Enforcement Tests
  await runTest("startInterviewController rejects unauthenticated requests with 401", async () => {
    const { req, res } = createMockReqRes({ user: null });
    await startInterviewController(req, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.data.error || res.data.message, /unauthorized|login/i);
  });

  await runTest("submitInterviewAnswerController rejects unauthenticated requests with 401", async () => {
    const { req, res } = createMockReqRes({ user: null, params: { sessionId: "sess-1" }, body: { answer: "test" } });
    await submitInterviewAnswerController(req, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.data.error || res.data.message, /unauthorized|login/i);
  });

  await runTest("getInterviewSessionController rejects unauthenticated requests with 401", async () => {
    const { req, res } = createMockReqRes({ user: null, params: { sessionId: "sess-1" } });
    await getInterviewSessionController(req, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.data.error || res.data.message, /unauthorized|login/i);
  });

  await runTest("getResumeStatusController rejects unauthenticated requests with 401", async () => {
    const { req, res } = createMockReqRes({ user: null });
    await getResumeStatusController(req, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.data.message || res.data.error, /authentication|unauthorized|login/i);
  });

  // 2. Resume Status Resolution
  await runTest("getResumeStatusController reports active resume when user has documentId", async () => {
    mockUserResumeDocId = "doc-test-123";
    const { req, res } = createMockReqRes({ user: userA });
    await getResumeStatusController(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.hasResume, true);
    assert.equal(res.data.documentId, "doc-test-123");
  });

  await runTest("getResumeStatusController reports hasResume: false when no document is linked", async () => {
    mockUserResumeDocId = null;
    const { req, res } = createMockReqRes({ user: userA });
    await getResumeStatusController(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.hasResume, false);
    assert.equal(res.data.documentId, null);
  });

  // 3. Start Interview with Experience Level & Persistence
  await runTest("startInterviewController creates session with experienceLevel, years, focusAreas, and persists them", async () => {
    mockUserResumeDocId = "doc-test-123";
    let sentPayload = null;

    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/interview/start")) {
        sentPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: "Interview started successfully",
            session_id: sentPayload.session_id,
            question: "Could you tell me about a foundational coursework project you built and how you approached testing it?"
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Frontend Developer",
        targetCompany: "Google",
        experienceLevel: "fresher",
        yearsOfExperience: 0,
        focusAreas: "JavaScript fundamentals, React basics",
        useResumeContext: true
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    activeSessionId = res.data.sessionId;
    assert.ok(activeSessionId, "Session ID must be returned");
    assert.ok(res.data.question.length > 10);

    // Verify payload dispatched to AI service
    assert.ok(sentPayload, "AI service must have received start payload");
    assert.equal(sentPayload.target_role, "Frontend Developer");
    assert.equal(sentPayload.target_company, "Google");
    assert.equal(sentPayload.experience_level, "fresher");
    assert.equal(sentPayload.years_of_experience, 0);
    assert.equal(sentPayload.focus_areas, "JavaScript fundamentals, React basics");
    assert.equal(sentPayload.document_id, "doc-test-123");

    // Verify session persistence in MongoDB model
    const stored = inMemoryChatSessions.get(activeSessionId);
    assert.ok(stored, "Session must be stored in database");
    assert.equal(stored.user, userA.id);
    assert.equal(stored.targetRole, "Frontend Developer");
    assert.equal(stored.targetCompany, "Google");
    assert.equal(stored.experienceLevel, "fresher");
    assert.equal(stored.yearsOfExperience, 0);
    assert.equal(stored.focusAreas, "JavaScript fundamentals, React basics");
    assert.equal(stored.messages.length, 1);
  });

  // 4. Validation
  await runTest("submitInterviewAnswerController validates missing answer with 400", async () => {
    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "   " }
    });

    await submitInterviewAnswerController(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.data.error, /answer is required/i);
  });

  // 5. Session Ownership Enforcement
  await runTest("submitInterviewAnswerController blocks User B from submitting to User A's session (404/ownership)", async () => {
    const { req, res } = createMockReqRes({
      user: userB,
      params: { sessionId: activeSessionId },
      body: { answer: "I am trying to answer User A's interview." }
    });

    await submitInterviewAnswerController(req, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.data.error || res.data.message, /not found|unauthorized|permission/i);
  });

  await runTest("getInterviewSessionController blocks User B from reading User A's session (404/ownership)", async () => {
    const { req, res } = createMockReqRes({
      user: userB,
      params: { sessionId: activeSessionId }
    });

    await getInterviewSessionController(req, res);
    assert.equal(res.statusCode, 404);
  });

  // 6. Fresher responding "I don't know" - Adaptive supportive behavior
  await runTest("Fresher responding 'I don't know' receives supportive follow-up or hint without premature completion", async () => {
    let receivedAnswer = "";
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes(`/interview/${activeSessionId}/answer`)) {
        const body = JSON.parse(opts.body);
        receivedAnswer = body.answer;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "active", // Continues the interview, does not kick out
            question: "No problem at all! Let's approach it from another angle: have you ever used state in a React component or managed a variable across two functions?",
            evaluation: "Candidate acknowledged knowledge boundary candidly; pivoting to foundational concept.",
            turn: 2
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "I don't know that yet, honestly." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, "active", "Status should remain active, not terminated");
    assert.ok(res.data.question.includes("No problem at all") || res.data.question.includes("another angle"));
    assert.equal(receivedAnswer, "I don't know that yet, honestly.");

    const stored = inMemoryChatSessions.get(activeSessionId);
    assert.equal(stored.messages.length, 3, "Messages: Q1, IDK answer, Q2 supportive");
  });

  // 7. Answer Submission, Progression, & Memory Extraction
  await runTest("submitInterviewAnswerController forwards answer to LangGraph and records memory & next question", async () => {
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes(`/interview/${activeSessionId}/answer`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "active",
            question: "Great explanation! How did you handle errors in your API calls?",
            evaluation: "Demonstrated clear grasp of useState and useEffect lifecycles.",
            memories: [
              { key: "skill", value: "React hooks", confidence: 0.9 },
              { key: "strength", value: "Component state management", confidence: 0.85 }
            ],
            turn: 3
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "Yes! In my college project I used useState to track item counts in a shopping cart." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, "active");
    assert.equal(res.data.question, "Great explanation! How did you handle errors in your API calls?");
    assert.ok(res.data.evaluation);

    const stored = inMemoryChatSessions.get(activeSessionId);
    assert.equal(stored.messages.length, 5);
  });

  // 8. Interview Completion & Calibrated Final Report
  await runTest("submitInterviewAnswerController handles interview completion and calibrated final report", async () => {
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes(`/interview/${activeSessionId}/answer`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            final_report: "### Candidate Evaluation Report\n\n**Hiring Verdict**: Lean Hire (Fresher / Entry-Level)\n\n**Summary**: The candidate showed solid foundational understanding of React hooks and practical academic project work. No enterprise architecture was claimed, which is appropriate for their level.",
            evaluation: "Comprehensive and level-appropriate performance."
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "USER_ACTION: End interview" }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, "completed");
    assert.ok(res.data.final_report.includes("Fresher / Entry-Level"));

    const stored = inMemoryChatSessions.get(activeSessionId);
    assert.equal(stored.status, "completed");
    assert.ok(stored.finalReport.includes("Fresher / Entry-Level"));
  });

  // 9. Legitimate Session Retrieval for Owner
  await runTest("getInterviewSessionController permits owner to retrieve their interview session", async () => {
    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId }
    });

    await getInterviewSessionController(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.data.sessionId, activeSessionId);
    assert.equal(res.data.status, "completed");
    assert.ok(Array.isArray(res.data.messages));
    assert.ok(res.data.messages.length >= 5);
  });

  // 10. Graceful Handling of Offline AI Service
  await runTest("submitInterviewAnswerController gracefully returns 503 when AI service is unreachable", async () => {
    mockFetchHandler = async () => {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:9000");
      err.code = "ECONNREFUSED";
      throw err;
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "Testing offline recovery behavior" }
    });

    await submitInterviewAnswerController(req, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.data.message || res.data.error, /temporarily unavailable|unreachable/i);
  });

  // 11. Timeout Handling for Answer Submission
  await runTest("submitInterviewAnswerController returns HTTP 504 Gateway Timeout when upstream AI service times out", async () => {
    mockFetchHandler = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: activeSessionId },
      body: { answer: "Testing timeout response behavior" }
    });

    await submitInterviewAnswerController(req, res);
    assert.equal(res.statusCode, 504);
    assert.match(res.data.message, /longer than expected/i);
  });

  // 12. Timeout Handling for Start Interview
  await runTest("startInterviewController returns HTTP 504 Gateway Timeout when starting interview times out", async () => {
    mockFetchHandler = async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: { targetRole: "Backend Engineer", targetCompany: "Google" }
    });

    await startInterviewController(req, res);
    assert.equal(res.statusCode, 504);
    assert.match(res.data.message, /timed out|longer than expected/i);
  });

  // 13. Configurable Timeout Verification
  await runTest("AI_SERVICE_TIMEOUT_MS is configurable and defaults to at least 120000ms", async () => {
    assert.ok(typeof AI_SERVICE_TIMEOUT_MS === "number");
    assert.ok(AI_SERVICE_TIMEOUT_MS >= 120000);
  });

  // 14. Stage Plan Generation & Seniority Calibration
  await runTest("buildAdaptiveStagePlan generates appropriate stage plans for Fresher vs Senior across Technical, Behavioral, and Mixed", async () => {
    // Fresher Technical: Fundamentals & Problem Solving, NO mandatory advanced system design
    const fresherTech = buildAdaptiveStagePlan("fresher", "Technical", "Medium");
    assert.ok(Array.isArray(fresherTech));
    assert.ok(fresherTech.length >= 4);
    assert.ok(fresherTech.some(s => /fundamentals|core cs/i.test(s)));
    assert.ok(fresherTech.some(s => /problem solving/i.test(s)));
    assert.ok(!fresherTech.some(s => /distributed system design/i.test(s)));
    assert.equal(fresherTech[fresherTech.length - 1], "Wrap-up");

    // Fresher Behavioral: Academic collaboration & teamwork
    const fresherBehav = buildAdaptiveStagePlan("fresher", "Behavioral", "Medium");
    assert.ok(fresherBehav.some(s => /collaboration|teamwork/i.test(s)));
    assert.ok(fresherBehav.some(s => /communication|adaptability|learning/i.test(s)));

    // Senior Technical: Architecture and Scalability
    const seniorTech = buildAdaptiveStagePlan("senior", "Technical", "Hard");
    assert.ok(seniorTech.some(s => /system design|architecture/i.test(s)));
    assert.ok(seniorTech.some(s => /reliability|scale|leadership/i.test(s)));

    // Mixed: Combines technical and behavioral stages
    const mixedMid = buildAdaptiveStagePlan("mid", "Mixed", "Medium");
    assert.ok(mixedMid.some(s => /technical|problem solving/i.test(s)));
    assert.ok(mixedMid.some(s => /behavioral/i.test(s)));
  });

  // 15. Decoupling of Difficulty from Seniority
  await runTest("Difficulty is not confused with seniority in stage plan generation", async () => {
    // A Hard Fresher interview must still receive fresher-appropriate stages, NOT senior system design
    const hardFresher = buildAdaptiveStagePlan("fresher", "Technical", "Hard");
    assert.ok(hardFresher.some(s => /fundamentals/i.test(s)));
    assert.ok(!hardFresher.some(s => /distributed system design/i.test(s)));

    // An Easy Senior interview must still receive senior-appropriate stages
    const easySenior = buildAdaptiveStagePlan("senior", "Technical", "Easy");
    assert.ok(easySenior.some(s => /system design/i.test(s)));
    assert.ok(easySenior.some(s => /leadership|trade-offs/i.test(s)));
  });

  // 16. Interview Settings Affect Question Generation & AI Payload
  let techHardSessionId = null;
  await runTest("startInterviewController applies company, interviewType, and difficulty to question prompt and payload", async () => {
    let sentPayload = null;
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/interview/start")) {
        sentPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: "Interview started successfully",
            session_id: sentPayload.session_id,
            status: "waiting_for_answer",
            question: "Given a distributed cache scenario at Meta, walk me through handling cache stampede under heavy concurrency."
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Systems Engineer",
        targetCompany: "Meta",
        interviewType: "Technical",
        difficulty: "Hard",
        experienceLevel: "senior",
        yearsOfExperience: 6
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    techHardSessionId = res.data.sessionId;
    assert.ok(techHardSessionId);
    assert.equal(res.data.interviewType, "Technical");
    assert.equal(res.data.difficulty, "Hard");
    assert.ok(Array.isArray(res.data.stagePlan));
    assert.equal(res.data.currentStageIndex, 0);
    assert.equal(res.data.totalStages, res.data.stagePlan.length);

    // Verify prompt instructions
    assert.ok(lastGeneratedPrompt.includes("Difficulty: Hard"), "Prompt must instruct Hard difficulty");
    assert.ok(lastGeneratedPrompt.includes("Interview Type: Technical"), "Prompt must instruct Technical type");
    assert.ok(lastGeneratedPrompt.includes("Meta"), "Prompt must reference company context");
    assert.ok(lastGeneratedPrompt.includes("Do not make false claims that this is an official or proprietary question"), "Must avoid false official claims");

    // Verify AI payload
    assert.equal(sentPayload.interview_type, "Technical");
    assert.equal(sentPayload.difficulty, "Hard");
    assert.equal(sentPayload.target_company, "Meta");
    assert.ok(Array.isArray(sentPayload.stage_plan));

    // Verify MongoDB ChatSession persistence
    const stored = inMemoryChatSessions.get(techHardSessionId);
    assert.ok(stored);
    assert.equal(stored.interviewType, "Technical");
    assert.equal(stored.difficulty, "Hard");
    assert.equal(stored.currentStageIndex, 0);
    assert.deepEqual(stored.stagePlan, res.data.stagePlan);
  });

  // 17. Backend Progress Tracking Matches Session State
  await runTest("submitInterviewAnswerController advances backend stage progress and persists currentStageIndex", async () => {
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes(`/interview/${techHardSessionId}/answer`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: "waiting_for_answer",
            current_stage_index: 1,
            question: "Next stage: let us delve into your practical problem solving approach with mutex locks.",
            evaluation: "Strong understanding of cache stampede mitigation using probabilistic early expiration."
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: techHardSessionId },
      body: { answer: "I would implement probabilistic early expiration (XFetch) or a mutex lock on cache misses." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.currentStageIndex, 1);
    assert.equal(res.data.completedStages, 1);

    const stored = inMemoryChatSessions.get(techHardSessionId);
    assert.equal(stored.currentStageIndex, 1);
    assert.equal(stored.messages.length, 3);
  });

  // 18. Restart Interview Initializes Fresh Session & Preserves Previous Session History
  await runTest("Restarting interview creates fresh session with new configuration while preserving historical session intact", async () => {
    let restartPayload = null;
    mockFetchHandler = async (url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/interview/start")) {
        restartPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message: "Interview started successfully",
            session_id: restartPayload.session_id,
            status: "waiting_for_answer",
            question: "Welcome! To start our Behavioral interview, tell me about a time you resolved a conflict within your engineering team."
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    // User restarts with different config: Behavioral, Easy, Amazon
    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Engineering Manager",
        targetCompany: "Amazon",
        interviewType: "Behavioral",
        difficulty: "Easy",
        experienceLevel: "lead"
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    const restartedSessionId = res.data.sessionId;
    assert.ok(restartedSessionId);
    assert.notEqual(restartedSessionId, techHardSessionId, "Restart must produce a fresh new session ID");
    assert.equal(res.data.interviewType, "Behavioral");
    assert.equal(res.data.difficulty, "Easy");
    assert.equal(res.data.currentStageIndex, 0);

    // Verify the historical session (techHardSessionId) remains completely intact in DB
    const historicalSession = inMemoryChatSessions.get(techHardSessionId);
    assert.ok(historicalSession, "Previous session must still exist in MongoDB");
    assert.equal(historicalSession.targetCompany, "Meta");
    assert.equal(historicalSession.interviewType, "Technical");
    assert.equal(historicalSession.difficulty, "Hard");
    assert.equal(historicalSession.currentStageIndex, 1);
    assert.equal(historicalSession.messages.length, 3);

    // Verify the newly restarted session has fresh state and zero leaked history
    const newSession = inMemoryChatSessions.get(restartedSessionId);
    assert.ok(newSession);
    assert.equal(newSession.targetCompany, "Amazon");
    assert.equal(newSession.interviewType, "Behavioral");
    assert.equal(newSession.difficulty, "Easy");
    assert.equal(newSession.currentStageIndex, 0);
    assert.equal(newSession.messages.length, 1);
  });

  // 19. Welcome message is first, generated by Pepe, and requests candidate introduction
  await runTest("Welcome message is first and begins with Pepe's introduction and asks candidate to introduce themselves", async () => {
    mockFetchHandler = async (url, opts) => {
      const payload = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: "Interview started successfully",
          session_id: payload.session_id,
          status: "waiting_for_answer",
          question: payload.first_question
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Frontend Developer",
        targetCompany: "Google",
        interviewType: "Behavioral",
        difficulty: "Medium",
        experienceLevel: "fresher"
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.currentStageIndex, 0);
    assert.ok(Array.isArray(res.data.stagePlan));
    assert.equal(res.data.stagePlan[0], "Welcome and Introduction");
    assert.equal(res.data.currentStage, "Welcome and Introduction");

    // Verify opening prompt instructs Pepe welcome
    assert.ok(lastGeneratedPrompt.includes("You are Pepe"), "Prompt must instruct AI interviewer persona Pepe");
    assert.ok(lastGeneratedPrompt.includes("Welcome and Introduction"), "Prompt must target Welcome and Introduction stage");
    assert.ok(lastGeneratedPrompt.includes("introduce themselves"), "Prompt must request candidate introduction");
    assert.ok(lastGeneratedPrompt.includes("Do NOT ask complex technical questions"), "Prompt must avoid cold technical questions on turn 0");
  });

  // 20. Introduction stage is initially active with completedStages === 0
  await runTest("Introduction stage is initially active with completedStages = 0, stages 1..N pending", async () => {
    const fresherPlan = buildAdaptiveStagePlan("fresher", "Technical", "Medium");
    assert.equal(fresherPlan[0], "Welcome and Introduction");

    const seniorPlan = buildAdaptiveStagePlan("senior", "Behavioral", "Hard");
    assert.equal(seniorPlan[0], "Welcome and Introduction");

    const mixedPlan = buildAdaptiveStagePlan("mid", "Mixed", "Medium");
    assert.equal(mixedPlan[0], "Welcome and Introduction");
  });

  // 21. Fresher + Hard + Technical produces fresher-appropriate plan with harder questions
  await runTest("Fresher + Hard + Technical produces fresher-appropriate technical plan without enterprise system design", async () => {
    const stages = buildAdaptiveStagePlan("fresher", "Technical", "Hard");
    assert.equal(stages[0], "Welcome and Introduction");
    assert.ok(stages.includes("Fundamentals and Core CS"));
    assert.ok(stages.includes("Problem Solving"));
    assert.ok(!stages.some(s => /distributed system design/i.test(s)), "Fresher must not have mandatory enterprise system design");
  });

  // 22. Fresher + Easy + Behavioral produces an entry-level behavioral plan
  await runTest("Fresher + Easy + Behavioral produces an entry-level behavioral plan", async () => {
    const stages = buildAdaptiveStagePlan("fresher", "Behavioral", "Easy");
    assert.equal(stages[0], "Welcome and Introduction");
    assert.ok(stages.some(s => /academic|internship|teamwork/i.test(s)));
    assert.ok(stages.some(s => /communication|adaptability|learning/i.test(s)));
    assert.ok(!stages.some(s => /professional experience/i.test(s)), "Fresher should not require professional work experience");
  });

  // 23. Senior + Medium + Mixed produces a senior-appropriate mixed plan
  await runTest("Senior + Medium + Mixed produces a senior-appropriate mixed plan", async () => {
    const stages = buildAdaptiveStagePlan("senior", "Mixed", "Medium");
    assert.equal(stages[0], "Welcome and Introduction");
    assert.ok(stages.some(s => /technical ownership|professional experience/i.test(s)));
    assert.ok(stages.some(s => /system design/i.test(s)));
    assert.ok(stages.some(s => /leadership/i.test(s)));
  });

  // 24. Behavioral mode does not start with an unrelated technical question
  await runTest("Behavioral mode opening welcome does not contain technical coding questions", async () => {
    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Full Stack Engineer",
        targetCompany: "Netflix",
        interviewType: "Behavioral",
        difficulty: "Easy",
        experienceLevel: "fresher"
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.interviewType, "Behavioral");
    // Verify question is not a cold coding algorithm
    assert.ok(!res.data.question.includes("Given an array of integers"), "Opening question must not be a cold algorithmic puzzle");
    assert.ok(!res.data.question.includes("implement a binary search"), "Opening question must not be a coding puzzle");
  });

  // 25. Stage transition from 0 to 1 occurs when candidate answers introduction
  await runTest("Stage transitions occur only when appropriate: answering introduction advances to stage 1", async () => {
    const testSessionId = `test-stage-trans-${Date.now()}`;
    const initialStages = buildAdaptiveStagePlan("fresher", "Technical", "Medium");

    const sessionDoc = {
      sessionId: testSessionId,
      user: userA.id,
      stagePlan: initialStages,
      currentStageIndex: 0,
      status: "active",
      messages: [{ sender: "ai", text: "Welcome! Tell me about yourself." }]
    };
    inMemoryChatSessions.set(testSessionId, sessionDoc);

    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "waiting_for_answer",
          current_stage_index: 1,
          question: "Thank you for the introduction! To start with fundamentals, could you describe...",
          evaluation: "Clear and concise introduction highlighting coursework."
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: testSessionId },
      body: { answer: "Hi Pepe! I am a final-year CS student passionate about distributed systems." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.currentStageIndex, 1);
    assert.equal(res.data.completedStages, 1);
    assert.equal(res.data.stagePlan[0], "Welcome and Introduction");
    assert.equal(res.data.currentStage, res.data.stagePlan[1]);
  });

  // 26. getInterviewSessionController restores correct session and progress on reload
  await runTest("getInterviewSessionController restores correct session and progress on reload", async () => {
    const reloadSessionId = `test-reload-${Date.now()}`;
    const stages = buildAdaptiveStagePlan("mid", "Technical", "Medium");

    const sessionDoc = {
      sessionId: reloadSessionId,
      user: userA.id,
      targetRole: "Backend Engineer",
      targetCompany: "Stripe",
      interviewType: "Technical",
      difficulty: "Medium",
      experienceLevel: "mid",
      stagePlan: stages,
      currentStageIndex: 2,
      status: "active",
      messages: [
        { sender: "ai", text: "Welcome!" },
        { sender: "user", text: "Intro answer" },
        { sender: "ai", text: "Stage 1 question" },
        { sender: "user", text: "Stage 1 answer" },
        { sender: "ai", text: "Stage 2 question" }
      ]
    };
    inMemoryChatSessions.set(reloadSessionId, sessionDoc);

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: reloadSessionId }
    });

    await getInterviewSessionController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.sessionId, reloadSessionId);
    assert.equal(res.data.currentStageIndex, 2);
    assert.equal(res.data.completedStages, 2);
    assert.equal(res.data.totalStages, stages.length);
    assert.deepEqual(res.data.stagePlan, stages);
    assert.equal(res.data.targetCompany, "Stripe");
    assert.equal(res.data.interviewType, "Technical");
    assert.equal(res.data.messages.length, 5);
  });

  // 27. startInterviewController initializes both startingDifficulty and adaptiveDifficulty
  await runTest("startInterviewController initializes and returns both startingDifficulty and adaptiveDifficulty", async () => {
    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: `test-start-diff-${Date.now()}`,
          question: "Welcome! Could you introduce yourself?",
          starting_difficulty: "Easy",
          adaptive_difficulty: "Easy",
          stage_plan: ["Welcome and Introduction", "Fundamentals", "Wrap-up"],
          current_stage_index: 0
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Frontend Developer",
        targetCompany: "Google",
        interviewType: "Behavioral",
        difficulty: "Easy",
        experienceLevel: "fresher"
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.startingDifficulty, "Easy");
    assert.equal(res.data.adaptiveDifficulty, "Easy");
    assert.equal(res.data.difficulty, "Easy");

    const saved = inMemoryChatSessions.get(res.data.sessionId);
    assert.ok(saved);
    assert.equal(saved.startingDifficulty, "Easy");
    assert.equal(saved.adaptiveDifficulty, "Easy");
  });

  // 28. Upward adaptation (HARDER): updates adaptiveDifficulty from Easy to Medium, keeping startingDifficulty Easy
  await runTest("submitInterviewAnswerController adapts upward on HARDER without mutating startingDifficulty", async () => {
    const testSessionId = `test-adapt-harder-${Date.now()}`;
    const initialStages = ["Welcome and Introduction", "Core Concepts", "Problem Solving", "Wrap-up"];

    const sessionDoc = {
      sessionId: testSessionId,
      user: userA.id,
      startingDifficulty: "Easy",
      adaptiveDifficulty: "Easy",
      difficulty: "Easy",
      stagePlan: initialStages,
      currentStageIndex: 1,
      status: "active",
      messages: [{ sender: "ai", text: "Explain closures in JavaScript." }]
    };
    inMemoryChatSessions.set(testSessionId, sessionDoc);

    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "waiting_for_answer",
          next_action: "HARDER",
          current_stage_index: 2,
          adaptive_difficulty: "Medium",
          starting_difficulty: "Easy",
          question: "Excellent explanation. Let's step up the depth: design an event emitter library...",
          evaluation: "Comprehensive answer demonstrating deep grasp of lexical scope."
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: testSessionId },
      body: { answer: "A closure is the combination of a function bundled together with references to its surrounding state..." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.startingDifficulty, "Easy", "Starting difficulty must remain Easy");
    assert.equal(res.data.adaptiveDifficulty, "Medium", "Adaptive difficulty should ratchet to Medium");
    assert.equal(res.data.difficulty, "Medium");

    const saved = inMemoryChatSessions.get(testSessionId);
    assert.equal(saved.startingDifficulty, "Easy");
    assert.equal(saved.adaptiveDifficulty, "Medium");
  });

  // 29. Downward adaptation (EASIER): updates adaptiveDifficulty from Hard to Medium, keeping startingDifficulty Hard
  await runTest("submitInterviewAnswerController adapts downward on EASIER without mutating startingDifficulty", async () => {
    const testSessionId = `test-adapt-easier-${Date.now()}`;
    const initialStages = ["Welcome and Introduction", "Advanced Architecture", "Optimization", "Wrap-up"];

    const sessionDoc = {
      sessionId: testSessionId,
      user: userA.id,
      startingDifficulty: "Hard",
      adaptiveDifficulty: "Hard",
      difficulty: "Hard",
      stagePlan: initialStages,
      currentStageIndex: 1,
      status: "active",
      messages: [{ sender: "ai", text: "Design a globally distributed lock using Raft." }]
    };
    inMemoryChatSessions.set(testSessionId, sessionDoc);

    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "waiting_for_answer",
          next_action: "EASIER",
          current_stage_index: 1,
          adaptive_difficulty: "Medium",
          starting_difficulty: "Hard",
          question: "Let's calibrate: consider a single-leader system first. How would lease timeouts work?",
          evaluation: "Candidate struggled with multi-region consensus details; dial back to single-leader baseline."
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: testSessionId },
      body: { answer: "I'm not completely sure how Raft handles split-brain in multi-region setups." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.startingDifficulty, "Hard", "Starting difficulty must remain Hard");
    assert.equal(res.data.adaptiveDifficulty, "Medium", "Adaptive difficulty should calibrate down to Medium");

    const saved = inMemoryChatSessions.get(testSessionId);
    assert.equal(saved.startingDifficulty, "Hard");
    assert.equal(saved.adaptiveDifficulty, "Medium");
  });

  // 30. Preserved difficulty on SIMILAR action
  await runTest("submitInterviewAnswerController preserves adaptiveDifficulty on SIMILAR action", async () => {
    const testSessionId = `test-adapt-similar-${Date.now()}`;

    const sessionDoc = {
      sessionId: testSessionId,
      user: userA.id,
      startingDifficulty: "Medium",
      adaptiveDifficulty: "Medium",
      difficulty: "Medium",
      stagePlan: ["Welcome", "Stage 1", "Stage 2"],
      currentStageIndex: 1,
      status: "active",
      messages: [{ sender: "ai", text: "Question 1" }]
    };
    inMemoryChatSessions.set(testSessionId, sessionDoc);

    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: "waiting_for_answer",
          next_action: "SIMILAR",
          current_stage_index: 2,
          adaptive_difficulty: "Medium",
          starting_difficulty: "Medium",
          question: "Question 2 on similar depth",
          evaluation: "Solid adequate answer matching expectations."
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: testSessionId },
      body: { answer: "Standard competent answer." }
    });

    await submitInterviewAnswerController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.startingDifficulty, "Medium");
    assert.equal(res.data.adaptiveDifficulty, "Medium");
  });

  // 31. Session isolation on restart: creating a new session resets adaptive difficulty and does not corrupt previous session
  await runTest("Restarting interview isolates previous session state and resets adaptive baseline", async () => {
    const oldSessionId = `old-session-${Date.now()}`;
    const oldDoc = {
      sessionId: oldSessionId,
      user: userA.id,
      startingDifficulty: "Easy",
      adaptiveDifficulty: "Hard",
      difficulty: "Hard",
      stagePlan: ["Welcome", "Wrap-up"],
      currentStageIndex: 1,
      status: "completed",
      messages: [{ sender: "ai", text: "Old Question" }]
    };
    inMemoryChatSessions.set(oldSessionId, oldDoc);

    const newSessionId = `new-session-${Date.now()}`;
    mockFetchHandler = async (url, opts) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          session_id: newSessionId,
          question: "New interview welcome question.",
          starting_difficulty: "Medium",
          adaptive_difficulty: "Medium",
          stage_plan: ["Welcome and Introduction", "Fundamentals", "Wrap-up"],
          current_stage_index: 0
        })
      };
    };

    const { req, res } = createMockReqRes({
      user: userA,
      body: {
        targetRole: "Full Stack Engineer",
        targetCompany: "Amazon",
        interviewType: "Mixed",
        difficulty: "Medium",
        experienceLevel: "mid"
      }
    });

    await startInterviewController(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.data.sessionId);
    assert.notEqual(res.data.sessionId, oldSessionId);
    assert.equal(res.data.startingDifficulty, "Medium");
    assert.equal(res.data.adaptiveDifficulty, "Medium");

    // Verify old session remains unaltered in storage
    const oldSessionPersisted = inMemoryChatSessions.get(oldSessionId);
    assert.equal(oldSessionPersisted.startingDifficulty, "Easy");
    assert.equal(oldSessionPersisted.adaptiveDifficulty, "Hard");
    assert.equal(oldSessionPersisted.status, "completed");
  });

  // 32. Junior (1-3 yrs) stage plans focus on implementation, debugging, and code quality
  await runTest("Junior stage plans focus on implementation, debugging, and code quality across types", async () => {
    const juniorTech = buildAdaptiveStagePlan("junior", "Technical", "Medium");
    assert.equal(juniorTech[0], "Welcome and Introduction");
    assert.equal(juniorTech[juniorTech.length - 1], "Wrap-up");
    assert.ok(juniorTech.some(s => /implementation|debugging/i.test(s)), "Junior tech must cover feature implementation & debugging");
    assert.ok(juniorTech.some(s => /component design|code quality|practical problem solving/i.test(s)));
    assert.ok(!juniorTech.some(s => /enterprise|distributed system design|cross-system/i.test(s)), "Junior must not be assigned distributed system design");

    const juniorBehav = buildAdaptiveStagePlan("junior", "Behavioral", "Medium");
    assert.ok(juniorBehav.some(s => /professional experience/i.test(s)));
    assert.ok(juniorBehav.some(s => /communication|teamwork/i.test(s)));
    assert.ok(juniorBehav.some(s => /ownership & delivery/i.test(s)));
    assert.ok(!juniorBehav.some(s => /organizational|high-stakes/i.test(s)));

    const juniorMixed = buildAdaptiveStagePlan("junior", "Mixed", "Medium");
    assert.ok(juniorMixed.some(s => /debugging|problem solving/i.test(s)));
    assert.ok(juniorMixed.some(s => /collaboration|behavioral/i.test(s)));
  });

  // 33. Lead / Staff stage plans emphasize cross-system architecture, technology strategy, and organizational leadership
  await runTest("Lead/Staff stage plans emphasize cross-system architecture, technology strategy, and organizational influence", async () => {
    const leadTech = buildAdaptiveStagePlan("lead", "Technical", "Hard");
    assert.equal(leadTech[0], "Welcome and Introduction");
    assert.equal(leadTech[leadTech.length - 1], "Wrap-up");
    assert.ok(leadTech.some(s => /cross-system|enterprise/i.test(s)));
    assert.ok(leadTech.some(s => /strategy|scale|leadership/i.test(s)));

    const leadBehav = buildAdaptiveStagePlan("staff", "Behavioral", "Hard");
    assert.ok(leadBehav.some(s => /technical ownership|influence/i.test(s)));
    assert.ok(leadBehav.some(s => /high-stakes decision making/i.test(s)));
    assert.ok(leadBehav.some(s => /mentorship|conflict resolution/i.test(s)));

    const leadMixed = buildAdaptiveStagePlan("principal", "Mixed", "Hard");
    assert.ok(leadMixed.some(s => /system design|architecture/i.test(s)));
    assert.ok(leadMixed.some(s => /leadership|behavioral/i.test(s)));
  });

  // 34. Focus areas integration customizes evaluative stages without breaking stage progression contract
  await runTest("Focus areas gracefully customize intermediate stages while preserving progression contract", async () => {
    const focusTech = buildAdaptiveStagePlan("mid", "Technical", "Medium", "React Virtual DOM & Concurrent Mode");
    assert.equal(focusTech[0], "Welcome and Introduction", "Must start with Welcome and Introduction");
    assert.equal(focusTech[focusTech.length - 1], "Wrap-up", "Must end with Wrap-up");
    assert.ok(focusTech.length >= 4 && focusTech.length <= 6, "Total stages must be between 4 and 6");
    assert.ok(focusTech.some(s => s.includes("React Virtual DOM")), "Intermediate stage should reflect focus area");

    const focusBehav = buildAdaptiveStagePlan("fresher", "Behavioral", "Easy", "Open Source Teamwork");
    assert.equal(focusBehav[0], "Welcome and Introduction");
    assert.equal(focusBehav[focusBehav.length - 1], "Wrap-up");
    assert.ok(focusBehav.some(s => s.includes("Open Source Teamwork")));
  });

  // 35. All 15 combinations of (level x type) produce distinct, non-empty, contract-compliant stage plans
  await runTest("All 15 combinations of experience level and interview type produce contract-compliant stage plans", async () => {
    const levels = ["intern", "junior", "mid", "senior", "lead"];
    const types = ["Technical", "Behavioral", "Mixed"];

    const generatedPlans = new Map();

    for (const lvl of levels) {
      for (const typ of types) {
        const plan = buildAdaptiveStagePlan(lvl, typ, "Medium");
        const key = `${lvl}:${typ}`;

        assert.ok(Array.isArray(plan), `${key} must return an array`);
        assert.ok(plan.length >= 4 && plan.length <= 6, `${key} length must be between 4 and 6, got ${plan.length}`);
        assert.equal(plan[0], "Welcome and Introduction", `${key} must begin with Welcome and Introduction`);
        assert.equal(plan[plan.length - 1], "Wrap-up", `${key} must end with Wrap-up`);

        // Check that all stage names are non-empty strings
        for (const stage of plan) {
          assert.ok(typeof stage === "string" && stage.trim().length > 0, `${key} has empty stage name`);
        }

        generatedPlans.set(key, plan);
      }
    }

    // Verify that Intern Technical is distinct from Senior Technical
    assert.notDeepEqual(generatedPlans.get("intern:Technical"), generatedPlans.get("senior:Technical"));
    // Verify that Junior Behavioral is distinct from Lead Behavioral
    assert.notDeepEqual(generatedPlans.get("junior:Behavioral"), generatedPlans.get("lead:Behavioral"));
    // Verify that Mid Technical is distinct from Mid Behavioral
    assert.notDeepEqual(generatedPlans.get("mid:Technical"), generatedPlans.get("mid:Behavioral"));
  });

  // 36. Sequential stage progression: answering turns advances stages 0 -> 1 -> 2 with truthful completedStages
  await runTest("Sequential stage progression increments completedStages and updates active stage accurately", async () => {
    const progressionSessionId = `test-progression-${Date.now()}`;
    const stages = [
      "Welcome and Introduction",
      "Core CS Fundamentals",
      "Problem Solving",
      "Applied Coding",
      "Wrap-up"
    ];

    // Initial state: stage 0 active, 0 completed
    const sessionDoc = {
      sessionId: progressionSessionId,
      user: userA.id,
      stagePlan: stages,
      currentStageIndex: 0,
      status: "active",
      startingDifficulty: "Medium",
      adaptiveDifficulty: "Medium",
      difficulty: "Medium",
      messages: [{ sender: "ai", text: "Welcome! Tell me about yourself." }]
    };
    inMemoryChatSessions.set(progressionSessionId, sessionDoc);

    // Turn 1: answering welcome question advances to stage 1
    mockFetchHandler = async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "waiting_for_answer",
        current_stage_index: 1,
        adaptive_difficulty: "Medium",
        starting_difficulty: "Medium",
        question: "Great to meet you. In Core CS Fundamentals, could you explain hashing?",
        evaluation: "Clear introduction."
      })
    });

    const { req: req1, res: res1 } = createMockReqRes({
      user: userA,
      params: { sessionId: progressionSessionId },
      body: { answer: "I am a CS student passionate about backend systems." }
    });
    await submitInterviewAnswerController(req1, res1);

    assert.equal(res1.statusCode, 200);
    assert.equal(res1.data.currentStageIndex, 1);
    assert.equal(res1.data.completedStages, 1, "After answering welcome, exactly 1 stage is completed");
    assert.equal(res1.data.currentStage, "Core CS Fundamentals");

    // Turn 2: answering stage 1 advances to stage 2
    mockFetchHandler = async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "waiting_for_answer",
        current_stage_index: 2,
        adaptive_difficulty: "Medium",
        starting_difficulty: "Medium",
        question: "Now for Problem Solving: how would you detect a cycle in a linked list?",
        evaluation: "Strong hash collision explanation."
      })
    });

    const { req: req2, res: res2 } = createMockReqRes({
      user: userA,
      params: { sessionId: progressionSessionId },
      body: { answer: "A hash table computes an index using a hash function, handling collisions via chaining or open addressing." }
    });
    await submitInterviewAnswerController(req2, res2);

    assert.equal(res2.statusCode, 200);
    assert.equal(res2.data.currentStageIndex, 2);
    assert.equal(res2.data.completedStages, 2, "After stage 1 answer, exactly 2 stages are completed");
    assert.equal(res2.data.currentStage, "Problem Solving");
  });

  // 37. Wrap-up stage and completed status only trigger upon actual conclusion
  await runTest("Wrap-up stage and completed status only trigger upon interview conclusion, never prematurely", async () => {
    const wrapSessionId = `test-wrapup-${Date.now()}`;
    const stages = ["Welcome and Introduction", "Fundamentals", "Applied Coding", "Wrap-up"];

    const sessionDoc = {
      sessionId: wrapSessionId,
      user: userA.id,
      stagePlan: stages,
      currentStageIndex: 2, // In Applied Coding
      status: "active",
      messages: [
        { sender: "ai", text: "Welcome" },
        { sender: "user", text: "Intro" },
        { sender: "ai", text: "Q1" },
        { sender: "user", text: "A1" },
        { sender: "ai", text: "Q2" }
      ]
    };
    inMemoryChatSessions.set(wrapSessionId, sessionDoc);

    // During normal intermediate question, status is NOT completed and completedStages < totalStages
    const { req: reqCheck, res: resCheck } = createMockReqRes({
      user: userA,
      params: { sessionId: wrapSessionId }
    });
    await getInterviewSessionController(reqCheck, resCheck);
    assert.equal(resCheck.data.status, "active");
    assert.equal(resCheck.data.completedStages, 2);
    assert.equal(resCheck.data.totalStages, 4);
    assert.notEqual(resCheck.data.completedStages, resCheck.data.totalStages);

    // Now candidate completes final stage -> interview concludes
    mockFetchHandler = async (url, opts) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        current_stage_index: 3,
        final_report: "### Candidate Evaluation Report\n\nOverall: Strong performance.",
        adaptive_difficulty: "Medium",
        starting_difficulty: "Medium"
      })
    });

    const { req: reqEnd, res: resEnd } = createMockReqRes({
      user: userA,
      params: { sessionId: wrapSessionId },
      body: { answer: "USER_ACTION: End interview" }
    });
    await submitInterviewAnswerController(reqEnd, resEnd);

    assert.equal(resEnd.statusCode, 200);
    assert.equal(resEnd.data.status, "completed");
    assert.equal(resEnd.data.completedStages, 4, "When completed, completedStages equals totalStages");
    assert.equal(resEnd.data.currentStage, "Wrap-up");
  });

  // 38. Reloading in-flight session restores exact stage index, completed stages, and question history
  await runTest("Reloading in-flight session restores exact stage index, completed stages, and question history", async () => {
    const inflightSessionId = `test-inflight-reload-${Date.now()}`;
    const stages = ["Welcome and Introduction", "Core Concepts", "Problem Solving", "Wrap-up"];

    const sessionDoc = {
      sessionId: inflightSessionId,
      user: userA.id,
      targetRole: "Full Stack Engineer",
      targetCompany: "Netflix",
      interviewType: "Mixed",
      difficulty: "Hard",
      startingDifficulty: "Medium",
      adaptiveDifficulty: "Hard",
      stagePlan: stages,
      currentStageIndex: 2,
      status: "active",
      messages: [
        { sender: "ai", text: "Welcome!" },
        { sender: "user", text: "Hello, I am ready." },
        { sender: "ai", text: "Q1" },
        { sender: "user", text: "A1" },
        { sender: "ai", text: "Q2" }
      ]
    };
    inMemoryChatSessions.set(inflightSessionId, sessionDoc);

    const { req, res } = createMockReqRes({
      user: userA,
      params: { sessionId: inflightSessionId }
    });
    await getInterviewSessionController(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.sessionId, inflightSessionId);
    assert.equal(res.data.currentStageIndex, 2);
    assert.equal(res.data.completedStages, 2);
    assert.equal(res.data.totalStages, 4);
    assert.equal(res.data.currentStage, "Problem Solving");
    assert.equal(res.data.startingDifficulty, "Medium");
    assert.equal(res.data.adaptiveDifficulty, "Hard");
    assert.equal(res.data.messages.length, 5);
  });

  console.log("\n-------------------------------------------------");
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log("-------------------------------------------------");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Test runner encountered unexpected error:", err);
  process.exit(1);
});
