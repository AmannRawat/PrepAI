import assert from "node:assert/strict";
import User from "../models/User.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import UserMemory from "../models/UserMemory.model.js";
import {
  getUserResumes,
  setPreferredResume,
} from "../controllers/resume.controller.js";
import {
  getUserMemoriesController,
  createUserMemoryController,
  updateUserMemoryController,
  deleteUserMemoryController,
} from "../controllers/user.controller.js";

async function runTests() {
  console.log("=================================================");
  console.log("   SETTINGS IA & PERSONALIZATION INTEGRATION     ");
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

  // Backup original model methods
  const originalUserFindById = User.findById;
  const originalUserFindByIdAndUpdate = User.findByIdAndUpdate;
  const originalResumeFind = ResumeReview.find;
  const originalResumeFindOne = ResumeReview.findOne;
  const originalMemoryFind = UserMemory.find;
  const originalMemoryCreate = UserMemory.create;
  const originalMemoryFindOneAndUpdate = UserMemory.findOneAndUpdate;
  const originalMemoryFindOneAndDelete = UserMemory.findOneAndDelete;

  try {
    // --- SUITE 1: RESUMES & PREFERRED RESUME ---
    console.log("--- Suite 1: User Resumes & Preferred Selection ---");

    await test("getUserResumes rejects unauthenticated requests with 401", async () => {
      const req = { user: null };
      const res = createMockRes();
      await getUserResumes(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData.success, false);
    });

    await test("getUserResumes lists only authenticated user's resumes with ATS scores and flags preferred", async () => {
      const mockUserDoc = {
        _id: "user_111",
        careerPreferences: { preferredResumeId: "resume_2" },
        resumeDocumentId: "doc_rag_2",
      };

      const mockResumes = [
        {
          _id: "resume_1",
          user: "user_111",
          fileName: "Amann_SDE_Resume.pdf",
          jobTitle: "Software Engineer",
          atsAssessment: { estimatedScore: "78" },
          documentId: "doc_rag_1",
          createdAt: new Date("2026-10-20"),
        },
        {
          _id: "resume_2",
          user: "user_111",
          fileName: "Amann_Senior_Resume.pdf",
          jobTitle: "Senior Full Stack Engineer",
          atsAssessment: { estimatedScore: "92" },
          documentId: "doc_rag_2",
          createdAt: new Date("2026-10-25"),
        },
      ];

      User.findById = (id) => ({
        select: () => mockUserDoc,
      });

      ResumeReview.find = (query) => {
        assert.equal(query.user, "user_111");
        return {
          sort: () => ({
            select: () => mockResumes,
          }),
        };
      };

      const req = { user: { id: "user_111" } };
      const res = createMockRes();
      await getUserResumes(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.resumes.length, 2);
      assert.equal(res.jsonData.resumes[0].isPreferred, false);
      assert.equal(res.jsonData.resumes[1].isPreferred, true);
      assert.equal(res.jsonData.resumes[1].isHighestScore, true);
    });

    await test("setPreferredResume rejects resume owned by another user with 404 (Ownership Isolation)", async () => {
      // User B tries to set User A's resume as preferred
      ResumeReview.findOne = async (query) => {
        if (query._id === "resume_user_a" && query.user === "user_b") {
          return null; // Not found for User B!
        }
        return null;
      };

      const req = {
        user: { id: "user_b" },
        body: { resumeId: "resume_user_a" },
      };
      const res = createMockRes();
      await setPreferredResume(req, res);

      assert.equal(res.statusCode, 404);
      assert.equal(res.jsonData.success, false);
      assert.match(res.jsonData.message, /not found or does not belong/i);
    });

    await test("setPreferredResume updates user preferredResumeId and resumeDocumentId", async () => {
      let savedUpdates = null;

      ResumeReview.findOne = async (query) => {
        if (query._id === "resume_user_a" && query.user === "user_a") {
          return {
            _id: "resume_user_a",
            user: "user_a",
            documentId: "doc_rag_user_a",
          };
        }
        return null;
      };

      User.findByIdAndUpdate = async (userId, update) => {
        savedUpdates = { userId, update };
        return { _id: userId };
      };

      const req = {
        user: { id: "user_a" },
        body: { resumeId: "resume_user_a" },
      };
      const res = createMockRes();
      await setPreferredResume(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(savedUpdates.userId, "user_a");
      assert.equal(
        savedUpdates.update.$set["careerPreferences.preferredResumeId"],
        "resume_user_a"
      );
      assert.equal(
        savedUpdates.update.$set.resumeDocumentId,
        "doc_rag_user_a"
      );
    });

    // --- SUITE 2: USER PERSONALIZATION MEMORY ---
    console.log("\n--- Suite 2: Personalization Memory (What Pepe Knows) ---");

    await test("getUserMemoriesController returns authenticated user memories", async () => {
      const mockMemories = [
        {
          _id: "mem_1",
          user: "user_a",
          category: "technical_strength",
          content: "Strong understanding of distributed system consistency models",
          source: "interview",
          confidence: 0.9,
        },
        {
          _id: "mem_2",
          user: "user_a",
          category: "experience",
          content: "5 years building React and TypeScript applications",
          source: "manual",
          confidence: 1.0,
        },
      ];

      UserMemory.find = (query) => {
        assert.equal(query.user, "user_a");
        return {
          sort: () => mockMemories,
        };
      };

      const req = { user: { id: "user_a" } };
      const res = createMockRes();
      await getUserMemoriesController(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.memories.length, 2);
    });

    await test("createUserMemoryController validates category and creates manual memory", async () => {
      let createdDoc = null;
      UserMemory.create = async (doc) => {
        createdDoc = doc;
        return { _id: "mem_new", ...doc };
      };

      const req = {
        user: { id: "user_a" },
        body: {
          category: "technical_strength",
          content: "Expertise in PostgreSQL index optimization",
        },
      };
      const res = createMockRes();
      await createUserMemoryController(req, res);

      assert.equal(res.statusCode, 201);
      assert.equal(res.jsonData.success, true);
      assert.equal(createdDoc.user, "user_a");
      assert.equal(createdDoc.source, "manual");
      assert.equal(createdDoc.confidence, 1.0);
      assert.equal(createdDoc.content, "Expertise in PostgreSQL index optimization");
    });

    await test("createUserMemoryController rejects invalid categories with 400", async () => {
      const req = {
        user: { id: "user_a" },
        body: {
          category: "invalid_category",
          content: "Some memory",
        },
      };
      const res = createMockRes();
      await createUserMemoryController(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.jsonData.success, false);
      assert.match(res.jsonData.message, /Invalid or missing memory category/i);
    });

    await test("updateUserMemoryController enforces ownership between users", async () => {
      UserMemory.findOneAndUpdate = async (query) => {
        // Query must match both memory id and authenticated user id
        if (query._id === "mem_user_a" && query.user === "user_b") {
          return null; // Not found for user_b!
        }
        return null;
      };

      const req = {
        user: { id: "user_b" },
        params: { id: "mem_user_a" },
        body: { content: "Tampered memory" },
      };
      const res = createMockRes();
      await updateUserMemoryController(req, res);

      assert.equal(res.statusCode, 404);
      assert.equal(res.jsonData.success, false);
    });

    await test("deleteUserMemoryController removes memory owned by authenticated user", async () => {
      UserMemory.findOneAndDelete = async (query) => {
        if (query._id === "mem_to_delete" && query.user === "user_a") {
          return { _id: "mem_to_delete" };
        }
        return null;
      };

      const req = {
        user: { id: "user_a" },
        params: { id: "mem_to_delete" },
      };
      const res = createMockRes();
      await deleteUserMemoryController(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
    });

  } finally {
    // Restore original methods
    User.findById = originalUserFindById;
    User.findByIdAndUpdate = originalUserFindByIdAndUpdate;
    ResumeReview.find = originalResumeFind;
    ResumeReview.findOne = originalResumeFindOne;
    UserMemory.find = originalMemoryFind;
    UserMemory.create = originalMemoryCreate;
    UserMemory.findOneAndUpdate = originalMemoryFindOneAndUpdate;
    UserMemory.findOneAndDelete = originalMemoryFindOneAndDelete;
  }

  console.log(`\n=================================================`);
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log(`=================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
