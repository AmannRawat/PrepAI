import CompanyQuestion from "../models/CompanyQuestion.model.js";
import {
  normalizeCompanyName,
  normalizeDifficulty,
} from "../utils/companyNormalizer.js";

/**
 * Community data attribution & educational disclaimer
 */
export const COMPANY_CATALOG_DISCLAIMER =
  "Community-curated LeetCode question tags sourced from open-source repositories " +
  "(snehasishroy/leetcode-companywise-interview-questions and liquidslr/leetcode-company-wise-problems). " +
  "These represent community frequency tags and are not official or verified company interview questions.";

/**
 * Retrieves company-specific questions matching optional difficulty and topic filters,
 * ranked by recency (30 days > 3 months > 6 months > all-time) and frequency.
 *
 * @param {object} options
 * @param {string} options.company - Target company name or alias (e.g. "Amazon", "amzn", "Google")
 * @param {string} [options.difficulty] - "Easy", "Medium", or "Hard"
 * @param {string} [options.topic] - Topic filter (e.g. "Dynamic Programming", "Trees")
 * @param {number} [options.limit=5] - Number of questions to return
 * @param {string[]} [options.excludeSlugs=[]] - Question slugs to exclude (e.g. recently attempted)
 * @returns {Promise<{ company: string, questions: Array<object>, totalMatched: number, disclaimer: string }>}
 */
export async function getCompanyQuestions({
  company,
  difficulty,
  topic,
  limit = 5,
  excludeSlugs = [],
}) {
  const normalizedCompany = normalizeCompanyName(company);
  if (!normalizedCompany) {
    return {
      company: "",
      questions: [],
      totalMatched: 0,
      disclaimer: COMPANY_CATALOG_DISCLAIMER,
    };
  }

  const query = {
    $or: [
      { company: normalizedCompany },
      { company: new RegExp(`^${escapeRegex(normalizedCompany)}$`, "i") },
    ],
  };

  if (difficulty && typeof difficulty === "string") {
    query.difficulty = normalizeDifficulty(difficulty);
  }

  if (topic && typeof topic === "string" && topic.trim()) {
    const cleanTopic = topic.trim();
    query.topics = {
      $regex: new RegExp(escapeRegex(cleanTopic), "i"),
    };
  }

  if (Array.isArray(excludeSlugs) && excludeSlugs.length > 0) {
    query.problemSlug = { $nin: excludeSlugs };
  }

  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));

  // Query and rank by recencyScore ASC (1 = 30 days, 2 = 3 months, etc.) and frequency DESC
  const questions = await CompanyQuestion.find(query)
    .sort({ recencyScore: 1, frequency: -1 })
    .limit(safeLimit)
    .lean();

  const totalMatched = await CompanyQuestion.countDocuments(query);

  return {
    company: normalizedCompany,
    questions: questions.map((q) => ({
      id: q._id ? String(q._id) : q.problemSlug,
      title: q.title,
      problemSlug: q.problemSlug,
      url: q.url,
      company: q.company,
      difficulty: q.difficulty,
      topics: q.topics || [],
      frequency: q.frequency,
      frequencyFormatted: `${q.frequency}%`,
      acceptanceRate: q.acceptanceRate,
      acceptanceRateFormatted: `${q.acceptanceRate}%`,
      recency: q.recency,
      recencyLabel: formatRecencyLabel(q.recency),
      sources: q.sources || [],
    })),
    totalMatched,
    disclaimer: COMPANY_CATALOG_DISCLAIMER,
  };
}

/**
 * Returns a list of distinct popular companies currently available in the catalog.
 */
export async function getAvailableCompanies(limit = 30) {
  try {
    const companies = await CompanyQuestion.distinct("company");
    return companies
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit);
  } catch (err) {
    console.warn("Failed to fetch available companies:", err.message);
    return [
      "Amazon",
      "Google",
      "Meta",
      "Microsoft",
      "Apple",
      "Uber",
      "Bloomberg",
      "Netflix",
      "Adobe",
      "Salesforce",
    ];
  }
}

/**
 * Merges a newly parsed question record with an existing catalog record in memory.
 * Idempotently combines topics, updates max frequency, keeps highest recency tier,
 * and maintains provenance.
 */
export function mergeQuestionRecords(existing, incoming) {
  if (!existing) return { ...incoming };

  // Topics union
  const mergedTopics = Array.from(
    new Set([...(existing.topics || []), ...(incoming.topics || [])])
  );

  // Highest frequency reported across sources
  const maxFrequency = Math.max(
    existing.frequency || 0,
    incoming.frequency || 0
  );

  // Best recency (lowest recency score: 1 = thirty-days, 5 = all-time)
  const isIncomingMoreRecent =
    (incoming.recencyScore || 5) < (existing.recencyScore || 5);
  const bestRecency = isIncomingMoreRecent
    ? incoming.recency
    : existing.recency || "all-time";
  const bestRecencyScore = isIncomingMoreRecent
    ? incoming.recencyScore
    : existing.recencyScore || 5;

  // Union of source repository identifiers
  const mergedSources = Array.from(
    new Set([...(existing.sources || []), ...(incoming.sources || [])])
  );

  // Merge provenance entries
  const mergedProvenance = [
    ...(existing.sourceProvenance || []),
    ...(incoming.sourceProvenance || []),
  ];

  return {
    ...existing,
    title: incoming.title || existing.title,
    url: incoming.url || existing.url,
    difficulty: incoming.difficulty || existing.difficulty,
    topics: mergedTopics,
    frequency: maxFrequency,
    acceptanceRate: incoming.acceptanceRate || existing.acceptanceRate || 0,
    recency: bestRecency,
    recencyScore: bestRecencyScore,
    sources: mergedSources,
    sourceProvenance: mergedProvenance,
    lastSyncedAt: new Date(),
  };
}

function formatRecencyLabel(recency) {
  switch (recency) {
    case "thirty-days":
      return "Past 30 Days";
    case "three-months":
      return "Past 3 Months";
    case "six-months":
      return "Past 6 Months";
    case "more-than-six-months":
      return "More than 6 Months ago";
    case "all-time":
    default:
      return "All Time";
  }
}

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
