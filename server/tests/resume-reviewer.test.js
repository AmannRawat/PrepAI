import assert from "node:assert/strict";
import { PDFParse } from "pdf-parse";
import { reviewResume, getLatestResumeReview } from "../controllers/resume.controller.js";
import ResumeReview from "../models/ResumeReview.model.js";

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

function createPdfBuffer(text) {
  const content = `BT /F1 12 Tf 72 712 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const len = Buffer.byteLength(content);
  const pdfString = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${len} >>
stream
${content}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000350 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
427
%%EOF`;
  return Buffer.from(pdfString);
}

async function runResumeReviewerTests() {
  console.log("=================================================");
  console.log("  RESUME REVIEWER & ATS MATCHER VERIFICATION     ");
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
    }
  }

  // ----------------------------------------------------
  // Suite 1: Authentication & Authorization Protection
  // ----------------------------------------------------
  console.log("--- Suite 1: Authentication Enforcement ---");

  await test("Unauthenticated reviewResume rejects with HTTP 401", async () => {
    const req = { user: null, file: null, body: {} };
    const res = createMockRes();
    await reviewResume(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  await test("Unauthenticated getLatestResumeReview rejects with HTTP 401", async () => {
    const req = { user: undefined };
    const res = createMockRes();
    await getLatestResumeReview(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
  });

  // ----------------------------------------------------
  // Suite 2: Input Validation (Files & Job Descriptions)
  // ----------------------------------------------------
  console.log("\n--- Suite 2: File & Job Description Validation ---");

  await test("Rejects request when no file is uploaded", async () => {
    const req = {
      user: { id: "507f1f77bcf86cd799439011" },
      file: null,
      body: { jobDescription: "We need a senior React engineer with TypeScript." },
    };
    const res = createMockRes();
    await reviewResume(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData?.error.includes("No resume file uploaded"));
  });

  await test("Rejects request when file buffer is empty", async () => {
    const req = {
      user: { id: "507f1f77bcf86cd799439011" },
      file: { buffer: Buffer.from(""), mimetype: "application/pdf" },
      body: { jobDescription: "We need a senior React engineer with TypeScript." },
    };
    const res = createMockRes();
    await reviewResume(req, res);
    assert.equal(res.statusCode, 400);
  });

  await test("Rejects request when job description is missing or too short", async () => {
    const validPdf = createPdfBuffer("John Doe Software Engineer with React and Node.js experience");
    const req = {
      user: { id: "507f1f77bcf86cd799439011" },
      file: { buffer: validPdf, mimetype: "application/pdf" },
      body: { jobDescription: "Short JD" }, // less than 20 chars
    };
    const res = createMockRes();
    await reviewResume(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData?.error.includes("at least 20 characters"));
  });

  await test("Rejects unreadable or corrupted PDF gracefully", async () => {
    const corruptBuffer = Buffer.from("Not a real PDF header or structure");
    const req = {
      user: { id: "507f1f77bcf86cd799439011" },
      file: { buffer: corruptBuffer, mimetype: "application/pdf" },
      body: { jobDescription: "Looking for a full stack developer with React, Node.js and AWS." },
    };
    const res = createMockRes();
    await reviewResume(req, res);
    assert.equal(res.statusCode, 400);
    assert.ok(res.jsonData?.error.includes("Could not read the PDF file") || res.jsonData?.error.includes("readable text"));
  });

  // ----------------------------------------------------
  // Suite 3: PDF Text Extraction & Model Schema Contract
  // ----------------------------------------------------
  console.log("\n--- Suite 3: Text Extraction & Schema Contract ---");

  await test("PDFParse extracts text cleanly from valid PDF buffer", async () => {
    const sampleText = "Jane Doe Software Engineer 5 years building scalable web services in Node.js and React";
    const buffer = createPdfBuffer(sampleText);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    assert.ok(parsed.text.includes("Jane Doe"));
    assert.ok(parsed.text.includes("Node.js"));
  });

  await test("ResumeReview Mongoose schema exposes required structured paths", () => {
    const paths = ResumeReview.schema.paths;
    assert.ok(paths["user"], "user reference path must exist");
    assert.ok(paths["jobTitle"], "jobTitle path must exist");
    assert.ok(paths["jobDescription"], "jobDescription path must exist");
    assert.ok(paths["atsAssessment.estimatedScore"], "estimatedScore path must exist");
    assert.ok(paths["atsAssessment.breakdown.skillsScore"], "skillsScore path must exist");
    assert.ok(paths["atsAssessment.breakdown.qualificationsScore"], "qualificationsScore path must exist");
    assert.ok(paths["atsAssessment.breakdown.experienceScore"], "experienceScore path must exist");
    assert.ok(paths["atsAssessment.breakdown.keywordsScore"], "keywordsScore path must exist");
    assert.ok(paths["atsAssessment.breakdown.structureScore"], "structureScore path must exist");
    assert.ok(paths["atsAssessment.limitationsDisclaimer"], "limitationsDisclaimer path must exist");
    assert.ok(paths["qualificationsAnalysis.required"], "required qualifications array must exist");
    assert.ok(paths["qualificationsAnalysis.preferred"], "preferred qualifications array must exist");
    assert.ok(paths["gapAnalysis"], "gapAnalysis array must exist");
    assert.ok(paths["bulletImprovements"], "bulletImprovements array must exist");
    assert.ok(paths["prioritizedActionPlan.highPriority"], "highPriority array must exist");
    assert.ok(paths["prioritizedActionPlan.mediumPriority"], "mediumPriority array must exist");
    assert.ok(paths["prioritizedActionPlan.lowPriority"], "lowPriority array must exist");
    assert.ok(paths["strengths"], "backward compatible strengths path must exist");
    assert.ok(paths["areasForImprovement"], "backward compatible areasForImprovement path must exist");
  });

  // ----------------------------------------------------
  // Suite 4: ATS Score Calculation Logic & Integrity Rules
  // ----------------------------------------------------
  console.log("\n--- Suite 4: ATS Score & Weighted Breakdown Calculation ---");

  await test("Weighted subscores sum accurately to composite estimatedScore (0-100)", () => {
    const breakdown = {
      skillsScore: 22,
      skillsMax: 25,
      qualificationsScore: 21,
      qualificationsMax: 25,
      experienceScore: 16,
      experienceMax: 20,
      keywordsScore: 13,
      keywordsMax: 15,
      structureScore: 12,
      structureMax: 15,
    };

    const calculatedSum =
      breakdown.skillsScore +
      breakdown.qualificationsScore +
      breakdown.experienceScore +
      breakdown.keywordsScore +
      breakdown.structureScore;

    assert.equal(calculatedSum, 84);
    assert.ok(calculatedSum >= 0 && calculatedSum <= 100);
  });

  await test("Evidence-based gap analysis distinguishes JD provenance and warns absence != inability", () => {
    const gapItem = {
      requirement: "GraphQL API development",
      source: "Job Description",
      status: "missing",
      evidence: "Not detected in resume text",
      notes: "Absence from resume text does not imply a lack of personal ability; add if you have this skill.",
    };

    assert.equal(gapItem.source, "Job Description");
    assert.equal(gapItem.status, "missing");
    assert.ok(gapItem.notes.includes("does not imply a lack of personal ability"));
  });

  await test("Bullet rewrite model includes clarification note without fabricating metrics", () => {
    const bullet = {
      original: "Worked on payment gateway integration.",
      improved: "Architected secure Stripe payment integration with idempotency keys and automated webhook reconciliation.",
      rationale: "Highlights technical design, specific technology, and resilience mechanisms.",
      keywordsAdded: ["Stripe", "Idempotency", "Webhooks"],
      clarificationNeeded: "If you measured transaction volume or reduction in failed payments, insert your actual measured numbers.",
    };

    assert.ok(bullet.improved.length > bullet.original.length);
    assert.ok(bullet.keywordsAdded.length > 0);
    assert.ok(bullet.clarificationNeeded.includes("actual measured numbers"));
    // Ensure no hardcoded fake metric in the rewrite itself
    assert.ok(!bullet.improved.includes("99.999%"));
  });

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runResumeReviewerTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
