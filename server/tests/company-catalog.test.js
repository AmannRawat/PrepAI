import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  normalizeCompanyName,
  normalizeProblemUrl,
  normalizeDifficulty,
  normalizeRecency,
  normalizeFrequency,
  normalizeAcceptanceRate,
  normalizeTopics,
} from "../utils/companyNormalizer.js";

import { parseCSV } from "../utils/csvParser.js";
import {
  parseSnehasishroyFile,
  parseLiquidslrFile,
  aggregateRecords,
  sanitizeMongoUri,
} from "../scripts/syncCompanyQuestions.js";

import {
  mergeQuestionRecords,
  COMPANY_CATALOG_DISCLAIMER,
} from "../services/companyQuestion.service.js";

import {
  extractQuestionCount,
  formatCatalogQuestionsResponse,
  formatCatalogMissResponse,
  sanitizeAiProblemConfirmation,
  coachChat,
} from "../controllers/dsa.controller.js";

import dns from "node:dns";
import CompanyQuestion from "../models/CompanyQuestion.model.js";
import CatalogSyncLog from "../models/CatalogSyncLog.model.js";
import {
  isValidDnsServerAddress,
  parseDnsServers,
  configureMongoDns,
} from "../utils/dnsConfig.js";

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

console.log("=================================================");
console.log("  COMPANY DSA CATALOG & SYNC VERIFICATION TESTS  ");
console.log("=================================================");

// ---------------------------------------------------------------------------
// Suite 1: Normalization, Aliases & Canonical URLs
// ---------------------------------------------------------------------------
console.log("\n--- Suite 1: Normalization, Aliases & Canonical URLs ---");

runTest("Company alias mapping normalizes variations to canonical names", () => {
  assert.equal(normalizeCompanyName("amzn"), "Amazon");
  assert.equal(normalizeCompanyName("amazon"), "Amazon");
  assert.equal(normalizeCompanyName("amazon web services"), "Amazon");
  assert.equal(normalizeCompanyName("google"), "Google");
  assert.equal(normalizeCompanyName("goog"), "Google");
  assert.equal(normalizeCompanyName("msft"), "Microsoft");
  assert.equal(normalizeCompanyName("microsoft"), "Microsoft");
  assert.equal(normalizeCompanyName("fb"), "Meta");
  assert.equal(normalizeCompanyName("facebook"), "Meta");
  assert.equal(normalizeCompanyName("meta"), "Meta");
  assert.equal(normalizeCompanyName("aapl"), "Apple");
  assert.equal(normalizeCompanyName("apple"), "Apple");
  assert.equal(normalizeCompanyName("nflx"), "Netflix");
  assert.equal(normalizeCompanyName("netflix"), "Netflix");
  assert.equal(normalizeCompanyName("goldman sachs"), "Goldman Sachs");
  assert.equal(normalizeCompanyName("goldman"), "Goldman Sachs");
  assert.equal(normalizeCompanyName("bofa"), "Bank of America");
  assert.equal(normalizeCompanyName("american express"), "American Express");
  assert.equal(normalizeCompanyName("bytedance"), "ByteDance");
});

runTest("Fallback company normalization title-cases and handles kebab/slugs", () => {
  assert.equal(normalizeCompanyName("akuna-capital"), "Akuna Capital");
  assert.equal(normalizeCompanyName("AQR Capital Management"), "AQR Capital Management");
  assert.equal(normalizeCompanyName("6sense"), "6sense");
  assert.equal(normalizeCompanyName("1kosmos"), "1kosmos");
  assert.equal(normalizeCompanyName("amd"), "AMD");
  assert.equal(normalizeCompanyName("ibm"), "IBM");
});

runTest("LeetCode problem URL normalization extracts canonical slug and URL", () => {
  const t1 = normalizeProblemUrl("https://leetcode.com/problems/two-sum");
  assert.equal(t1.slug, "two-sum");
  assert.equal(t1.url, "https://leetcode.com/problems/two-sum/");

  const t2 = normalizeProblemUrl("https://leetcode.com/problems/two-sum/description/");
  assert.equal(t2.slug, "two-sum");
  assert.equal(t2.url, "https://leetcode.com/problems/two-sum/");

  const t3 = normalizeProblemUrl("http://leetcode.com/problems/trapping-rain-water/?envType=featured");
  assert.equal(t3.slug, "trapping-rain-water");
  assert.equal(t3.url, "https://leetcode.com/problems/trapping-rain-water/");

  const t4 = normalizeProblemUrl("lru-cache");
  assert.equal(t4.slug, "lru-cache");
  assert.equal(t4.url, "https://leetcode.com/problems/lru-cache/");

  const t5 = normalizeProblemUrl("");
  assert.equal(t5.slug, "");
  assert.equal(t5.url, "");
});

runTest("Difficulty normalization maps casing to Easy, Medium, or Hard", () => {
  assert.equal(normalizeDifficulty("easy"), "Easy");
  assert.equal(normalizeDifficulty("EASY"), "Easy");
  assert.equal(normalizeDifficulty("Medium"), "Medium");
  assert.equal(normalizeDifficulty("HARD"), "Hard");
  assert.equal(normalizeDifficulty("unknown"), "Medium");
});

runTest("Recency normalization categorizes timeframes and assigns sorting score", () => {
  const r1 = normalizeRecency("thirty-days.csv");
  assert.equal(r1.recency, "thirty-days");
  assert.equal(r1.recencyScore, 1);

  const r2 = normalizeRecency("1. Thirty Days.csv");
  assert.equal(r2.recency, "thirty-days");
  assert.equal(r2.recencyScore, 1);

  const r3 = normalizeRecency("2. Three Months.csv");
  assert.equal(r3.recency, "three-months");
  assert.equal(r3.recencyScore, 2);

  const r4 = normalizeRecency("six-months.csv");
  assert.equal(r4.recency, "six-months");
  assert.equal(r4.recencyScore, 3);

  const r5 = normalizeRecency("4. More Than Six Months.csv");
  assert.equal(r5.recency, "more-than-six-months");
  assert.equal(r5.recencyScore, 4);

  const r6 = normalizeRecency("5. All.csv");
  assert.equal(r6.recency, "all-time");
  assert.equal(r6.recencyScore, 5);
});

runTest("Frequency, acceptance rate and topics normalize cleanly", () => {
  assert.equal(normalizeFrequency("100.0%"), 100);
  assert.equal(normalizeFrequency("87.5%"), 87.5);
  assert.equal(normalizeFrequency(62.8), 62.8);
  assert.equal(normalizeFrequency(""), 0);

  assert.equal(normalizeAcceptanceRate("57.8%"), 57.8);
  assert.equal(normalizeAcceptanceRate(0.578), 57.8);
  assert.equal(normalizeAcceptanceRate(""), 0);

  const topics = normalizeTopics("Array, Hash Table, Dynamic Programming, Array");
  assert.deepEqual(topics, ["Array", "Hash Table", "Dynamic Programming"]);
});

// ---------------------------------------------------------------------------
// Suite 2: CSV Parsing & Invalid Row Handling
// ---------------------------------------------------------------------------
console.log("\n--- Suite 2: CSV Parsing & Invalid Row Handling ---");

runTest("CSV parser handles commas inside quotes and escaped quotes", () => {
  const csvContent = `Difficulty,Title,Frequency,Acceptance Rate,Link,Topics
EASY,Two Sum,100.0,0.578,https://leetcode.com/problems/two-sum,"Array, Hash Table"
MEDIUM,"Problem with ""Quotes"" inside",75.0,0.45,https://leetcode.com/problems/sample,"Graph, Tree"
`;

  const parsed = parseCSV(csvContent);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].Title, "Two Sum");
  assert.equal(parsed[0].Topics, "Array, Hash Table");
  assert.equal(parsed[1].Title, 'Problem with "Quotes" inside');
  assert.equal(parsed[1].Topics, "Graph, Tree");
});

runTest("CSV parser gracefully ignores empty or malformed rows", () => {
  const emptyCsv = "";
  assert.deepEqual(parseCSV(emptyCsv), []);

  const headerOnly = "Difficulty,Title,Link\n";
  assert.deepEqual(parseCSV(headerOnly), []);

  const withEmptyLines = `ID,URL,Title,Difficulty,Acceptance %,Frequency %
1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57.8%,100.0%

\r\n
2,https://leetcode.com/problems/add-two-numbers,Add Two Numbers,Medium,48.8%,75.0%
`;
  const records = parseCSV(withEmptyLines);
  assert.equal(records.length, 2);
});

// ---------------------------------------------------------------------------
// Suite 3: Repository Metadata Parsing & Extraction
// ---------------------------------------------------------------------------
console.log("\n--- Suite 3: Repository Metadata Parsing & Extraction ---");

runTest("Parses snehasishroy folder structure and headers correctly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-snehasish-"));
  const csvFile = path.join(tempDir, "thirty-days.csv");
  fs.writeFileSync(
    csvFile,
    `ID,URL,Title,Difficulty,Acceptance %,Frequency %
1,https://leetcode.com/problems/two-sum,Two Sum,Easy,57.8%,100.0%
146,https://leetcode.com/problems/lru-cache,LRU Cache,Medium,47.6%,75.0%
`
  );

  const results = parseSnehasishroyFile(csvFile, "amazon");
  assert.equal(results.length, 2);
  assert.equal(results[0].company, "Amazon");
  assert.equal(results[0].problemSlug, "two-sum");
  assert.equal(results[0].difficulty, "Easy");
  assert.equal(results[0].frequency, 100);
  assert.equal(results[0].recency, "thirty-days");
  assert.equal(results[0].source, "snehasishroy");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

runTest("Parses liquidslr folder structure and headers correctly", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-liquidslr-"));
  const csvFile = path.join(tempDir, "1. Thirty Days.csv");
  fs.writeFileSync(
    csvFile,
    `Difficulty,Title,Frequency,Acceptance Rate,Link,Topics
EASY,Two Sum,100.0,0.0058,https://leetcode.com/problems/two-sum,"Array, Hash Table"
HARD,Trapping Rain Water,79.3,0.0068,https://leetcode.com/problems/trapping-rain-water,"Array, Dynamic Programming"
`
  );

  const results = parseLiquidslrFile(csvFile, "Google");
  assert.equal(results.length, 2);
  assert.equal(results[0].company, "Google");
  assert.equal(results[0].problemSlug, "two-sum");
  assert.equal(results[0].difficulty, "Easy");
  assert.deepEqual(results[0].topics, ["Array", "Hash Table"]);
  assert.equal(results[0].source, "liquidslr");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Suite 4: Deduplication, Merging & Provenance Preservation
// ---------------------------------------------------------------------------
console.log("\n--- Suite 4: Deduplication, Merging & Provenance Preservation ---");

runTest("Aggregates and deduplicates matching problems across sources and timeframes", () => {
  const records = [
    {
      problemSlug: "two-sum",
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/",
      company: "Amazon",
      difficulty: "Easy",
      topics: [],
      frequency: 75.0,
      acceptanceRate: 57.8,
      recency: "six-months",
      recencyScore: 3,
      source: "snehasishroy",
    },
    {
      problemSlug: "two-sum",
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/",
      company: "Amazon",
      difficulty: "Easy",
      topics: ["Array", "Hash Table"],
      frequency: 100.0,
      acceptanceRate: 57.8,
      recency: "thirty-days",
      recencyScore: 1,
      source: "liquidslr",
    },
    {
      problemSlug: "two-sum",
      title: "Two Sum",
      url: "https://leetcode.com/problems/two-sum/",
      company: "Google",
      difficulty: "Easy",
      topics: ["Array"],
      frequency: 60.0,
      acceptanceRate: 57.8,
      recency: "three-months",
      recencyScore: 2,
      source: "liquidslr",
    },
  ];

  const aggregated = aggregateRecords(records);
  assert.equal(aggregated.length, 2); // Amazon two-sum and Google two-sum

  const amazonTwoSum = aggregated.find((r) => r.company === "Amazon");
  assert.ok(amazonTwoSum);
  assert.equal(amazonTwoSum.frequency, 100.0); // max frequency picked
  assert.equal(amazonTwoSum.recency, "thirty-days"); // higher recency picked
  assert.equal(amazonTwoSum.recencyScore, 1);
  assert.deepEqual(amazonTwoSum.topics, ["Array", "Hash Table"]); // topics merged
  assert.ok(amazonTwoSum.sources.includes("snehasishroy"));
  assert.ok(amazonTwoSum.sources.includes("liquidslr"));
  assert.equal(amazonTwoSum.sourceProvenance.length, 2);
});

runTest("mergeQuestionRecords updates fields idempotently without losing history", () => {
  const existing = {
    problemSlug: "lru-cache",
    title: "LRU Cache",
    url: "https://leetcode.com/problems/lru-cache/",
    company: "Amazon",
    difficulty: "Medium",
    topics: ["Hash Table"],
    frequency: 67.4,
    recency: "six-months",
    recencyScore: 3,
    sources: ["snehasishroy"],
    sourceProvenance: [
      { source: "snehasishroy", timeframe: "six-months", frequency: 67.4 },
    ],
  };

  const incoming = {
    problemSlug: "lru-cache",
    title: "LRU Cache",
    url: "https://leetcode.com/problems/lru-cache/",
    company: "Amazon",
    difficulty: "Medium",
    topics: ["Linked List", "Design"],
    frequency: 75.0,
    recency: "thirty-days",
    recencyScore: 1,
    sources: ["liquidslr"],
    sourceProvenance: [
      { source: "liquidslr", timeframe: "thirty-days", frequency: 75.0 },
    ],
  };

  const merged = mergeQuestionRecords(existing, incoming);
  assert.equal(merged.frequency, 75.0);
  assert.equal(merged.recency, "thirty-days");
  assert.equal(merged.recencyScore, 1);
  assert.deepEqual(merged.topics, ["Hash Table", "Linked List", "Design"]);
  assert.deepEqual(merged.sources, ["snehasishroy", "liquidslr"]);
  assert.equal(merged.sourceProvenance.length, 2);
});

// ---------------------------------------------------------------------------
// Suite 5: Security & Connection String Masking
// ---------------------------------------------------------------------------
console.log("\n--- Suite 5: Security & Connection String Masking ---");

runTest("sanitizeMongoUri masks credentials cleanly from logs", () => {
  const uri = "mongodb+srv://adminUser:SuperSecretPass123!@prepai-cluster.mongodb.net/prod-db?retryWrites=true";
  const masked = sanitizeMongoUri(uri);
  assert.ok(!masked.includes("SuperSecretPass123!"));
  assert.ok(masked.includes("mongodb+srv://adminUser:****@prepai-cluster.mongodb.net/prod-db?retryWrites=true"));

  assert.equal(sanitizeMongoUri(null), "(not set)");
});

runTest("Mongoose models define required schemas and compound index paths", () => {
  assert.ok(CompanyQuestion.schema.path("problemSlug"));
  assert.ok(CompanyQuestion.schema.path("company"));
  assert.ok(CompanyQuestion.schema.path("difficulty"));
  assert.ok(CompanyQuestion.schema.path("frequency"));
  assert.ok(CompanyQuestion.schema.path("recencyScore"));
  assert.ok(CatalogSyncLog.schema.path("syncId"));
  assert.ok(CatalogSyncLog.schema.path("status"));
  assert.ok(CatalogSyncLog.schema.path("metrics.imported"));
});

// ---------------------------------------------------------------------------
// Suite 6: Attribution Disclaimer Contract
// ---------------------------------------------------------------------------
console.log("\n--- Suite 6: Attribution Disclaimer Contract ---");

runTest("Catalog attribution disclaimer clearly states community tags are not official company docs", () => {
  assert.ok(COMPANY_CATALOG_DISCLAIMER.includes("snehasishroy"));
  assert.ok(COMPANY_CATALOG_DISCLAIMER.includes("liquidslr"));
  assert.ok(COMPANY_CATALOG_DISCLAIMER.toLowerCase().includes("not official"));
});

// ---------------------------------------------------------------------------
// Suite 7: MongoDB DNS Configuration & Resolver Validation
// ---------------------------------------------------------------------------
console.log("\n--- Suite 7: MongoDB DNS Configuration & Resolver Validation ---");

runTest("isValidDnsServerAddress accurately validates IPv4, IPv6, and ports", () => {
  assert.equal(isValidDnsServerAddress("8.8.8.8"), true);
  assert.equal(isValidDnsServerAddress("1.1.1.1:53"), true);
  assert.equal(isValidDnsServerAddress("127.0.0.1"), true);
  assert.equal(isValidDnsServerAddress("2001:4860:4860::8888"), true);
  assert.equal(isValidDnsServerAddress("[2001:4860:4860::8888]:53"), true);

  // Invalid addresses
  assert.equal(isValidDnsServerAddress(""), false);
  assert.equal(isValidDnsServerAddress("not-an-ip"), false);
  assert.equal(isValidDnsServerAddress("999.999.999.999"), false);
  assert.equal(isValidDnsServerAddress("8.8.8.8:99999"), false);
  assert.equal(isValidDnsServerAddress("http://8.8.8.8"), false);
});

runTest("parseDnsServers parses comma/space delimited strings and arrays", () => {
  const p1 = parseDnsServers("8.8.8.8, 1.1.1.1");
  assert.equal(p1.valid, true);
  assert.deepEqual(p1.servers, ["8.8.8.8", "1.1.1.1"]);
  assert.equal(p1.invalidEntries.length, 0);

  const p2 = parseDnsServers(["8.8.8.8", "8.8.4.4"]);
  assert.equal(p2.valid, true);
  assert.deepEqual(p2.servers, ["8.8.8.8", "8.8.4.4"]);

  const p3 = parseDnsServers("8.8.8.8, invalid-host, 1.1.1.1");
  assert.equal(p3.valid, false);
  assert.deepEqual(p3.servers, ["8.8.8.8", "1.1.1.1"]);
  assert.deepEqual(p3.invalidEntries, ["invalid-host"]);

  const p4 = parseDnsServers("");
  assert.equal(p4.valid, false);
  assert.deepEqual(p4.servers, []);
});

runTest("configureMongoDns leaves default DNS behavior untouched when unconfigured", () => {
  const initialServers = dns.getServers();
  const result = configureMongoDns("");
  assert.equal(result.configured, false);
  assert.deepEqual(dns.getServers(), initialServers);

  const resultNull = configureMongoDns(null);
  assert.equal(resultNull.configured, false);
  assert.deepEqual(dns.getServers(), initialServers);
});

runTest("configureMongoDns leaves default DNS unchanged on invalid input", () => {
  const initialServers = dns.getServers();
  const result = configureMongoDns("invalid.dns.server.name");
  assert.equal(result.configured, false);
  assert.ok(result.error);
  assert.deepEqual(dns.getServers(), initialServers);
});

runTest("configureMongoDns configures Node resolver when valid servers provided", () => {
  const initialServers = dns.getServers();
  try {
    const result = configureMongoDns("1.1.1.1, 1.0.0.1");
    assert.equal(result.configured, true);
    assert.deepEqual(result.servers, ["1.1.1.1", "1.0.0.1"]);
    assert.deepEqual(dns.getServers(), ["1.1.1.1", "1.0.0.1"]);
  } finally {
    // Restore initial servers
    if (initialServers && initialServers.length > 0) {
      dns.setServers(initialServers);
    }
  }
});

// ---------------------------------------------------------------------------
// Suite 8: Company-Specific Retrieval & AI Fallback Prevention (Regression)
// ---------------------------------------------------------------------------
console.log("\n--- Suite 8: Company-Specific Retrieval & AI Fallback Prevention ---");

await runTest("Exact reproduction query ('Give me an Amazon medium-level DSA question.') routes to catalog retrieval without synthetic problem generation", () => {
  const message = "Give me an Amazon medium-level DSA question.";

  const companyRegex = /\b(amazon|amzn|google|goog|microsoft|msft|meta|facebook|fb|apple|aapl|netflix|nflx|uber|lyft|salesforce|adobe|bloomberg|goldman\s*sachs|goldman|jpmorgan|jp\s*morgan|morgan\s*stanley|stripe|bytedance|tiktok|atlassian|palantir|twitter|x|linkedin|walmart|oracle|cisco|airbnb|amd|nvidia|intel|snowflake|databricks|spotify|pinterest|snap|snapchat|dropbox|coinbase|robinhood|barclays|blackrock|blackstone)\b/i;
  const companyMatch = message.match(companyRegex);
  assert.ok(companyMatch);
  assert.equal(normalizeCompanyName(companyMatch[1]), "Amazon");

  const diffMatch = message.match(/\b(easy|medium|hard)\b/i);
  assert.ok(diffMatch);
  assert.equal(diffMatch[1].toLowerCase(), "medium");

  const isExplicitAiGen = /\b(?:ai-generated|ai generated|ai practice|generate an? ai|create an? ai|original ai|synthetic)\b/i.test(message);
  assert.equal(isExplicitAiGen, false);

  const isCompanyQuestionQuery =
    /\b(?:question|questions|problem|problems|interview questions|dsa questions|leetcode|give me|show me|find|list|tag|tags|catalog)\b/i.test(message) ||
    Boolean(diffMatch);
  assert.equal(isCompanyQuestionQuery, true);

  const isCompanyCatalogRequest = Boolean(companyMatch) && !isExplicitAiGen && isCompanyQuestionQuery;
  assert.equal(isCompanyCatalogRequest, true);
});

await runTest("extractQuestionCount correctly parses single vs multi question quantities", () => {
  // Singular cases (default or explicit singular markers)
  assert.equal(extractQuestionCount("Give me an Amazon medium-level DSA question."), 1);
  assert.equal(extractQuestionCount("Give me a Google hard question"), 1);
  assert.equal(extractQuestionCount("Give me 1 Amazon medium question"), 1);
  assert.equal(extractQuestionCount("Give me one Amazon question"), 1);
  assert.equal(extractQuestionCount("Amazon question"), 1);

  // Multi question cases (explicit counts and plural words)
  assert.equal(extractQuestionCount("Give me five Amazon medium-level DSA questions"), 5);
  assert.equal(extractQuestionCount("Give me 5 Amazon medium-level DSA questions"), 5);
  assert.equal(extractQuestionCount("Give me three Amazon questions"), 3);
  assert.equal(extractQuestionCount("Show me some Amazon medium questions"), 5);
  assert.equal(extractQuestionCount("List Amazon questions"), 5);
});

await runTest("formatCatalogQuestionsResponse formats single question cleanly without raw debug fields or lengthy disclaimer", () => {
  const mockCatalogResult = {
    company: "Amazon",
    questions: [
      {
        id: "amazon-p1",
        title: "LRU Cache",
        problemSlug: "lru-cache",
        url: "https://leetcode.com/problems/lru-cache/",
        company: "Amazon",
        difficulty: "Medium",
        topics: ["Hash Table", "Linked List", "Design"],
        frequency: 89.6,
        frequencyFormatted: "89.6%",
        recency: "thirty-days",
        recencyLabel: "Past 30 Days",
      },
    ],
    totalMatched: 1,
    disclaimer: COMPANY_CATALOG_DISCLAIMER,
  };

  const responseText = formatCatalogQuestionsResponse("Amazon", "Medium", mockCatalogResult, true);

  // Must preserve exact canonical URLs as clean markdown links
  assert.ok(responseText.includes("[LRU Cache](https://leetcode.com/problems/lru-cache/)"));

  // Must NOT contain malformed nested bold links
  assert.ok(!responseText.includes("**[LRU Cache]"));

  // Must NOT contain raw database debug fields
  assert.ok(!responseText.includes("- Slug:"));
  assert.ok(!responseText.includes("- Frequency:"));
  assert.ok(!responseText.includes("- Recency:"));

  // Must contain concise attribution separate from main response
  assert.ok(responseText.includes("(Source: Community LeetCode catalog • Not an official Amazon endorsement)"));

  // Must NOT dump the lengthy 2-sentence disclaimer paragraph
  assert.ok(!responseText.includes("Frequency and recency metrics are historical estimates"));

  // Must clearly explain Arena loading limitations and offer AI practice problem
  assert.ok(responseText.toLowerCase().includes("reference leetcode question"));
  assert.ok(responseText.toLowerCase().includes("cannot be loaded directly into the dsa arena"));
  assert.ok(responseText.toLowerCase().includes("ai practice problem"));

  // Must NEVER contain fabricated synthetic titles like "Equilibrium Subarray Peaks"
  assert.ok(!responseText.includes("Equilibrium Subarray Peaks"));
});

await runTest("formatCatalogQuestionsResponse formats multi-question list with clean links and concise attribution", () => {
  const mockCatalogResult = {
    company: "Amazon",
    questions: [
      {
        id: "amazon-p1",
        title: "LRU Cache",
        problemSlug: "lru-cache",
        url: "https://leetcode.com/problems/lru-cache/",
        company: "Amazon",
        difficulty: "Medium",
        topics: ["Hash Table", "Linked List"],
      },
      {
        id: "amazon-p2",
        title: "Longest Substring Without Repeating Characters",
        problemSlug: "longest-substring-without-repeating-characters",
        url: "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
        company: "Amazon",
        difficulty: "Medium",
        topics: ["Hash Table", "String"],
      },
    ],
    totalMatched: 2,
    disclaimer: COMPANY_CATALOG_DISCLAIMER,
  };

  const responseText = formatCatalogQuestionsResponse("Amazon", "Medium", mockCatalogResult, false);

  // Must list both questions as clean markdown links
  assert.ok(responseText.includes("[LRU Cache](https://leetcode.com/problems/lru-cache/)"));
  assert.ok(responseText.includes("[Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/)"));

  // Must NOT have malformed nested bold links
  assert.ok(!responseText.includes("**[LRU Cache]"));

  // Must NOT have debug fields
  assert.ok(!responseText.includes("- Slug:"));

  // Must contain concise attribution
  assert.ok(responseText.includes("(Source: Community LeetCode catalog • Not an official Amazon endorsement)"));

  // Must explain Arena limitations
  assert.ok(responseText.toLowerCase().includes("reference leetcode questions"));
  assert.ok(responseText.toLowerCase().includes("cannot be loaded as runnable arena problems"));
});

await runTest("formatCatalogMissResponse explicitly states catalog has no matching results and offers separately labelled AI practice problem", () => {
  const missResponse = formatCatalogMissResponse("Amazon", "Hard", "Trie");

  // Must explicitly report no matching results in catalog
  assert.ok(missResponse.toLowerCase().includes("found no matching **hard trie** questions for **amazon** in the database"));

  // Must explicitly ask whether the user wants a separately labelled AI-generated practice problem
  assert.ok(missResponse.toLowerCase().includes("separately labelled, original ai practice problem"));

  // Must mention available popular companies
  assert.ok(missResponse.includes("Amazon") && missResponse.includes("Google") && missResponse.includes("Meta"));

  // Must NOT invent synthetic problem titles
  assert.ok(!missResponse.includes("Equilibrium Subarray Peaks"));
});

await runTest("sanitizeAiProblemConfirmation prevents false retrieval claims and enforces explicit AI-generated label", () => {
  const result = {
    problem: { title: "Equilibrium Subarray Peaks" },
    difficulty: "Medium",
    topic: "Arrays",
  };

  // Case 1: AI response attempts to claim it retrieved the question from Amazon's catalog
  const misleadingClaim = "I have retrieved this verified Amazon interview question from our catalog: Equilibrium Subarray Peaks.";
  const sanitized = sanitizeAiProblemConfirmation(misleadingClaim, result, "Amazon");

  assert.ok(!sanitized.includes("retrieved this verified Amazon interview question from our catalog"));
  assert.ok(sanitized.toLowerCase().includes("not retrieved from catalog") || sanitized.toLowerCase().includes("not a verified question"));
  assert.ok(sanitized.includes("[AI-Generated Practice Problem]") || sanitized.toLowerCase().includes("ai-generated practice"));
  assert.ok(sanitized.includes("Note: This is an original AI practice problem modeled after Amazon interview topics"));

  // Case 2: Clean confirmation missing the explicit AI label
  const plainConfirmation = "I've loaded a Medium Arrays problem into your DSA Arena.";
  const labeled = sanitizeAiProblemConfirmation(plainConfirmation, result, null);
  assert.ok(labeled.includes("[AI-Generated Practice Problem]"));
});

await runTest("coachChat unauthenticated rejection preserves security contract", async () => {
  const req = {
    body: { message: "Give me an Amazon medium-level DSA question." },
    user: null,
  };
  const res = {
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

  await coachChat(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.jsonData?.message, "Authentication required. Please sign in.");
});

console.log("\n=================================================");
console.log(`  RESULTS: ${passedTests} / ${totalTests} TESTS PASSED  `);
console.log("=================================================\n");

if (passedTests < totalTests) {
  process.exit(1);
}
