/**
 * Pure helper to resolve a stable unique problem key from a submission record.
 * Prioritizes explicit problemId / problem.id, falling back to trimmed lowercase title.
 */
export function getSubmissionProblemKey(sub) {
  if (!sub) return "unknown-problem";
  if (sub.problemId && typeof sub.problemId === "string" && sub.problemId.trim()) {
    return `id:${sub.problemId.trim()}`;
  }
  if (sub.problem && sub.problem.id && typeof sub.problem.id === "string" && sub.problem.id.trim()) {
    return `id:${sub.problem.id.trim()}`;
  }
  if (sub.problem && sub.problem.title && typeof sub.problem.title === "string" && sub.problem.title.trim()) {
    return `title:${sub.problem.title.trim().toLowerCase()}`;
  }
  return "unknown-problem";
}

/**
 * Calculates submission analytics from raw MongoDB DsaSubmission documents.
 * 
 * Rules:
 * 1. Total attempts: Total valid attempts submitted by the user.
 * 2. Total accepted attempts: Total attempts with authoritative verdict === "Accepted".
 * 3. Unique successfully solved problems: Distinct problems where at least one attempt was "Accepted".
 *    Duplicate solves on the same problem do NOT inflate this count.
 * 4. Acceptance rate: successful attempts / total valid attempts (percentage rounded to nearest integer).
 * 5. Unique solved problems is kept strictly separate from total accepted attempts.
 * 6. Gracefully handles users with 0 submissions.
 * 
 * @param {Array} submissions - List of DsaSubmission documents or plain objects.
 * @returns {Object} Calculated stats object.
 */
export function calculateDsaStats(submissions) {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return {
      totalAttempts: 0,
      acceptedAttempts: 0,
      uniqueSolved: 0,
      totalProblemsAttempted: 0,
      acceptanceRate: 0,
      topicStats: {},
      topicBreakdown: [],
    };
  }

  let totalAttempts = 0;
  let acceptedAttempts = 0;

  const attemptedProblemsMap = new Map(); // problemKey -> attemptCount
  const solvedProblemsMap = new Map(); // problemKey -> true
  const topicStatsMap = new Map(); // topicName -> { topic, attempts, acceptedAttempts, solvedKeys, attemptedKeys }

  for (const sub of submissions) {
    if (!sub) continue;

    totalAttempts += 1;
    const isAccepted = sub.verdict === "Accepted";
    if (isAccepted) {
      acceptedAttempts += 1;
    }

    const problemKey = getSubmissionProblemKey(sub);
    attemptedProblemsMap.set(
      problemKey,
      (attemptedProblemsMap.get(problemKey) || 0) + 1
    );

    if (isAccepted) {
      solvedProblemsMap.set(problemKey, true);
    }

    const topic = (sub.topic && typeof sub.topic === "string" && sub.topic.trim())
      ? sub.topic.trim()
      : "General";

    if (!topicStatsMap.has(topic)) {
      topicStatsMap.set(topic, {
        topic,
        attempts: 0,
        acceptedAttempts: 0,
        solvedKeys: new Set(),
        attemptedKeys: new Set(),
      });
    }

    const tData = topicStatsMap.get(topic);
    tData.attempts += 1;
    tData.attemptedKeys.add(problemKey);
    if (isAccepted) {
      tData.acceptedAttempts += 1;
      tData.solvedKeys.add(problemKey);
    }
  }

  const uniqueSolved = solvedProblemsMap.size;
  const totalProblemsAttempted = attemptedProblemsMap.size;
  const acceptanceRate = totalAttempts > 0
    ? Math.round((acceptedAttempts / totalAttempts) * 100)
    : 0;

  const topicBreakdown = Array.from(topicStatsMap.values()).map((t) => {
    const topicAcceptanceRate = t.attempts > 0
      ? Math.round((t.acceptedAttempts / t.attempts) * 100)
      : 0;

    return {
      topic: t.topic,
      attempts: t.attempts,
      acceptedAttempts: t.acceptedAttempts,
      uniqueSolved: t.solvedKeys.size,
      totalProblemsAttempted: t.attemptedKeys.size,
      acceptanceRate: topicAcceptanceRate,
      needsImprovement: topicAcceptanceRate < 60 || t.solvedKeys.size === 0,
    };
  });

  // Sort topics by most attempted descending
  topicBreakdown.sort((a, b) => b.attempts - a.attempts);

  const topicStats = {};
  for (const t of topicBreakdown) {
    topicStats[t.topic] = t;
  }

  return {
    totalAttempts,
    acceptedAttempts,
    uniqueSolved,
    totalProblemsAttempted,
    acceptanceRate,
    topicStats,
    topicBreakdown,
  };
}
