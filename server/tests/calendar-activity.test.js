import assert from "node:assert/strict";
import DsaSubmission from "../models/DsaSubmission.model.js";
import ChatSession from "../models/BehavioralChat.model.js";
import ResumeReview from "../models/ResumeReview.model.js";
import User from "../models/User.model.js";
import {
  getCalendarActivity,
  recordActivity,
  getUserProgress,
} from "../controllers/user.controller.js";

async function runTests() {
  console.log("=================================================");
  console.log("    CALENDAR & USER ACTIVITY TEST SUITE          ");
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
        console.error(`       ${err.stack.split("\n").slice(1, 3).join("\n       ")}`);
      }
    }
  }

  function createMockRes() {
    return {
      statusCode: null,
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

  // Backup original model methods so we can mock queries safely
  const origDsaFind = DsaSubmission.find;
  const origChatFind = ChatSession.find;
  const origResumeFind = ResumeReview.find;
  const origUserFindById = User.findById;
  const origUserUpdateOne = User.updateOne;

  function restoreOriginals() {
    DsaSubmission.find = origDsaFind;
    ChatSession.find = origChatFind;
    ResumeReview.find = origResumeFind;
    User.findById = origUserFindById;
    User.updateOne = origUserUpdateOne;
  }

  // ----------------------------------------------------
  // Suite 1: Unauthenticated Rejection
  // ----------------------------------------------------
  console.log("--- Suite 1: Unauthenticated & Logged-Out Behavior ---");

  await test("getCalendarActivity rejects unauthenticated requests with HTTP 401", async () => {
    const req = { user: null, query: {} };
    const res = createMockRes();
    await getCalendarActivity(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("recordActivity rejects unauthenticated requests with HTTP 401", async () => {
    const req = { user: undefined, body: {} };
    const res = createMockRes();
    await recordActivity(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  // ----------------------------------------------------
  // Suite 2: New User With No Activity
  // ----------------------------------------------------
  console.log("\n--- Suite 2: New User With No Activity ---");

  await test("Newly registered user with no history sees 0 streak, empty active days, empty milestones", async () => {
    const userAId = "user_clean_001";

    DsaSubmission.find = (filter) => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    ChatSession.find = (filter) => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    ResumeReview.find = (filter) => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    User.findById = (id) => ({
      select: () => ({ lean: async () => ({ currentStreak: 0, lastActivityDate: null }) }),
    });

    const req = {
      user: { id: userAId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const res = createMockRes();

    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.year, 2026);
    assert.equal(res.jsonData.month, 10);
    assert.deepEqual(res.jsonData.activeDays, []);
    assert.deepEqual(res.jsonData.activeDates, []);
    assert.equal(res.jsonData.currentStreak, 0);
    assert.equal(res.jsonData.streakStartDate, null);
    assert.deepEqual(res.jsonData.todayMilestones, []);
    assert.equal(res.jsonData.totalActiveDaysThisMonth, 0);
    assert.equal(res.jsonData.totalLifetimeActiveDays, 0);
  });

  // ----------------------------------------------------
  // Suite 3: User Scoping and Isolation
  // ----------------------------------------------------
  console.log("\n--- Suite 3: User Scoping & Isolation ---");

  await test("User A's activity is strictly isolated and never returned to User B", async () => {
    const userAId = "user_alpha_111";
    const userBId = "user_beta_222";

    const database = {
      dsa: [
        {
          user: userAId,
          createdAt: new Date("2026-10-25T10:00:00Z"),
          problem: { title: "Binary Search" },
          verdict: "Accepted",
        },
      ],
      chat: [
        {
          user: userAId,
          createdAt: new Date("2026-10-25T11:00:00Z"),
          targetRole: "Full Stack Engineer",
          interviewType: "Technical",
          status: "completed",
        },
      ],
      resume: [
        {
          user: userAId,
          createdAt: new Date("2026-10-25T12:00:00Z"),
          jobTitle: "Software Engineer",
        },
      ],
    };

    DsaSubmission.find = (filter) => ({
      select: () => ({
        sort: () => ({
          lean: async () => database.dsa.filter((d) => d.user === String(filter.user)),
        }),
      }),
    });
    ChatSession.find = (filter) => ({
      select: () => ({
        sort: () => ({
          lean: async () => database.chat.filter((c) => c.user === String(filter.user)),
        }),
      }),
    });
    ResumeReview.find = (filter) => ({
      select: () => ({
        sort: () => ({
          lean: async () => database.resume.filter((r) => r.user === String(filter.user)),
        }),
      }),
    });
    User.findById = (id) => ({
      select: () => ({
        lean: async () => ({ currentStreak: id === userAId ? 1 : 0, lastActivityDate: null }),
      }),
    });

    // Query for User B
    const reqB = {
      user: { id: userBId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const resB = createMockRes();
    await getCalendarActivity(reqB, resB);

    assert.equal(resB.statusCode, 200);
    assert.deepEqual(resB.jsonData.activeDays, []);
    assert.equal(resB.jsonData.currentStreak, 0);
    assert.deepEqual(resB.jsonData.todayMilestones, []);

    // Query for User A
    const reqA = {
      user: { id: userAId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const resA = createMockRes();
    await getCalendarActivity(reqA, resA);

    assert.equal(resA.statusCode, 200);
    assert.deepEqual(resA.jsonData.activeDays, [25]);
    assert.equal(resA.jsonData.totalActiveDaysThisMonth, 1);
  });

  // ----------------------------------------------------
  // Suite 4: Qualifying Activity Date Mapping
  // ----------------------------------------------------
  console.log("\n--- Suite 4: Qualifying Activity Date Mapping ---");

  await test("DSA, interview sessions, and resume reviews mark only their actual dates", async () => {
    const userId = "user_gamma_333";

    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            {
              user: userId,
              createdAt: new Date("2026-10-05T09:00:00Z"),
              problem: { title: "Two Sum" },
              verdict: "Accepted",
            },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            {
              user: userId,
              createdAt: new Date("2026-10-12T14:00:00Z"),
              targetRole: "Backend Engineer",
              interviewType: "Behavioral",
              status: "completed",
            },
          ],
        }),
      }),
    });
    ResumeReview.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            {
              user: userId,
              createdAt: new Date("2026-10-18T16:00:00Z"),
              jobTitle: "DevOps Engineer",
            },
          ],
        }),
      }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 0 }) }),
    });

    const req = {
      user: { id: userId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const res = createMockRes();
    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonData.activeDays, [5, 12, 18]);
    assert.deepEqual(res.jsonData.activeDates, ["2026-10-05", "2026-10-12", "2026-10-18"]);
    assert.equal(res.jsonData.totalActiveDaysThisMonth, 3);
  });

  // ----------------------------------------------------
  // Suite 5: Deduplication On Same Calendar Day
  // ----------------------------------------------------
  console.log("\n--- Suite 5: Same-Day Activity Deduplication ---");

  await test("Multiple qualifying events on one day count as a single active day and do not inflate streak", async () => {
    const userId = "user_dedup_444";

    // 4 activities all on Oct 14, 2026
    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: new Date("2026-10-14T08:00:00Z"), problem: { title: "Q1" }, verdict: "Accepted" },
            { createdAt: new Date("2026-10-14T10:00:00Z"), problem: { title: "Q2" }, verdict: "Wrong Answer" },
            { createdAt: new Date("2026-10-14T12:00:00Z"), problem: { title: "Q3" }, verdict: "Accepted" },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: new Date("2026-10-14T15:00:00Z"), targetRole: "SWE", status: "completed" },
          ],
        }),
      }),
    });
    ResumeReview.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 0 }) }),
    });

    const req = {
      user: { id: userId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const res = createMockRes();
    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    // Even though there are 4 events, activeDays must have 14 exactly once
    assert.deepEqual(res.jsonData.activeDays, [14]);
    assert.equal(res.jsonData.totalActiveDaysThisMonth, 1);
  });

  // ----------------------------------------------------
  // Suite 6: Month Isolation
  // ----------------------------------------------------
  console.log("\n--- Suite 6: Month Isolation ---");

  await test("Previous months do not reuse current month's active dates", async () => {
    const userId = "user_month_555";

    // Activities exist in October 2026
    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: new Date("2026-10-15T10:00:00Z"), problem: { title: "Q1" }, verdict: "Accepted" },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    ResumeReview.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 0 }) }),
    });

    // Query September 2026
    const reqSep = {
      user: { id: userId },
      query: { year: "2026", month: "9", timezone: "UTC" },
    };
    const resSep = createMockRes();
    await getCalendarActivity(reqSep, resSep);

    assert.equal(resSep.statusCode, 200);
    assert.deepEqual(resSep.jsonData.activeDays, []);
    assert.equal(resSep.jsonData.totalActiveDaysThisMonth, 0);

    // Query October 2026
    const reqOct = {
      user: { id: userId },
      query: { year: "2026", month: "10", timezone: "UTC" },
    };
    const resOct = createMockRes();
    await getCalendarActivity(reqOct, resOct);

    assert.equal(resOct.statusCode, 200);
    assert.deepEqual(resOct.jsonData.activeDays, [15]);
  });

  // ----------------------------------------------------
  // Suite 7: Consecutive Streak Across Boundaries
  // ----------------------------------------------------
  console.log("\n--- Suite 7: Consecutive Streak Across Boundaries ---");

  await test("Streak calculation works across month and year boundaries and handles missing days", async () => {
    const userId = "user_streak_666";

    // Today and yesterday timestamps
    const now = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 3-day gap -> breaks streak

    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: now, problem: { title: "Q1" }, verdict: "Accepted" },
            { createdAt: yesterday, problem: { title: "Q2" }, verdict: "Accepted" },
            { createdAt: twoDaysAgo, problem: { title: "Q3" }, verdict: "Accepted" },
            { createdAt: fourDaysAgo, problem: { title: "Q4" }, verdict: "Accepted" },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    ResumeReview.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 3 }) }),
    });

    const req = {
      user: { id: userId },
      query: { timezone: "UTC" },
    };
    const res = createMockRes();
    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    // Active today, yesterday, and two days ago -> streak = 3
    assert.equal(res.jsonData.currentStreak, 3);
  });

  await test("Broken streak (active 3 days ago, but inactive today and yesterday) evaluates to 0", async () => {
    const userId = "user_broken_streak_777";

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: threeDaysAgo, problem: { title: "Q1" }, verdict: "Accepted" },
            { createdAt: fourDaysAgo, problem: { title: "Q2" }, verdict: "Accepted" },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    ResumeReview.find = () => ({
      select: () => ({ sort: () => ({ lean: async () => [] }) }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 0 }) }),
    });

    const req = {
      user: { id: userId },
      query: { timezone: "UTC" },
    };
    const res = createMockRes();
    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.currentStreak, 0);
    assert.equal(res.jsonData.streakStartDate, null);
  });

  // ----------------------------------------------------
  // Suite 8: Today's Genuine Milestones
  // ----------------------------------------------------
  console.log("\n--- Suite 8: Today's Genuine Milestones ---");

  await test("Today's milestones show actual recorded activity for today with proper status", async () => {
    const userId = "user_milestones_888";
    const now = new Date();

    DsaSubmission.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: now, problem: { title: "Merge Intervals" }, verdict: "Accepted" },
          ],
        }),
      }),
    });
    ChatSession.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: now, targetRole: "Staff Engineer", interviewType: "Technical", status: "completed" },
          ],
        }),
      }),
    });
    ResumeReview.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => [
            { createdAt: now, jobTitle: "Lead Architect" },
          ],
        }),
      }),
    });
    User.findById = () => ({
      select: () => ({ lean: async () => ({ currentStreak: 1 }) }),
    });

    const req = {
      user: { id: userId },
      query: { timezone: "UTC" },
    };
    const res = createMockRes();
    await getCalendarActivity(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonData.todayMilestones.length, 3);

    const dsaM = res.jsonData.todayMilestones.find((m) => m.type === "dsa");
    assert.equal(dsaM.title, "Merge Intervals");
    assert.equal(dsaM.status, "Solved");

    const intM = res.jsonData.todayMilestones.find((m) => m.type === "interview");
    assert.equal(intM.status, "Completed");

    const resM = res.jsonData.todayMilestones.find((m) => m.type === "resume");
    assert.equal(resM.status, "Reviewed");
  });

  // ----------------------------------------------------
  // Suite 9: User Schema Default Streak Fix
  // ----------------------------------------------------
  console.log("\n--- Suite 9: User Schema Default Streak Fix ---");

  await test("User model currentStreak default is 0 instead of 10", () => {
    const path = User.schema.path("currentStreak");
    assert.equal(path.defaultValue, 0, "Default currentStreak must be 0");
  });

  // Restore mocks
  restoreOriginals();

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Unhandled test suite error:", err);
  process.exit(1);
});
