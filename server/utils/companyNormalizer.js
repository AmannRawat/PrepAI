/**
 * Utility functions for normalizing company names, aliases, LeetCode problem URLs,
 * difficulties, topics, and recency tiers.
 */

// Canonical company aliases mapping common variations, tickers, and acronyms to standard display names
const COMPANY_ALIASES = {
  // FAANG / Big Tech
  amazon: "Amazon",
  amzn: "Amazon",
  "amazon.com": "Amazon",
  "amazon web services": "Amazon",
  aws: "Amazon",

  google: "Google",
  goog: "Google",
  googl: "Google",
  alphabet: "Google",

  microsoft: "Microsoft",
  msft: "Microsoft",

  meta: "Meta",
  facebook: "Meta",
  fb: "Meta",

  apple: "Apple",
  aapl: "Apple",

  netflix: "Netflix",
  nflx: "Netflix",

  // Ride-sharing & Delivery
  uber: "Uber",
  "uber technologies": "Uber",
  lyft: "Lyft",
  doordash: "DoorDash",
  instacart: "Instacart",
  grab: "Grab",

  // Enterprise / Cloud / SaaS
  salesforce: "Salesforce",
  crm: "Salesforce",
  adobe: "Adobe",
  atlassian: "Atlassian",
  snowflake: "Snowflake",
  databricks: "Databricks",
  palantir: "Palantir",
  "palantir technologies": "Palantir",
  oracle: "Oracle",
  cisco: "Cisco",
  servicenow: "ServiceNow",
  workday: "Workday",
  vmware: "VMware",
  splunk: "Splunk",
  twilio: "Twilio",
  box: "Box",
  dropbox: "Dropbox",

  // Finance / Fintech / Banking
  "goldman sachs": "Goldman Sachs",
  goldman: "Goldman Sachs",
  "goldman-sachs": "Goldman Sachs",
  gs: "Goldman Sachs",

  "jpmorgan chase": "JPMorgan Chase",
  jpmorgan: "JPMorgan Chase",
  "jp morgan": "JPMorgan Chase",
  "jp-morgan": "JPMorgan Chase",
  jpm: "JPMorgan Chase",

  "bank of america": "Bank of America",
  bofa: "Bank of America",
  "bank-of-america": "Bank of America",

  "american express": "American Express",
  amex: "American Express",
  "american-express": "American Express",

  "morgan stanley": "Morgan Stanley",
  citadel: "Citadel",
  "two sigma": "Two Sigma",
  "jane street": "Jane Street",
  bloomberg: "Bloomberg",
  stripe: "Stripe",
  square: "Block",
  block: "Block",
  paypal: "PayPal",
  robinhood: "Robinhood",
  coinbase: "Coinbase",
  barclays: "Barclays",
  blackrock: "BlackRock",
  blackstone: "BlackStone",

  // Social / Media / Consumer
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  "x (twitter)": "X (Twitter)",
  bytedance: "ByteDance",
  "byte dance": "ByteDance",
  tiktok: "ByteDance",
  snap: "Snap",
  snapchat: "Snap",
  pinterest: "Pinterest",
  spotify: "Spotify",
  reddit: "Reddit",
  airbnb: "Airbnb",

  // Hardware / Semiconductors
  nvidia: "Nvidia",
  intel: "Intel",
  amd: "AMD",
  qualcomm: "Qualcomm",
  apple: "Apple",
  tesla: "Tesla",
  ibm: "IBM",
  sap: "SAP",

  // Retail / Other
  walmart: "Walmart",
  "walmart labs": "Walmart",
  target: "Target",
  ebay: "eBay",
};

/**
 * Normalizes a raw company string or directory name into a canonical company name.
 * e.g. "amzn" -> "Amazon", "akuna-capital" -> "Akuna Capital", "AQR Capital Management" -> "AQR Capital Management"
 */
export function normalizeCompanyName(rawName) {
  if (!rawName || typeof rawName !== "string") return "";

  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  // Check alias dictionary
  if (COMPANY_ALIASES[lower]) {
    return COMPANY_ALIASES[lower];
  }

  // Convert kebab-case or underscore-case into title case
  const words = trimmed
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return trimmed;

  return words
    .map((word) => {
      // Preserve uppercase acronyms like AMD, IBM, SAP, AQR, SE, LLC, IT
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      // If it starts with digits like 6sense, 1kosmos
      if (/^\d+[a-z]+/i.test(word)) {
        return word.toLowerCase();
      }
      // Standard title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Normalizes a LeetCode problem URL and extracts the canonical problem slug.
 * e.g. "https://leetcode.com/problems/two-sum/description/" -> { slug: "two-sum", url: "https://leetcode.com/problems/two-sum/" }
 */
export function normalizeProblemUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { slug: "", url: "" };
  }

  const trimmed = rawUrl.trim();
  // Match LeetCode problem slug
  const match = trimmed.match(/leetcode\.com\/problems\/([a-zA-Z0-9-_]+)/i);

  if (!match || !match[1]) {
    // If raw input is just the slug itself
    const cleanSlug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/^_+|_+$/g, "");
    if (cleanSlug) {
      return {
        slug: cleanSlug,
        url: `https://leetcode.com/problems/${cleanSlug}/`,
      };
    }
    return { slug: "", url: "" };
  }

  const slug = match[1].toLowerCase();
  return {
    slug,
    url: `https://leetcode.com/problems/${slug}/`,
  };
}

/**
 * Normalizes difficulty to standard "Easy" | "Medium" | "Hard".
 */
export function normalizeDifficulty(rawDifficulty) {
  if (!rawDifficulty || typeof rawDifficulty !== "string") return "Medium";
  const clean = rawDifficulty.trim().toLowerCase();

  if (clean === "easy") return "Easy";
  if (clean === "medium") return "Medium";
  if (clean === "hard") return "Hard";

  return "Medium";
}

/**
 * Normalizes recency from file name or timeframe identifier into standard recency tiers.
 * Returns { recency: string, recencyScore: number }
 * Score: 1 (highest recency: 30 days) to 5 (all-time).
 */
export function normalizeRecency(filenameOrTimeframe) {
  if (!filenameOrTimeframe || typeof filenameOrTimeframe !== "string") {
    return { recency: "all-time", recencyScore: 5 };
  }

  const lower = filenameOrTimeframe.toLowerCase();

  if (lower.includes("thirty") || lower.includes("30") || lower.includes("month-1")) {
    return { recency: "thirty-days", recencyScore: 1 };
  }
  if (lower.includes("three") || lower.includes("3-month") || lower.includes("90")) {
    return { recency: "three-months", recencyScore: 2 };
  }
  if (lower.includes("more-than-six") || lower.includes("more than six")) {
    return { recency: "more-than-six-months", recencyScore: 4 };
  }
  if (lower.includes("six") || lower.includes("6-month") || lower.includes("180")) {
    return { recency: "six-months", recencyScore: 3 };
  }

  return { recency: "all-time", recencyScore: 5 };
}

/**
 * Normalizes frequency string or number to a float percentage between 0 and 100.
 */
export function normalizeFrequency(rawFrequency) {
  if (rawFrequency === null || rawFrequency === undefined || rawFrequency === "") {
    return 0;
  }

  if (typeof rawFrequency === "number") {
    if (Number.isNaN(rawFrequency)) return 0;
    return Math.max(0, Math.min(100, Math.round(rawFrequency * 10) / 10));
  }

  const cleaned = String(rawFrequency).replace("%", "").trim();
  const parsed = parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;

  return Math.max(0, Math.min(100, Math.round(parsed * 10) / 10));
}

/**
 * Normalizes acceptance rate to a clean float percentage (0 - 100).
 */
export function normalizeAcceptanceRate(rawRate) {
  if (rawRate === null || rawRate === undefined || rawRate === "") {
    return 0;
  }

  const str = String(rawRate).replace("%", "").trim();
  const parsed = parseFloat(str);
  if (Number.isNaN(parsed)) return 0;

  // If already in percentage scale (e.g. 57.8)
  if (parsed > 1.0) {
    return Math.min(100, Math.round(parsed * 10) / 10);
  }

  // If decimal fraction representation (e.g. 0.578)
  if (parsed > 0.0 && parsed <= 1.0) {
    return Math.round(parsed * 1000) / 10;
  }

  return 0;
}

/**
 * Normalizes a topics string or array into a clean array of unique topic strings.
 * e.g. "Array, Hash Table, Array" -> ["Array", "Hash Table"]
 */
export function normalizeTopics(rawTopics) {
  if (!rawTopics) return [];

  let list = [];
  if (Array.isArray(rawTopics)) {
    list = rawTopics;
  } else if (typeof rawTopics === "string") {
    list = rawTopics.split(",");
  }

  const set = new Set();
  for (const item of list) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) {
        set.add(trimmed);
      }
    }
  }

  return Array.from(set);
}
