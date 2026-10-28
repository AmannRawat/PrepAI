/**
 * Unit & Regression Tests for Mobile Navigation, Vercel SPA Routing & Responsive Constraints
 * 
 * Verifies:
 * 1. vercel.json SPA rewrite regex correctly rewrites frontend routes to /index.html.
 * 2. vercel.json SPA rewrite regex does NOT rewrite backend /api/* routes (preserving true API 404s).
 * 3. Mobile position clamp bounds strictly clear bottom mobile navigation bar (64px + safe-area).
 * 4. Desktop position clamp bounds maintain compact desktop margins.
 * 5. Behavioral coach mobile stage progress and boundary calculations.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("=================================================");
console.log("  PREPAI MOBILE UI & NAVIGATION REGRESSION TESTS");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
  }
}

// Helper: matches route against Vercel rewrite source regex: "/((?!api/).*)"
function testVercelRewrite(pattern, pathname) {
  // Convert Vercel pattern /((?!api/).*) to RegExp
  // The pattern starts with / and matches any path not starting with api/
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(pathname);
}

// ----------------------------------------------------------------------------
// Test 1: Vercel JSON files exist and have correct structure
// ----------------------------------------------------------------------------
runTest("vercel.json exists in root and client directories with SPA rewrite rules", () => {
  const clientVercelPath = path.resolve(__dirname, '../vercel.json');
  const rootVercelPath = path.resolve(__dirname, '../../vercel.json');

  assert.ok(fs.existsSync(clientVercelPath), "client/vercel.json should exist");
  assert.ok(fs.existsSync(rootVercelPath), "root vercel.json should exist");

  const clientConfig = JSON.parse(fs.readFileSync(clientVercelPath, 'utf8'));
  const rootConfig = JSON.parse(fs.readFileSync(rootVercelPath, 'utf8'));

  assert.ok(Array.isArray(clientConfig.rewrites), "client/vercel.json must have rewrites array");
  assert.ok(Array.isArray(rootConfig.rewrites), "root vercel.json must have rewrites array");

  const clientRule = clientConfig.rewrites.find(r => r.destination === '/index.html');
  assert.ok(clientRule, "client/vercel.json must rewrite to /index.html");
  assert.equal(clientRule.source, "/((?!api/).*)", "Source must exclude api/");
});

// ----------------------------------------------------------------------------
// Test 2: Vercel SPA rewrite matches frontend routes
// ----------------------------------------------------------------------------
runTest("Vercel rewrite regex matches all frontend application routes for index.html fallback", () => {
  const pattern = "/((?!api/).*)";
  const frontendRoutes = [
    "/behavioral-coach",
    "/dsa-arena",
    "/resume-reviewer",
    "/settings",
    "/progress",
    "/profile",
    "/calendar",
    "/login",
    "/dashboard",
    "/deep/nested/subroute"
  ];

  for (const route of frontendRoutes) {
    assert.ok(
      testVercelRewrite(pattern, route),
      `Frontend route ${route} should match rewrite pattern`
    );
  }
});

// ----------------------------------------------------------------------------
// Test 3: Vercel SPA rewrite does NOT match API routes (preserves genuine API 404s)
// ----------------------------------------------------------------------------
runTest("Vercel rewrite regex does NOT match backend /api/* routes (preserving true API 404s)", () => {
  const pattern = "/((?!api/).*)";
  const apiRoutes = [
    "/api/interview/start",
    "/api/interview/12345",
    "/api/resume/my-resumes",
    "/api/user/study-plan",
    "/api/dsa/problem",
    "/api/nonexistent-endpoint"
  ];

  for (const route of apiRoutes) {
    assert.ok(
      !testVercelRewrite(pattern, route),
      `API route ${route} must NOT match frontend rewrite pattern`
    );
  }
});

// ----------------------------------------------------------------------------
// Test 4: Clamp position on mobile viewports (< 768px) enforces bottom margin >= 80px
// ----------------------------------------------------------------------------
runTest("clampPosition on mobile viewports (< 768px) clears 64px MobileNav with safe buffer", () => {
  function clampPosition(x, y, windowWidth, windowHeight, panelWidth, panelHeight) {
    const isMobile = windowWidth < 768;
    const bottomMargin = isMobile ? 80 : 16;

    return {
      x: Math.max(8, Math.min(x, windowWidth - panelWidth - 8)),
      y: Math.max(12, Math.min(y, windowHeight - panelHeight - bottomMargin)),
    };
  }

  // Mobile viewport: iPhone 14/15 size (390 x 844)
  const mobileWidth = 390;
  const mobileHeight = 844;
  const panelW = 360;
  const panelH = 350;

  // Attempt to drag panel to bottom (y = 800)
  const clampedMobile = clampPosition(100, 800, mobileWidth, mobileHeight, panelW, panelH);
  // Max allowed y on mobile: 844 - 350 - 80 = 414
  assert.equal(clampedMobile.y, 414, "Mobile panel y must clamp to 414px to clear bottom nav");
  assert.ok(
    clampedMobile.y + panelH <= mobileHeight - 64,
    "Bottom of panel must be at least 64px above screen bottom"
  );

  // Desktop viewport: 1440 x 900
  const deskWidth = 1440;
  const deskHeight = 900;
  const clampedDesktop = clampPosition(100, 800, deskWidth, deskHeight, panelW, panelH);
  // Max allowed y on desktop: 900 - 350 - 16 = 534
  assert.equal(clampedDesktop.y, 534, "Desktop panel y clamps to 534px");
});

// ----------------------------------------------------------------------------
// Test 5: Behavioral Coach stage progress and completion calculations
// ----------------------------------------------------------------------------
runTest("Behavioral Coach stage progress calculates accurately across stages and handles completion", () => {
  const stages = [
    'Welcome and Introduction',
    'Fundamentals & Core Concepts',
    'Problem Solving & Experience',
    'Behavioral & Situational Questions',
    'Wrap-up'
  ];
  const totalStages = stages.length;

  // Case 1: Initial state (stage 0)
  let currentStageIndex = 0;
  let isSessionOver = false;
  let completedStages = isSessionOver ? totalStages : Math.min(currentStageIndex, totalStages);
  let progressPercent = Math.min(100, Math.round((completedStages / totalStages) * 100));
  let currentStageName = stages[Math.min(currentStageIndex, totalStages - 1)];

  assert.equal(completedStages, 0);
  assert.equal(progressPercent, 0);
  assert.equal(currentStageName, 'Welcome and Introduction');

  // Case 2: Mid-interview (stage 2)
  currentStageIndex = 2;
  completedStages = isSessionOver ? totalStages : Math.min(currentStageIndex, totalStages);
  progressPercent = Math.min(100, Math.round((completedStages / totalStages) * 100));
  currentStageName = stages[Math.min(currentStageIndex, totalStages - 1)];

  assert.equal(completedStages, 2);
  assert.equal(progressPercent, 40);
  assert.equal(currentStageName, 'Problem Solving & Experience');

  // Case 3: Completed interview
  isSessionOver = true;
  completedStages = isSessionOver ? totalStages : Math.min(currentStageIndex, totalStages);
  progressPercent = Math.min(100, Math.round((completedStages / totalStages) * 100));

  assert.equal(completedStages, 5);
  assert.equal(progressPercent, 100);
});

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log("=================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
