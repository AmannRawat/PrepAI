import "dotenv/config";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import CompanyQuestion from "../models/CompanyQuestion.model.js";
import CatalogSyncLog from "../models/CatalogSyncLog.model.js";
import { parseCSV } from "../utils/csvParser.js";
import { configureMongoDns } from "../utils/dnsConfig.js";
import {
  normalizeCompanyName,
  normalizeProblemUrl,
  normalizeDifficulty,
  normalizeRecency,
  normalizeFrequency,
  normalizeAcceptanceRate,
  normalizeTopics,
} from "../utils/companyNormalizer.js";

// Apply optional custom DNS resolver if MONGODB_DNS_SERVERS is configured in environment
configureMongoDns();

const REPOS = {
  snehasishroy: {
    id: "snehasishroy",
    name: "snehasishroy/leetcode-companywise-interview-questions",
    gitUrl:
      "https://github.com/snehasishroy/leetcode-companywise-interview-questions.git",
    defaultBranch: "master",
  },
  liquidslr: {
    id: "liquidslr",
    name: "liquidslr/leetcode-company-wise-problems",
    gitUrl: "https://github.com/liquidslr/leetcode-company-wise-problems.git",
    defaultBranch: "main",
  },
};

/**
 * Sanitizes a MongoDB connection URI to mask credentials in logs.
 */
export function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== "string") return "(not set)";
  return uri.replace(
    /(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/,
    "$1****$3"
  );
}

/**
 * Clones a Git repository using a shallow clone (--depth 1) into a temporary folder.
 * Returns { tempDir, commitSha, branch }.
 */
export function cloneRepoShallow(gitUrl, branch = "main") {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepai-sync-"));
  console.log(`Cloning ${gitUrl} (branch: ${branch}) into temporary folder...`);

  try {
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--branch", branch, gitUrl, tempDir],
      { stdio: "pipe" }
    );
  } catch {
    // If specific branch failed, attempt clone without branch flag (falls back to remote default)
    execFileSync("git", ["clone", "--depth", "1", gitUrl, tempDir], {
      stdio: "pipe",
    });
  }

  let commitSha = "HEAD";
  try {
    commitSha = execFileSync(
      "git",
      ["-C", tempDir, "rev-parse", "--short", "HEAD"],
      { encoding: "utf8" }
    ).trim();
  } catch (err) {
    console.warn("Could not determine commit hash:", err.message);
  }

  return { tempDir, commitSha };
}

/**
 * Processes a single CSV file from snehasishroy repository.
 * Directory structure: <company>/<timeframe>.csv
 * Headers: ID,URL,Title,Difficulty,Acceptance %,Frequency %
 */
export function parseSnehasishroyFile(filePath, companyDirName) {
  const records = [];
  const content = fs.readFileSync(filePath, "utf8");
  const rawRows = parseCSV(content);

  const filename = path.basename(filePath);
  const { recency, recencyScore } = normalizeRecency(filename);
  const company = normalizeCompanyName(companyDirName);

  if (!company) return records;

  for (const row of rawRows) {
    const rawUrl = row.URL || row.url || row.Link || row.link;
    const { slug, url } = normalizeProblemUrl(rawUrl);
    const title = (row.Title || row.title || "").trim();

    if (!slug || !url || !title) {
      continue;
    }

    const difficulty = normalizeDifficulty(row.Difficulty || row.difficulty);
    const frequency = normalizeFrequency(
      row["Frequency %"] || row.Frequency || row.frequency
    );
    const acceptanceRate = normalizeAcceptanceRate(
      row["Acceptance %"] || row["Acceptance Rate"] || row.acceptance
    );

    records.push({
      problemSlug: slug,
      title,
      url,
      company,
      difficulty,
      topics: [],
      frequency,
      acceptanceRate,
      recency,
      recencyScore,
      source: "snehasishroy",
    });
  }

  return records;
}

/**
 * Processes a single CSV file from liquidslr repository.
 * Directory structure: <Company>/<N. Timeframe>.csv
 * Headers: Difficulty,Title,Frequency,Acceptance Rate,Link,Topics
 */
export function parseLiquidslrFile(filePath, companyDirName) {
  const records = [];
  const content = fs.readFileSync(filePath, "utf8");
  const rawRows = parseCSV(content);

  const filename = path.basename(filePath);
  const { recency, recencyScore } = normalizeRecency(filename);
  const company = normalizeCompanyName(companyDirName);

  if (!company) return records;

  for (const row of rawRows) {
    const rawUrl = row.Link || row.link || row.URL || row.url;
    const { slug, url } = normalizeProblemUrl(rawUrl);
    const title = (row.Title || row.title || "").trim();

    if (!slug || !url || !title) {
      continue;
    }

    const difficulty = normalizeDifficulty(row.Difficulty || row.difficulty);
    const frequency = normalizeFrequency(row.Frequency || row.frequency);
    const acceptanceRate = normalizeAcceptanceRate(
      row["Acceptance Rate"] || row.acceptance
    );
    const topics = normalizeTopics(row.Topics || row.topics);

    records.push({
      problemSlug: slug,
      title,
      url,
      company,
      difficulty,
      topics,
      frequency,
      acceptanceRate,
      recency,
      recencyScore,
      source: "liquidslr",
    });
  }

  return records;
}

/**
 * Scans a repository directory tree and parses all company CSV files.
 */
export function scanRepoDirectory(rootDir, sourceId) {
  const allRecords = [];
  let filesScanned = 0;

  if (!fs.existsSync(rootDir)) {
    console.warn(`Directory not found: ${rootDir}`);
    return { records: [], filesScanned: 0 };
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const companyDir = path.join(rootDir, entry.name);
    let files = [];
    try {
      files = fs.readdirSync(companyDir);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.toLowerCase().endsWith(".csv")) continue;
      filesScanned++;

      const filePath = path.join(companyDir, file);
      try {
        if (sourceId === "snehasishroy") {
          const parsed = parseSnehasishroyFile(filePath, entry.name);
          allRecords.push(...parsed);
        } else if (sourceId === "liquidslr") {
          const parsed = parseLiquidslrFile(filePath, entry.name);
          allRecords.push(...parsed);
        }
      } catch (err) {
        console.warn(`Error reading ${filePath}:`, err.message);
      }
    }
  }

  return { records: allRecords, filesScanned };
}

/**
 * Deduplicates in-memory parsed records by (problemSlug, company) pair,
 * merging topics, highest frequency, most recent timeframe, and provenance.
 */
export function aggregateRecords(records) {
  const map = new Map();

  for (const item of records) {
    const key = `${item.problemSlug}::${item.company}`;
    if (!map.has(key)) {
      map.set(key, {
        problemSlug: item.problemSlug,
        title: item.title,
        url: item.url,
        company: item.company,
        difficulty: item.difficulty,
        topics: [...(item.topics || [])],
        frequency: item.frequency || 0,
        acceptanceRate: item.acceptanceRate || 0,
        recency: item.recency,
        recencyScore: item.recencyScore,
        sources: [item.source],
        sourceProvenance: [
          {
            source: item.source,
            timeframe: item.recency,
            frequency: item.frequency || 0,
            syncedAt: new Date(),
          },
        ],
      });
    } else {
      const existing = map.get(key);

      // Merge topics
      for (const t of item.topics || []) {
        if (!existing.topics.includes(t)) {
          existing.topics.push(t);
        }
      }

      // Max frequency
      if ((item.frequency || 0) > existing.frequency) {
        existing.frequency = item.frequency;
      }

      // Most recent timeframe wins
      if (item.recencyScore < existing.recencyScore) {
        existing.recency = item.recency;
        existing.recencyScore = item.recencyScore;
      }

      // Union of sources
      if (!existing.sources.includes(item.source)) {
        existing.sources.push(item.source);
      }

      // Append provenance
      existing.sourceProvenance.push({
        source: item.source,
        timeframe: item.recency,
        frequency: item.frequency || 0,
        syncedAt: new Date(),
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Main catalog sync execution.
 */
export async function runCatalogSync(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const syncId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date();

  console.log("==================================================");
  console.log(`  PREPAI DSA COMPANY QUESTION CATALOG SYNC       `);
  console.log(`  Sync ID: ${syncId} (dry-run: ${dryRun})        `);
  console.log("==================================================");

  const cleanupPaths = [];
  const sourceSnapshots = [];
  const metrics = {
    imported: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    totalProcessed: 0,
    totalInCatalog: 0,
  };

  let dbConnected = false;

  try {
    // 1. Fetch or resolve repo paths
    const rawParsedRecords = [];

    for (const [sourceKey, config] of Object.entries(REPOS)) {
      let repoPath = options[`${sourceKey}Path`];
      let commitSha = "local";

      if (!repoPath) {
        try {
          const cloneResult = cloneRepoShallow(
            config.gitUrl,
            config.defaultBranch
          );
          repoPath = cloneResult.tempDir;
          commitSha = cloneResult.commitSha;
          cleanupPaths.push(cloneResult.tempDir);
        } catch (cloneErr) {
          console.error(
            `Failed to clone ${config.name}: ${cloneErr.message}`
          );
          sourceSnapshots.push({
            source: config.id,
            repo: config.name,
            commitSha: "FAILED",
            branch: config.defaultBranch,
            status: `Clone failed: ${cloneErr.message}`,
            filesScanned: 0,
            recordsParsed: 0,
          });
          continue;
        }
      }

      console.log(`Scanning ${config.name} at ${repoPath}...`);
      const scanResult = scanRepoDirectory(repoPath, config.id);
      console.log(
        `Scanned ${scanResult.filesScanned} CSV files, parsed ${scanResult.records.length} records from ${config.id}.`
      );

      sourceSnapshots.push({
        source: config.id,
        repo: config.name,
        commitSha,
        branch: config.defaultBranch,
        status: "success",
        filesScanned: scanResult.filesScanned,
        recordsParsed: scanResult.records.length,
      });

      rawParsedRecords.push(...scanResult.records);
    }

    metrics.totalProcessed = rawParsedRecords.length;

    // 2. In-memory aggregation and deduplication
    console.log("Aggregating and deduplicating records...");
    const aggregated = aggregateRecords(rawParsedRecords);
    console.log(`Aggregated into ${aggregated.length} unique company-problem pairs.`);

    if (dryRun) {
      console.log("[DRY RUN] Skipping database writes.");
      metrics.imported = aggregated.length;
      return {
        success: true,
        dryRun: true,
        metrics,
        sourceSnapshots,
      };
    }

    // 3. Connect to MongoDB Atlas
    const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!mongoUri) {
      throw new Error(
        "Missing database connection string. Please configure MONGODB_URI or DATABASE_URL."
      );
    }

    // Configure optional custom DNS resolver before MongoDB driver performs SRV lookup
    configureMongoDns(options.dnsServers || process.env.MONGODB_DNS_SERVERS);
    console.log(`[DNS Diagnostic] Active DNS servers: [${dns.getServers().join(", ")}]`);

    console.log(`Connecting to MongoDB at ${sanitizeMongoUri(mongoUri)}...`);
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUri);
      dbConnected = true;
    }
    console.log("Connected to MongoDB successfully.");

    // Create sync log
    const syncLog = new CatalogSyncLog({
      syncId,
      startedAt,
      status: "in_progress",
      sourceSnapshots,
    });
    await syncLog.save();

    // 4. Batch upsert into MongoDB
    console.log("Persisting catalog to MongoDB Atlas...");
    const BATCH_SIZE = 500;

    for (let i = 0; i < aggregated.length; i += BATCH_SIZE) {
      const batch = aggregated.slice(i, i + BATCH_SIZE);
      const operations = batch.map((item) => ({
        updateOne: {
          filter: {
            problemSlug: item.problemSlug,
            company: item.company,
          },
          update: {
            $set: {
              title: item.title,
              url: item.url,
              difficulty: item.difficulty,
              frequency: item.frequency,
              acceptanceRate: item.acceptanceRate,
              recency: item.recency,
              recencyScore: item.recencyScore,
              lastSyncedAt: new Date(),
            },
            $addToSet: {
              topics: { $each: item.topics || [] },
              sources: { $each: item.sources || [] },
              sourceProvenance: { $each: item.sourceProvenance || [] },
            },
          },
          upsert: true,
        },
      }));

      try {
        const result = await CompanyQuestion.bulkWrite(operations, {
          ordered: false,
        });
        metrics.imported += result.upsertedCount || 0;
        metrics.updated += result.modifiedCount || 0;
        metrics.unchanged += (result.matchedCount || 0) - (result.modifiedCount || 0);
      } catch (writeErr) {
        console.error("Batch write encountered errors:", writeErr.message);
        metrics.failed += batch.length;
      }
    }

    metrics.totalInCatalog = await CompanyQuestion.countDocuments();
    const completedAt = new Date();

    syncLog.completedAt = completedAt;
    syncLog.status = metrics.failed === 0 ? "success" : "partial";
    syncLog.metrics = metrics;
    await syncLog.save();

    console.log("==================================================");
    console.log("  CATALOG SYNC COMPLETE                           ");
    console.log(`  Imported New:   ${metrics.imported}`);
    console.log(`  Updated:        ${metrics.updated}`);
    console.log(`  Unchanged:      ${metrics.unchanged}`);
    console.log(`  Failed:         ${metrics.failed}`);
    console.log(`  Total Catalog:  ${metrics.totalInCatalog}`);
    console.log("==================================================");

    return {
      success: true,
      syncId,
      metrics,
      sourceSnapshots,
    };
  } catch (err) {
    console.error("Catalog sync failed:", err.message);
    try {
      await CatalogSyncLog.findOneAndUpdate(
        { syncId },
        {
          completedAt: new Date(),
          status: "failed",
          errorMessage: err.message,
          metrics,
        },
        { upsert: true }
      );
    } catch {
      // Ignore secondary error
    }
    throw err;
  } finally {
    // Clean up temporary clone directories
    for (const dir of cleanupPaths) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }

    if (dbConnected && !options.keepDbOpen) {
      await mongoose.disconnect();
    }
  }
}

// CLI runner
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const isDryRun = process.argv.includes("--dry-run");
  runCatalogSync({ dryRun: isDryRun })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
