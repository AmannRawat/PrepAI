/**
 * Adaptive Difficulty Service for Pepe DSA Coach.
 * 
 * Provides a transparent, configurable policy to adapt problem difficulty (Easy, Medium, Hard)
 * based on demonstrated user performance signals:
 * - Consecutive solves and failures
 * - Test-case pass rates (passed / total)
 * - Hint usage and dependence
 * - Topic-specific performance vs overall performance
 * - Explicit user difficulty requests and preferences to maintain level
 * - Adjacent-level transitions only (Easy <-> Medium <-> Hard)
 */

export const ADAPTIVE_DIFFICULTY_CONFIG = {
  // Supported difficulty levels in strict progression order
  levels: ["Easy", "Medium", "Hard"],
  defaultDifficulty: "Medium",

  // Recent submission window to evaluate
  recentWindowSize: 5,
  minSubmissionsForAdaptation: 2,

  // Criteria for stepping up a difficulty level
  promotion: {
    minConsecutiveSolves: 2,
    minPassRatio: 1.0,
    maxAverageHints: 1.0,
    minAcceptanceRate: 70,
  },

  // Criteria for stepping down a difficulty level
  demotion: {
    minConsecutiveFailures: 2,
    maxPassRatio: 0.5,
    heavyHintThreshold: 2.5,
    lowAcceptanceRate: 40,
  },
};

/**
 * Normalizes difficulty to one of ["Easy", "Medium", "Hard"].
 */
export function normalizeDifficulty(diff) {
  if (!diff || typeof diff !== "string") return ADAPTIVE_DIFFICULTY_CONFIG.defaultDifficulty;
  const lower = diff.trim().toLowerCase();
  if (lower === "easy") return "Easy";
  if (lower === "hard") return "Hard";
  return "Medium";
}

/**
 * Returns the adjacent difficulty level in the given direction ("up" or "down").
 * Enforces adjacent-level transitions: Easy <-> Medium <-> Hard.
 */
export function getAdjacentDifficulty(currentLevel, direction) {
  const normalized = normalizeDifficulty(currentLevel);
  const levels = ADAPTIVE_DIFFICULTY_CONFIG.levels;
  const currentIndex = levels.indexOf(normalized);

  if (direction === "up") {
    const nextIndex = Math.min(levels.length - 1, currentIndex + 1);
    return levels[nextIndex];
  }

  if (direction === "down") {
    const prevIndex = Math.max(0, currentIndex - 1);
    return levels[prevIndex];
  }

  return normalized;
}

/**
 * Detects whether the user explicitly stated a difficulty level in their message.
 */
export function extractExplicitDifficulty(message) {
  if (!message || typeof message !== "string") return null;
  const match = message.match(/\b(easy|medium|hard)\b/i);
  return match ? normalizeDifficulty(match[1]) : null;
}

/**
 * Detects whether the user explicitly requested to stay at or maintain the current level.
 */
export function extractKeepSamePreference(message) {
  if (!message || typeof message !== "string") return false;
  return /\b(keep|stay|stick|same\s+level|same\s+difficulty|don't\s+change|dont\s+change|maintain)\b/i.test(message);
}

/**
 * Extracts the difficulty of a single submission record, checking submission.difficulty,
 * submission.problem.difficulty, or defaulting to "Medium".
 */
export function getSubmissionDifficulty(sub) {
  if (!sub) return ADAPTIVE_DIFFICULTY_CONFIG.defaultDifficulty;
  if (sub.difficulty) return normalizeDifficulty(sub.difficulty);
  if (sub.problem && sub.problem.difficulty) return normalizeDifficulty(sub.problem.difficulty);
  return ADAPTIVE_DIFFICULTY_CONFIG.defaultDifficulty;
}

/**
 * Normalizes topic names to canonical lower-cased categories to ensure singular/plural
 * and alias variations match reliably.
 */
export function normalizeTopicName(topic) {
  if (!topic || typeof topic !== "string") return "";
  const lower = topic.trim().toLowerCase();
  if (lower === "array" || lower === "arrays") return "arrays";
  if (lower === "string" || lower === "strings") return "strings";
  if (lower === "tree" || lower === "trees") return "trees";
  if (lower === "graph" || lower === "graphs") return "graphs";
  if (lower === "dp" || lower === "dynamic programming") return "dynamic programming";
  if (lower === "binary search") return "binary search";
  if (lower === "hash table" || lower === "hash map" || lower === "hashmap" || lower === "hashing") return "hash table";
  if (lower === "two pointers" || lower === "two pointer") return "two pointers";
  if (lower === "stack" || lower === "stacks") return "stacks";
  if (lower === "queue" || lower === "queues") return "queues";
  if (lower === "heap" || lower === "heaps" || lower === "priority queue") return "heaps";
  if (lower === "linked list" || lower === "linked lists" || lower === "linkedlist") return "linked list";
  return lower;
}

/**
 * Evaluates performance metrics from a slice of recent submissions.
 */
export function summarizeRecentSubmissions(submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return {
      count: 0,
      consecutiveSolves: 0,
      consecutiveFailures: 0,
      totalPassed: 0,
      totalTests: 0,
      averagePassRatio: 0,
      averageHints: 0,
      acceptanceRate: 0,
      latestDifficulty: ADAPTIVE_DIFFICULTY_CONFIG.defaultDifficulty,
    };
  }

  // Submissions are assumed to be sorted most recent first. If timestamps or ObjectId exist, ensure sorted descending.
  const sorted = [...submissions].sort((a, b) => {
    const timeA = new Date(a.createdAt || (a._id?.getTimestamp ? a._id.getTimestamp() : 0)).getTime();
    const timeB = new Date(b.createdAt || (b._id?.getTimestamp ? b._id.getTimestamp() : 0)).getTime();
    return timeB - timeA;
  });

  const window = sorted.slice(0, ADAPTIVE_DIFFICULTY_CONFIG.recentWindowSize);
  const count = window.length;

  let consecutiveSolves = 0;
  let consecutiveFailures = 0;
  let checkingSolves = true;
  let checkingFailures = true;

  let totalPassed = 0;
  let totalTests = 0;
  let totalHints = 0;
  let acceptedCount = 0;

  for (let i = 0; i < window.length; i++) {
    const sub = window[i];
    const isAccepted = sub.verdict === "Accepted";

    if (isAccepted) {
      if (checkingSolves) consecutiveSolves++;
      checkingFailures = false;
      acceptedCount++;
    } else {
      if (checkingFailures) consecutiveFailures++;
      checkingSolves = false;
    }

    const passed = typeof sub.passed === "number" ? sub.passed : (isAccepted ? 1 : 0);
    const total = typeof sub.total === "number" && sub.total > 0 ? sub.total : 1;
    totalPassed += passed;
    totalTests += total;

    const hints = typeof sub.hintsUsed === "number" ? sub.hintsUsed : 0;
    totalHints += hints;
  }

  const latestDifficulty = getSubmissionDifficulty(window[0]);
  const averagePassRatio = totalTests > 0 ? Number((totalPassed / totalTests).toFixed(2)) : 0;
  const averageHints = count > 0 ? Number((totalHints / count).toFixed(1)) : 0;
  const acceptanceRate = count > 0 ? Math.round((acceptedCount / count) * 100) : 0;

  return {
    count,
    consecutiveSolves,
    consecutiveFailures,
    totalPassed,
    totalTests,
    averagePassRatio,
    averageHints,
    acceptanceRate,
    latestDifficulty,
  };
}

/**
 * Main adaptive difficulty evaluation engine.
 * 
 * @param {Object} params
 * @param {Array} params.submissions - Full list of user's DsaSubmission records.
 * @param {string} [params.topic] - Target topic, if filtered.
 * @param {string} [params.requestedDifficulty] - Explicit difficulty requested by user.
 * @param {string} [params.message] - User message to detect explicit level or 'keep same' preference.
 * @param {Object} [params.userProfile] - Onboarding profile (e.g. skillLevel, weakTopics).
 * @param {Object} [params.activePlan] - Current study plan.
 * @returns {Object} Adaptive difficulty recommendation and explanation.
 */
export function evaluateAdaptiveDifficulty({
  submissions = [],
  topic = null,
  requestedDifficulty = null,
  message = "",
  userProfile = null,
  activePlan = null,
} = {}) {
  // 1. Explicit user difficulty requested
  const explicitDiff = requestedDifficulty || extractExplicitDifficulty(message);
  if (explicitDiff) {
    return {
      currentDifficulty: explicitDiff,
      targetDifficulty: explicitDiff,
      action: "maintain",
      isExplicit: true,
      reason: `You requested ${explicitDiff} difficulty.`,
      recentSummary: summarizeRecentSubmissions(submissions),
    };
  }

  // 2. Explicit user preference to keep the current difficulty
  const keepSame = extractKeepSamePreference(message);

  // 3. Filter submissions by topic if topic has at least minSubmissionsForAdaptation
  let relevantSubmissions = Array.isArray(submissions) ? submissions : [];
  if (topic && typeof topic === "string") {
    const targetNorm = normalizeTopicName(topic);
    const topicFiltered = relevantSubmissions.filter(
      (s) => s.topic && normalizeTopicName(s.topic) === targetNorm
    );
    if (topicFiltered.length >= ADAPTIVE_DIFFICULTY_CONFIG.minSubmissionsForAdaptation) {
      relevantSubmissions = topicFiltered;
    }
  }

  const summary = summarizeRecentSubmissions(relevantSubmissions);

  // Derive baseline difficulty
  let baselineDifficulty = summary.latestDifficulty || ADAPTIVE_DIFFICULTY_CONFIG.defaultDifficulty;
  if (summary.count === 0 && userProfile?.skillLevel) {
    const skill = userProfile.skillLevel.toLowerCase();
    if (skill.includes("beginner") || skill.includes("easy")) {
      baselineDifficulty = "Easy";
    } else if (skill.includes("advanced") || skill.includes("hard")) {
      baselineDifficulty = "Hard";
    }
  }

  if (keepSame) {
    return {
      currentDifficulty: baselineDifficulty,
      targetDifficulty: baselineDifficulty,
      action: "maintain",
      isExplicit: true,
      reason: `Keeping your practice at ${baselineDifficulty} as requested.`,
      recentSummary: summary,
    };
  }

  // 4. New User / Insufficient History
  if (summary.count < ADAPTIVE_DIFFICULTY_CONFIG.minSubmissionsForAdaptation) {
    return {
      currentDifficulty: baselineDifficulty,
      targetDifficulty: baselineDifficulty,
      action: "maintain",
      isExplicit: false,
      reason: `Welcome! Starting with a balanced ${baselineDifficulty} problem based on your profile.`,
      recentSummary: summary,
    };
  }

  const { promotion, demotion } = ADAPTIVE_DIFFICULTY_CONFIG;

  // 5. Evaluate Promotion (Step Up)
  const isQualifyingSolves = summary.consecutiveSolves >= promotion.minConsecutiveSolves;
  const isHighPassRatio = summary.averagePassRatio >= promotion.minPassRatio;
  const isMinimalHints = summary.averageHints <= promotion.maxAverageHints;
  const isHighAcceptance = summary.acceptanceRate >= promotion.minAcceptanceRate;

  if (isQualifyingSolves && (isHighPassRatio || isHighAcceptance) && isMinimalHints) {
    const nextDiff = getAdjacentDifficulty(baselineDifficulty, "up");
    if (nextDiff !== baselineDifficulty) {
      const topicContext = topic ? ` on ${topic}` : "";
      return {
        currentDifficulty: baselineDifficulty,
        targetDifficulty: nextDiff,
        action: "promote",
        isExplicit: false,
        reason: `You've solved your recent ${baselineDifficulty} problems${topicContext} consistently with minimal hints, so let's step up to ${nextDiff}.`,
        recentSummary: summary,
      };
    }
  }

  // 6. Evaluate Demotion (Step Down / Reinforce Fundamentals)
  const isConsecutiveFails = summary.consecutiveFailures >= demotion.minConsecutiveFailures;
  const isLowPassRatio = summary.averagePassRatio <= demotion.maxPassRatio;
  const isHeavyHints = summary.averageHints >= demotion.heavyHintThreshold;
  const isLowAcceptance = summary.acceptanceRate <= demotion.lowAcceptanceRate;

  if ((isConsecutiveFails || isHeavyHints || isLowAcceptance) && isLowPassRatio) {
    const lowerDiff = getAdjacentDifficulty(baselineDifficulty, "down");
    if (lowerDiff !== baselineDifficulty) {
      const topicContext = topic ? ` on ${topic}` : "";
      return {
        currentDifficulty: baselineDifficulty,
        targetDifficulty: lowerDiff,
        action: "demote",
        isExplicit: false,
        reason: `Let's strengthen fundamental patterns${topicContext} with an ${lowerDiff} problem before tackling ${baselineDifficulty} again.`,
        recentSummary: summary,
      };
    }
  }

  // 7. Mixed / Steady Performance -> Maintain Level
  return {
    currentDifficulty: baselineDifficulty,
    targetDifficulty: baselineDifficulty,
    action: "maintain",
    isExplicit: false,
    reason: `Your performance at ${baselineDifficulty} is steady (${summary.acceptanceRate}% acceptance rate); let's practice another ${baselineDifficulty} problem to build mastery.`,
    recentSummary: summary,
  };
}
