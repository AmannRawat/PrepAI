import crypto from "crypto";

// Server-side in-memory cache for generated problem test cases.
// Maps problem ID -> { fullTestCases, visibleTestCases, createdAt }
const problemCache = new Map();
export const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_CACHE_SIZE = 1000;

// Periodic cleanup of stale cache entries
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of problemCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      problemCache.delete(id);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Validates and retrieves the dedicated test case encryption key.
 * Fails closed if missing or insecure. Never displays or logs the key.
 */

export function getEncryptionKey() {
  const key = process.env.TEST_CASE_ENCRYPTION_KEY;

  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "TEST_CASE_ENCRYPTION_KEY must be exactly 64 hexadecimal characters."
    );
  }

  return Buffer.from(key, "hex");
}

/**
 * Encrypts hidden test cases bound to the server-generated problem ID
 * using AES-256-GCM authenticated encryption.
 */
export function encryptHiddenTestCases(problemId, hiddenTestCases, visibleTestCases = []) {
  if (!problemId || typeof problemId !== "string") {
    throw new Error("A valid problem ID is required for test-case encryption.");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  // Bind problemId as Additional Authenticated Data (AAD)
  cipher.setAAD(Buffer.from(problemId, "utf8"));

  const payload = JSON.stringify({
    problemId,
    createdAt: Date.now(),
    hiddenTestCases: Array.isArray(hiddenTestCases) ? hiddenTestCases : [],
    visibleTestCases: Array.isArray(visibleTestCases) ? visibleTestCases : [],
  });

  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/**
 * Decrypts and authenticates the execution token, verifying:
 * 1. AES-256-GCM authentication tag matches (no tampering)
 * 2. Additional Authenticated Data matches expectedProblemId
 * 3. Payload problemId matches expectedProblemId
 * 4. Token has not expired
 */
export function decryptExecutionToken(token, expectedProblemId) {
  if (!token || typeof token !== "string") {
    throw new Error("Missing or invalid execution token.");
  }

  if (!expectedProblemId || typeof expectedProblemId !== "string") {
    throw new Error("A valid problem ID is required to decrypt test cases.");
  }

  let buffer;
  try {
    buffer = Buffer.from(token, "base64url");
  } catch {
    throw new Error("Malformed execution token encoding.");
  }

  if (buffer.length < 29) {
    // 12 bytes IV + 16 bytes Tag + at least 1 byte ciphertext
    throw new Error("Invalid execution token length.");
  }

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  // Authenticate against expectedProblemId
  decipher.setAAD(Buffer.from(expectedProblemId, "utf8"));
  decipher.setAuthTag(tag);

  let decrypted;
  try {
    decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
  } catch {
    throw new Error(
      "Invalid, tampered, or mismatched execution token."
    );
  }

  let payload;
  try {
    payload = JSON.parse(decrypted.toString("utf8"));
  } catch {
    throw new Error("Malformed payload inside execution token.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload format in execution token.");
  }

  if (payload.problemId !== expectedProblemId) {
    throw new Error("Problem ID mismatch in execution token.");
  }

  if (typeof payload.createdAt === "number" && Date.now() - payload.createdAt > CACHE_TTL_MS) {
    throw new Error("Execution token has expired. Please generate a new problem.");
  }

  return payload;
}

/**
 * Cache lookup with strict expiration check at query time.
 */
export function getFromCache(problemId) {
  if (!problemId || !problemCache.has(problemId)) {
    return null;
  }

  const entry = problemCache.get(problemId);
  if (!entry) return null;

  // Enforce cache expiry during lookup
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    problemCache.delete(problemId);
    return null;
  }

  return entry;
}

/**
 * Stores test cases in memory cache.
 */
export function setInCache(problemId, fullTestCases, visibleTestCases = []) {
  if (problemCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = problemCache.keys().next().value;
    if (oldestKey) problemCache.delete(oldestKey);
  }

  problemCache.set(problemId, {
    fullTestCases,
    visibleTestCases,
    createdAt: Date.now(),
  });
}

/**
 * Testing helper to manipulate or clear cache.
 */
export function clearCacheForTesting() {
  problemCache.clear();
}

/**
 * Stores full test cases in server memory and returns a client-safe problem object
 * where hidden test cases have their inputs and expected outputs completely stripped.
 */
export function sanitizeProblemForClient(problem) {
  if (!problem || !Array.isArray(problem.testCases)) {
    return problem;
  }

  const problemId =
    problem.id || problem.problemId || problem._id || crypto.randomUUID();

  const visibleCases = problem.testCases.filter((tc) => !tc.isHidden);
  const hiddenCases = problem.testCases.filter((tc) => tc.isHidden);

  // Store complete test cases in server cache
  setInCache(problemId, problem.testCases, visibleCases);

  // Bind encrypted hidden test cases to problemId
  const executionToken = encryptHiddenTestCases(
    problemId,
    hiddenCases,
    visibleCases
  );

  // Client gets visible test cases in full, but hidden cases are completely redacted
  const sanitizedTestCases = problem.testCases.map((tc, index) => {
    if (tc.isHidden) {
      return {
        id: index,
        isHidden: true,
      };
    }

    return {
      id: index,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isHidden: false,
    };
  });

  return {
    ...problem,
    id: problemId,
    problemId,
    testCases: sanitizedTestCases,
    executionToken,
  };
}

/**
 * Authoritatively resolves test cases for execution.
 * 1. Checks server-side cache (with lookup-time expiry).
 * 2. Fallbacks to decrypting executionToken bound to problem.id.
 * 3. NEVER trusts client-supplied test cases. Fails closed if unverified.
 */
export function resolveAuthoritativeTestCases(
  problem,
  { visibleOnly = false } = {}
) {
  if (!problem || typeof problem !== "object") {
    throw new Error(
      "A valid problem ID is required to resolve authoritative test cases."
    );
  }

  const problemId = problem.id || problem.problemId || problem._id;
  if (!problemId || typeof problemId !== "string" || !problemId.trim()) {
    throw new Error(
      "A valid problem ID is required to resolve authoritative test cases."
    );
  }

  // Ensure canonical id fields are set
  problem.id = problemId;
  problem.problemId = problemId;

  // 1. Try server-side cache with lookup-time expiry check
  const cached = getFromCache(problemId);
  if (cached && Array.isArray(cached.fullTestCases)) {
    if (visibleOnly) {
      return Array.isArray(cached.visibleTestCases) && cached.visibleTestCases.length > 0
        ? cached.visibleTestCases
        : cached.fullTestCases.filter((tc) => !tc.isHidden);
    }
    return cached.fullTestCases;
  }

  // 2. Try decrypting executionToken bound to problem.id
  if (problem.executionToken && typeof problem.executionToken === "string") {
    const payload = decryptExecutionToken(problem.executionToken, problem.id);

    const authoritativeVisible = Array.isArray(payload.visibleTestCases)
      ? payload.visibleTestCases
      : [];
    const authoritativeHidden = Array.isArray(payload.hiddenTestCases)
      ? payload.hiddenTestCases
      : [];

    if (visibleOnly) {
      if (authoritativeVisible.length > 0) {
        return authoritativeVisible;
      }
      throw new Error(
        "No authoritative sample test cases found in execution token."
      );
    }

    const reconstructed = [...authoritativeVisible, ...authoritativeHidden];
    if (reconstructed.length > 0) {
      return reconstructed;
    }
  }

  // 3. FAIL CLOSED: Never trust arbitrary client-supplied test cases
  throw new Error(
    "Authoritative test cases could not be verified. Please regenerate the problem."
  );
}
