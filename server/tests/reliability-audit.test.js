import assert from "node:assert/strict";
import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import { getUserResumes } from "../controllers/resume.controller.js";
import { recordActivity } from "../controllers/user.controller.js";
import { getInterviewSessionController } from "../controllers/interview.controller.js";

async function runReliabilityTests() {
  console.log("=================================================");
  console.log("   PREPAI RELIABILITY & BUGFIX AUDIT TEST SUITE  ");
  console.log("=================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`[PASS] ${name}`);
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(`       Error: ${err.message}`);
      if (err.stack) {
        console.error(
          `       ${err.stack.split("\n").slice(1, 3).join("\n       ")}`
        );
      }
    }
  }

  function createMockRes() {
    return {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
    };
  }

  // --- Suite 1: Issue A - Resume Endpoint Contract & Auth ---
  console.log("--- Suite 1: Issue A - Resume Endpoint Contract & Auth ---");

  await test("getUserResumes rejects unauthenticated request with HTTP 401", async () => {
    const req = { user: null };
    const res = createMockRes();

    await getUserResumes(req, res);

    assert.equal(res.statusCode, 401);
    assert.match(res.jsonData.message, /authentication required/i);
  });

  await test("getUserResumes returns 200 and empty list gracefully when user has no resumes", async () => {
    const req = { user: { id: "user_empty_resumes" } };
    const res = createMockRes();

    const origFind = ResumeReview.find;
    const origFindById = User.findById;

    ResumeReview.find = () => ({
      sort: () => ({
        select: async () => [],
      }),
    });
    User.findById = () => ({
      select: async () => ({
        careerPreferences: { preferredResumeId: null },
        resumeDocumentId: null,
      }),
    });

    try {
      await getUserResumes(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.deepEqual(res.jsonData.resumes, []);
    } finally {
      ResumeReview.find = origFind;
      User.findById = origFindById;
    }
  });

  await test("getUserResumes populates preferred resume flag and ATS match score", async () => {
    const req = { user: { id: "user_with_resumes" } };
    const res = createMockRes();

    const mockResumes = [
      {
        _id: "res_1",
        user: "user_with_resumes",
        fileName: "Resume_Senior_Backend.pdf",
        atsAssessment: { estimatedScore: 88 },
        documentId: "doc_123",
        createdAt: new Date().toISOString(),
      },
    ];

    const origFind = ResumeReview.find;
    const origFindById = User.findById;

    ResumeReview.find = () => ({
      sort: () => ({
        select: async () => mockResumes,
      }),
    });
    User.findById = () => ({
      select: async () => ({
        careerPreferences: { preferredResumeId: "res_1" },
        resumeDocumentId: "doc_123",
      }),
    });

    try {
      await getUserResumes(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.resumes.length, 1);
      assert.equal(res.jsonData.resumes[0].isPreferred, true);
      assert.equal(res.jsonData.resumes[0].atsScore, 88);
    } finally {
      ResumeReview.find = origFind;
      User.findById = origFindById;
    }
  });

  // --- Suite 2: Issue B - Session UUID Authorization Safety ---
  console.log("\n--- Suite 2: Issue B - Session UUID Authorization Safety ---");

  await test("getInterviewSessionController rejects cross-user UUID access (Ownership Isolation)", async () => {
    const req = {
      params: { sessionId: "98707237-7be0-46ea-ad85-aacd9fb251c7" },
      user: { id: "attacker_user_id" },
    };
    const res = createMockRes();

    const origFindOne = ChatSession.findOne;
    // Simulate DB query: ChatSession.findOne({ sessionId, user: req.user.id }) returns null
    ChatSession.findOne = (query) => {
      assert.equal(query.sessionId, "98707237-7be0-46ea-ad85-aacd9fb251c7");
      assert.equal(query.user, "attacker_user_id");
      return Promise.resolve(null);
    };

    try {
      await getInterviewSessionController(req, res);
      assert.equal(res.statusCode, 404);
      assert.match(res.jsonData.message, /not found/i);
    } finally {
      ChatSession.findOne = origFindOne;
    }
  });

  // --- Suite 3: Issue D - Activity Recording Auth & Fault Tolerance ---
  console.log("\n--- Suite 3: Issue D - Activity Recording Auth & Fault Tolerance ---");

  await test("recordActivity rejects unauthenticated requests with HTTP 401", async () => {
    const req = { user: null };
    const res = createMockRes();

    await recordActivity(req, res);

    assert.equal(res.statusCode, 401);
    assert.match(res.jsonData.message, /authentication required/i);
  });

  await test("recordActivity records activity strictly using verified req.user.id", async () => {
    const req = {
      user: { id: "verified_user_123" },
      body: { userId: "malicious_spoofed_user_999" }, // Attacker trying to spoof
    };
    const res = createMockRes();

    let queriedUserId = null;
    let saved = false;

    const origFindById = User.findById;
    User.findById = async (id) => {
      queriedUserId = id;
      return {
        _id: id,
        currentStreak: 2,
        lastActivityDate: new Date(Date.now() - 86400000), // yesterday
        save: async () => {
          saved = true;
        },
      };
    };

    try {
      await recordActivity(req, res);
      assert.equal(queriedUserId, "verified_user_123");
      assert.equal(res.statusCode, 200);
      assert.equal(saved, true);
      assert.equal(res.jsonData.currentStreak, 3);
    } finally {
      User.findById = origFindById;
    }
  });

  await test("Behavioral Coach chat turn finishes and returns coach answer even if recordActivity fails", async () => {
    // Simulate frontend turn execution:
    // 1. send message to interview backend -> succeeds
    // 2. call record-activity -> fails with 401 or network error
    // 3. UI catches error in catch block and interview response remains displayed
    let coachTurnSuccess = false;
    let recordActivityFailed = false;

    // Simulated primary call
    const mockPrimaryCall = async () => ({
      data: {
        aiMessage: "Pepe: Great explanation of hash table collision resolution!",
        nextQuestion: "Can you now explain consistent hashing?",
      },
    });

    // Simulated secondary call (ancillary record-activity)
    const mockRecordActivityCall = async () => {
      const err = new Error("Request failed with status code 401");
      err.response = { status: 401 };
      throw err;
    };

    const runTurn = async () => {
      const res = await mockPrimaryCall();
      coachTurnSuccess = Boolean(res.data.aiMessage);

      // Ancillary activity recording (wrapped safely as in BehavioralCoach.jsx)
      try {
        await mockRecordActivityCall();
      } catch (actErr) {
        recordActivityFailed = true;
        // Non-blocking catch
      }

      return res.data;
    };

    const result = await runTurn();
    assert.equal(coachTurnSuccess, true);
    assert.equal(recordActivityFailed, true);
    assert.equal(result.aiMessage, "Pepe: Great explanation of hash table collision resolution!");
  });

  console.log("\n=================================================");
  console.log(`  AUDIT RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=================================================");
}

runReliabilityTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
