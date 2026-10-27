import assert from "node:assert/strict";
import User from "../models/User.model.js";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../controllers/user.controller.js";

async function runTests() {
  console.log("=================================================");
  console.log("   SETTINGS & PREFERENCES TEST SUITE             ");
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

  // Backup original User methods
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;

  try {
    // Test 1: Unauthenticated getUserPreferences returns 401
    await test("getUserPreferences returns 401 for unauthenticated request", async () => {
      const req = { user: null };
      const res = createMockRes();
      await getUserPreferences(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData.success, false);
      assert.match(res.jsonData.message, /Authentication required/i);
    });

    // Test 2: Unauthenticated updateUserPreferences returns 401
    await test("updateUserPreferences returns 401 for unauthenticated request", async () => {
      const req = { user: null, body: { targetRole: "Staff Engineer" } };
      const res = createMockRes();
      await updateUserPreferences(req, res);
      assert.equal(res.statusCode, 401);
      assert.equal(res.jsonData.success, false);
      assert.match(res.jsonData.message, /Authentication required/i);
    });

    // Test 3: getUserPreferences returns clean defaults when careerPreferences is empty
    await test("getUserPreferences returns empty clean preferences when none stored", async () => {
      User.findOne = (query) => ({
        select: () => ({
          clerkUserId: "user_fresh_123",
          email: "fresh@example.com",
          name: "Fresh User",
          careerPreferences: {},
        }),
      });

      const req = { user: { id: "user_fresh_123" } };
      const res = createMockRes();
      await getUserPreferences(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.deepEqual(res.jsonData.careerPreferences, {});
    });

    // Test 4: updateUserPreferences validates and persists career preferences scoped to req.user.id
    await test("updateUserPreferences updates and saves preferences for the authenticated user", async () => {
      const updatedRecord = {
        clerkUserId: "user_alice_456",
        email: "alice@example.com",
        careerPreferences: {
          targetRole: "Full Stack Architect",
          targetCompany: "Vercel",
          experienceLevel: "Senior",
          yearsOfExperience: 7,
          defaultLanguage: "cpp",
          preferredVoice: "Google UK English Male",
        },
      };

      let capturedQuery = null;
      let capturedUpdate = null;

      User.findOneAndUpdate = (query, update) => {
        capturedQuery = query;
        capturedUpdate = update;
        return {
          select: () => updatedRecord,
        };
      };

      const req = {
        user: { id: "user_alice_456" },
        body: {
          targetRole: "Full Stack Architect",
          targetCompany: "Vercel",
          experienceLevel: "Senior",
          yearsOfExperience: "7",
          defaultLanguage: "CPP",
          preferredVoice: "Google UK English Male",
        },
      };
      const res = createMockRes();

      await updateUserPreferences(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.jsonData.success, true);
      assert.equal(res.jsonData.careerPreferences.targetRole, "Full Stack Architect");
      assert.equal(res.jsonData.careerPreferences.targetCompany, "Vercel");
      assert.equal(res.jsonData.careerPreferences.experienceLevel, "Senior");
      assert.equal(res.jsonData.careerPreferences.yearsOfExperience, 7);
      assert.equal(res.jsonData.careerPreferences.defaultLanguage, "cpp");
      assert.equal(res.jsonData.careerPreferences.preferredVoice, "Google UK English Male");

      // Verify query is strictly scoped to user
      assert.equal(capturedQuery.clerkUserId, "user_alice_456");
      assert.equal(capturedUpdate.$set["careerPreferences.defaultLanguage"], "cpp");
      assert.equal(capturedUpdate.$set["careerPreferences.yearsOfExperience"], 7);
    });

    // Test 5: Account isolation - User A cannot access or mutate User B's preferences
    await test("Account isolation - preferences are strictly queried and saved by req.user.id", async () => {
      const userDatabase = {
        user_a: {
          clerkUserId: "user_a",
          careerPreferences: { targetRole: "Backend Developer", defaultLanguage: "python" },
        },
        user_b: {
          clerkUserId: "user_b",
          careerPreferences: { targetRole: "Data Scientist", defaultLanguage: "cpp" },
        },
      };

      User.findOne = (query) => {
        const found = userDatabase[query.clerkUserId] || null;
        return { select: () => found };
      };

      User.findOneAndUpdate = (query, update) => {
        const found = userDatabase[query.clerkUserId];
        if (found) {
          if (update.$set["careerPreferences.targetRole"]) {
            found.careerPreferences.targetRole = update.$set["careerPreferences.targetRole"];
          }
          return { select: () => found };
        }
        return { select: () => null };
      };

      // User A queries preferences
      const reqA = { user: { id: "user_a" } };
      const resA = createMockRes();
      await getUserPreferences(reqA, resA);
      assert.equal(resA.jsonData.careerPreferences.targetRole, "Backend Developer");
      assert.equal(resA.jsonData.careerPreferences.defaultLanguage, "python");

      // User B updates preferences, user A's data remains untouched
      const reqB = {
        user: { id: "user_b" },
        body: { targetRole: "ML Engineer" },
      };
      const resB = createMockRes();
      await updateUserPreferences(reqB, resB);

      assert.equal(userDatabase.user_a.careerPreferences.targetRole, "Backend Developer");
      assert.equal(userDatabase.user_b.careerPreferences.targetRole, "ML Engineer");
    });

    // Test 6: Sanitization - negative years of experience clamped to 0
    await test("Sanitizes invalid years of experience to >= 0", async () => {
      let savedYears = null;
      User.findOneAndUpdate = (query, update) => {
        savedYears = update.$set["careerPreferences.yearsOfExperience"];
        return {
          select: () => ({
            careerPreferences: { yearsOfExperience: savedYears },
          }),
        };
      };

      const req = {
        user: { id: "user_bob" },
        body: {
          yearsOfExperience: -5,
        },
      };
      const res = createMockRes();
      await updateUserPreferences(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(savedYears, 0);
      assert.equal(res.jsonData.careerPreferences.yearsOfExperience, 0);
    });

  } finally {
    // Restore original User methods
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }

  console.log(`\nTests finished: ${passedTests}/${totalTests} passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();
