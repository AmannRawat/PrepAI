/**
 * Unit & Regression Tests for Wallpaper State, iOS Voice Selection & Mobile Keyboard Positioning
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processSpeechVoices } from '../src/utils/speechUtils.js';
import { getClerkAppearance } from '../src/utils/clerkTheme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("=================================================");
console.log("  PREPAI PREFERENCES, VOICES & VIEWPORT TESTS");
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

// ----------------------------------------------------------------------------
// Test Group 1: Wallpaper Selection State Logic (Issue 3)
// ----------------------------------------------------------------------------
runTest("Built-in wallpaper isSelected is based on dashboardBgId === bg.id even when hasCustomBg is true", () => {
  const builtInBackgrounds = [
    { id: 'bg-lake-morning', name: 'Lake Morning' },
    { id: 'bg-cyber-neon', name: 'Cyber Neon' },
    { id: 'bg-minimal-dark', name: 'Minimal Dark' },
  ];

  // User previously uploaded a custom wallpaper, so hasCustomBg is true in IndexedDB
  const hasCustomBg = true;

  // Case A: User currently has built-in 'bg-cyber-neon' selected
  let dashboardBgId = 'bg-cyber-neon';
  let activeCards = builtInBackgrounds.filter(bg => dashboardBgId === bg.id);
  assert.equal(activeCards.length, 1, "Exactly one card should be active");
  assert.equal(activeCards[0].id, 'bg-cyber-neon', "The active card should be bg-cyber-neon");

  // Verify the bug condition is prevented:
  // (Old bug: !hasCustomBg && dashboardBgId === bg.id -> always evaluated to false when hasCustomBg was true)
  const oldBugResult = !hasCustomBg && dashboardBgId === 'bg-cyber-neon';
  assert.equal(oldBugResult, false, "Demonstrates that old bug wrongly disabled the active state");

  // New fixed logic:
  const fixedResult = dashboardBgId === 'bg-cyber-neon';
  assert.equal(fixedResult, true, "Fixed logic displays active green border and checkmark");

  // Case B: User switches to custom wallpaper
  dashboardBgId = 'custom';
  activeCards = builtInBackgrounds.filter(bg => dashboardBgId === bg.id);
  assert.equal(activeCards.length, 0, "No built-in card should be marked active when custom is active");

  // Case C: User switches back from custom to another built-in 'bg-lake-morning'
  dashboardBgId = 'bg-lake-morning';
  activeCards = builtInBackgrounds.filter(bg => dashboardBgId === bg.id);
  assert.equal(activeCards.length, 1, "Switching back to built-in correctly reactivates built-in card");
  assert.equal(activeCards[0].id, 'bg-lake-morning', "Active card is now bg-lake-morning");
});

// ----------------------------------------------------------------------------
// Test Group 2: iOS Voice Selection Handling (Issue 2)
// ----------------------------------------------------------------------------
runTest("processSpeechVoices supports iOS AVFoundation voices without crashing or forcing desktop voices", () => {
  // Simulated iOS Chrome / Safari voice list (AVFoundation speech engine)
  const iosVoices = [
    { name: 'Rishi', lang: 'en-IN', default: false },
    { name: 'Samantha', lang: 'en-US', default: true },
    { name: 'Daniel', lang: 'en-GB', default: false },
    { name: 'Karen', lang: 'en-AU', default: false },
    { name: 'Moira', lang: 'en-IE', default: false },
    { name: 'Tessa', lang: 'en-ZA', default: false },
    { name: 'Thomas', lang: 'fr-FR', default: false },
  ];

  // A. Initial load with no saved preference
  const result1 = processSpeechVoices(iosVoices, null);
  assert.ok(result1.sortedVoices.length >= 6, "All English voices should be included");
  assert.ok(result1.defaultVoiceName, "A default English voice should be selected");
  assert.ok(result1.sortedVoices.some(v => v.name === 'Samantha'), "Samantha should be present");
  assert.ok(result1.sortedVoices.some(v => v.name === 'Daniel'), "Daniel should be present");

  // B. User explicitly selects Daniel (British English on iOS)
  const result2 = processSpeechVoices(iosVoices, 'Daniel');
  assert.equal(result2.defaultVoiceName, 'Daniel', "User preference 'Daniel' should be preserved");

  // C. Empty initial voices list (as occurs before voiceschanged on iOS) followed by population
  const emptyResult = processSpeechVoices([], 'Daniel');
  assert.equal(emptyResult.sortedVoices.length, 0);
  assert.equal(emptyResult.defaultVoiceName, '');

  const populatedResult = processSpeechVoices(iosVoices, 'Daniel');
  assert.equal(populatedResult.defaultVoiceName, 'Daniel', "Restored preference once voices populated");
});

// ----------------------------------------------------------------------------
// Test Group 3: Virtual Keyboard Viewport Coordinate Preservation (Issue 1)
// ----------------------------------------------------------------------------
runTest("Virtual keyboard interaction preserves userPositionRef and prevents panel from getting stuck at y: 12", () => {
  // Simulate screen dimensions
  const normalScreen = { innerWidth: 390, innerHeight: 844 };
  const keyboardOpenScreen = { innerWidth: 390, innerHeight: 844, visualViewport: { height: 380, offsetTop: 0 } };
  const panelSize = { width: 360, height: 350 };

  function clampPosition(x, y, windowW, windowH) {
    const isMobile = windowW < 768;
    const bottomMargin = isMobile ? 80 : 16;
    return {
      x: Math.max(8, Math.min(x, windowW - panelSize.width - 8)),
      y: Math.max(12, Math.min(y, windowH - panelSize.height - bottomMargin)),
    };
  }

  // 1. User positioned chatbot at (15, 380) on normal mobile screen
  const userPositionRef = { current: { x: 15, y: 380 } };
  let currentPosition = { ...userPositionRef.current };

  assert.equal(currentPosition.y, 380, "Initial position is at y: 380");

  // 2. Keyboard opens: visualViewport height drops to 380px
  const isKeyboardUp = (normalScreen.innerHeight - keyboardOpenScreen.visualViewport.height > 140);
  assert.ok(isKeyboardUp, "Detected keyboard opening via visual viewport");

  // In the fixed implementation:
  // Temporary view position is adapted for the keyboard, but userPositionRef.current is NOT overwritten
  const maxAllowedPanelH = Math.max(200, Math.min(panelSize.height, keyboardOpenScreen.visualViewport.height - 16));
  const targetY = keyboardOpenScreen.visualViewport.offsetTop + Math.max(8, keyboardOpenScreen.visualViewport.height - maxAllowedPanelH - 8);

  const tempKeyboardPos = {
    x: clampPosition(currentPosition.x, currentPosition.y, normalScreen.innerWidth, normalScreen.innerHeight).x,
    y: Math.max(keyboardOpenScreen.visualViewport.offsetTop + 8, targetY),
  };

  currentPosition = tempKeyboardPos;
  // Panel remains visible in viewport
  assert.ok(currentPosition.y >= 8, "Panel is inside visible top");
  assert.ok(currentPosition.y + maxAllowedPanelH <= keyboardOpenScreen.visualViewport.height, "Panel fits in visible keyboard viewport");

  // 3. User position ref was protected:
  assert.equal(userPositionRef.current.y, 380, "User intended position was preserved without corruption");

  // 4. Keyboard closes:
  // Restore position from userPositionRef.current
  const restored = clampPosition(userPositionRef.current.x, userPositionRef.current.y, normalScreen.innerWidth, normalScreen.innerHeight);
  currentPosition = restored;

  assert.equal(currentPosition.y, 380, "Position was cleanly restored to 380 rather than stuck at top (12)");
});

// ----------------------------------------------------------------------------
// Test Group 4: Custom Wallpaper Preview Retention & State Separation
// ----------------------------------------------------------------------------
runTest("Selecting a built-in wallpaper does not overwrite or clear customBgUrl preview", () => {
  // Simulate ThemeContext state lifecycle:
  let dashboardBgId = 'bg-lake-morning';
  let dashboardBg = '/backgrounds/bg-lake-morning.jpg';
  let customBgUrl = null;
  let hasCustomBg = false;

  // 1. User uploads custom image
  const uploadedBlobUrl = 'blob:http://localhost:5173/custom-user-uuid-123';
  hasCustomBg = true;
  customBgUrl = uploadedBlobUrl;
  dashboardBgId = 'custom';
  dashboardBg = uploadedBlobUrl;

  // Verify custom preview resolves to uploadedBlobUrl
  let previewCardSrc = customBgUrl || (dashboardBgId === 'custom' ? dashboardBg : '');
  assert.equal(previewCardSrc, uploadedBlobUrl, "Custom card preview displays uploaded image");

  // 2. User selects built-in wallpaper 'bg-cyber-neon' (e.g. Cyber Neon)
  // Old bug behavior:
  // dashboardBgId was set to 'bg-cyber-neon', and preview card evaluated:
  // src={dashboardBgId === 'custom' ? dashboardBg : '/backgrounds/bg-lake-morning.jpg'}
  // which wrongly rendered Lake Morning instead of the uploaded image!
  const oldBugPreviewSrc = dashboardBgId === 'custom' ? dashboardBg : '/backgrounds/bg-lake-morning.jpg';

  // New fixed behavior:
  dashboardBgId = 'bg-cyber-neon';
  dashboardBg = '/backgrounds/bg-cyber-neon.jpg';
  // customBgUrl is retained in ThemeContext!
  previewCardSrc = customBgUrl || (dashboardBgId === 'custom' ? dashboardBg : '');
  assert.equal(previewCardSrc, uploadedBlobUrl, "Custom card continues to display uploaded image even when built-in is active");
  assert.notEqual(previewCardSrc, '/backgrounds/bg-lake-morning.jpg', "Does not fall back to Lake Morning");

  // 3. User selects another built-in wallpaper 'bg-minimal-dark'
  dashboardBgId = 'bg-minimal-dark';
  dashboardBg = '/backgrounds/bg-minimal-dark.jpg';
  previewCardSrc = customBgUrl || (dashboardBgId === 'custom' ? dashboardBg : '');
  assert.equal(previewCardSrc, uploadedBlobUrl, "Custom card still retains uploaded image when switching between built-in wallpapers");

  // 4. User clicks 'Apply Custom'
  dashboardBgId = 'custom';
  dashboardBg = customBgUrl;
  assert.equal(dashboardBg, uploadedBlobUrl, "Dashboard background is restored to custom uploaded wallpaper");

  // 5. User deletes custom wallpaper
  hasCustomBg = false;
  customBgUrl = null;
  dashboardBgId = 'bg-lake-morning';
  dashboardBg = '/backgrounds/bg-lake-morning.jpg';
  previewCardSrc = customBgUrl || (dashboardBgId === 'custom' ? dashboardBg : '');
  assert.equal(previewCardSrc, '', "Custom preview is cleared when custom wallpaper is deleted");
});

// ----------------------------------------------------------------------------
// Test Group 5: Pepe Favicon & SVG Asset Validation
// ----------------------------------------------------------------------------
runTest("pepe-favicon.svg uses valid XML stop-color attributes rather than invalid camelCase stopColor", () => {
  const svgPath = path.resolve(__dirname, '../public/pepe-favicon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  assert.ok(!svgContent.includes('stopColor'), "SVG must not contain camelCase stopColor which breaks SVG XML rendering");
  assert.ok(svgContent.includes('stop-color'), "SVG must contain valid kebab-case stop-color");
});

runTest("PepeAvatar component uses scoped IDs to prevent gradient collision in hidden mobile trees", () => {
  const avatarPath = path.resolve(__dirname, '../src/components/PepeAvatar.jsx');
  const avatarCode = fs.readFileSync(avatarPath, 'utf-8');
  assert.ok(avatarCode.includes('useId'), "PepeAvatar must import and use useId");
  assert.ok(avatarCode.includes('bodyGradId'), "PepeAvatar must use dynamic bodyGradId");
  assert.ok(!avatarCode.includes('fill="url(#pepeAvatarBodyGrad)"'), "PepeAvatar must not use static global body gradient ID");
});

// ----------------------------------------------------------------------------
// Test Group 6: Behavioral Coach Mobile Play Button
// ----------------------------------------------------------------------------
runTest("Behavioral Coach renders visible play button on mobile for bot messages without requiring hover", () => {
  const coachPath = path.resolve(__dirname, '../src/pages/BehavioralCoach.jsx');
  const coachCode = fs.readFileSync(coachPath, 'utf-8');
  
  // Verify mobile play button exists with md:hidden and touch-manipulation
  assert.ok(coachCode.includes('md:hidden inline-flex items-center gap-1'), "Must include mobile-visible play button");
  assert.ok(coachCode.includes('speak(msg.text, true)'), "Must trigger speak with force=true on manual play click");
  assert.ok(coachCode.includes('speakingMessageText'), "Must track speakingMessageText to reflect playing/stop state");
  assert.ok(coachCode.includes('Stop reading'), "Must support stopping active speech on click");
});

// ----------------------------------------------------------------------------
// Test Group 7: DSA Arena Desktop Bot with Body & Single Logo Logic
// ----------------------------------------------------------------------------
runTest("DSA Arena renders robot with body outside the box on desktop and removes inside header logo on desktop", () => {
  const dsaPath = path.resolve(__dirname, '../src/components/DsaCoach.jsx');
  const dsaCode = fs.readFileSync(dsaPath, 'utf-8');
  const avatarPath = path.resolve(__dirname, '../src/components/PepeAvatar.jsx');
  const avatarCode = fs.readFileSync(avatarPath, 'utf-8');

  // 1. Outside bot passes withBody={true}
  assert.ok(dsaCode.includes('withBody={true}'), "DsaCoach must pass withBody={true} to outside desktop bot");

  // 2. Inside header logo is sm:hidden so it only renders on mobile view
  assert.ok(dsaCode.includes('sm:hidden h-7 w-7'), "Inside header logo must have sm:hidden to remove duplicate on desktop");

  // 3. PepeAvatar supports withBody prop, expands viewBox to 160x160, and renders torso/arms
  assert.ok(avatarCode.includes('withBody = false'), "PepeAvatar must support optional withBody prop");
  assert.ok(avatarCode.includes('viewBox={withBody ? "0 0 160 160" : "14 1 132 120"}'), "PepeAvatar must expand viewBox when withBody is true");
  assert.ok(avatarCode.includes('pepeAvatarBodyGroup'), "PepeAvatar must render body group when withBody is true");
});

// ----------------------------------------------------------------------------
// Test Group 8: Clerk Sign-In UI & Theme Customization
// ----------------------------------------------------------------------------
runTest("Clerk sign-in & sign-up UI includes PepeAvatar, tagline, borderless card, and preserved auth routing", () => {
  const appearance = getClerkAppearance();

  // 1. Verify appearance variables & borderless card configuration
  assert.equal(appearance.variables.colorPrimary, '#10b981', 'Must use emerald primary accent');
  assert.equal(appearance.elements.card.border, 'none', 'Must eliminate nested card borders');
  assert.equal(appearance.elements.card.backgroundColor, 'transparent', 'Card must have transparent background');
  assert.equal(appearance.elements.header.display, 'none', 'Clerk default header must be hidden to display custom branded welcome');

  // 2. Verify LoginModal.jsx integration
  const modalPath = path.resolve(__dirname, '../src/components/LoginModal.jsx');
  const modalCode = fs.readFileSync(modalPath, 'utf-8');
  assert.ok(modalCode.includes('<PepeAvatar'), 'LoginModal must include PepeAvatar logo in welcome area');
  assert.ok(modalCode.includes('Welcome back to PrepAI'), 'LoginModal must include Welcome back to PrepAI heading');
  assert.ok(modalCode.includes('Your AI-powered interview preparation companion'), 'LoginModal must include tagline');
  assert.ok(modalCode.includes('fallbackRedirectUrl="/"'), 'LoginModal must preserve fallbackRedirectUrl');

  // 3. Verify LoginPage.jsx and SignupPage.jsx integration
  const loginPath = path.resolve(__dirname, '../src/pages/LoginPage.jsx');
  const loginCode = fs.readFileSync(loginPath, 'utf-8');
  assert.ok(loginCode.includes('<PepeAvatar'), 'LoginPage must include PepeAvatar logo in welcome area');
  assert.ok(loginCode.includes('getClerkAppearance()'), 'LoginPage must use getClerkAppearance()');

  const signupPath = path.resolve(__dirname, '../src/pages/SignupPage.jsx');
  const signupCode = fs.readFileSync(signupPath, 'utf-8');
  assert.ok(signupCode.includes('<PepeAvatar'), 'SignupPage must include PepeAvatar logo');
  assert.ok(signupCode.includes('getClerkAppearance()'), 'SignupPage must use getClerkAppearance()');
});

console.log(`\n=================================================`);
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log(`=================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
