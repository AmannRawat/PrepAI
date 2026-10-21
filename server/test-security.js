import "dotenv/config";
import {
  getEncryptionKey,
  encryptHiddenTestCases,
  decryptExecutionToken,
  sanitizeProblemForClient,
  resolveAuthoritativeTestCases,
  setInCache,
  getFromCache,
  clearCacheForTesting,
  CACHE_TTL_MS,
} from "./utils/testCaseSecurity.js";
import { executeCode } from "./services/codeExecution.service.js";

async function runSecurityTests() {
  console.log("=================================================");
  console.log("  PREPAI DSA TEST-CASE SECURITY VERIFICATION     ");
  console.log("=================================================\n");

  let total = 0;
  let passed = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${testName}`);
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  // Preserve initial key state in-memory without logging or exposing values
  const originalKey = process.env.TEST_CASE_ENCRYPTION_KEY;

  try {
    // ----------------------------------------------------
    // Scenario 1: Missing Configuration Fails Closed
    // ----------------------------------------------------
    console.log("--- Scenario 1: Missing Configuration ---");
    delete process.env.TEST_CASE_ENCRYPTION_KEY;

    let missingKeyError = null;
    try {
      getEncryptionKey();
    } catch (err) {
      missingKeyError = err.message;
    }
    assert(
      missingKeyError ===
        "TEST_CASE_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.",
      "Throws clear error when TEST_CASE_ENCRYPTION_KEY is missing"
    );

    let sanitizeMissingError = null;
    try {
      sanitizeProblemForClient({
        id: "prob-missing-key",
        testCases: [{ input: { x: 1 }, expectedOutput: 2, isHidden: true }],
      });
    } catch (err) {
      sanitizeMissingError = err.message;
    }
    assert(
      sanitizeMissingError ===
        "TEST_CASE_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.",
      "sanitizeProblemForClient fails closed when encryption key is unconfigured"
    );

    // ----------------------------------------------------
    // Scenario 2: Insecure / Non-Hex Key Fails Closed
    // ----------------------------------------------------
    console.log("\n--- Scenario 2: Non-Hex / Insecure Key ---");
    process.env.TEST_CASE_ENCRYPTION_KEY = "short-key-12345"; // Not 64 hex chars

    let shortKeyError = null;
    try {
      getEncryptionKey();
    } catch (err) {
      shortKeyError = err.message;
    }
    assert(
      shortKeyError ===
        "TEST_CASE_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.",
      "Throws error when TEST_CASE_ENCRYPTION_KEY is not 64 hex characters"
    );

    // Now set a dedicated valid in-memory test key (64 hex characters) for the remaining security tests
    process.env.TEST_CASE_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    // ----------------------------------------------------
    // Scenario 3: Invalid & Tampered Tokens Rejected
    // ----------------------------------------------------
    console.log("\n--- Scenario 3: Invalid & Tampered Tokens ---");
    clearCacheForTesting();

    let invalidTokenError = null;
    try {
      decryptExecutionToken("totally-invalid-token", "prob-1");
    } catch (err) {
      invalidTokenError = err.message;
    }
    assert(
      invalidTokenError !== null,
      "Rejects completely malformed/invalid tokens"
    );

    // Generate a valid token then tamper with its ciphertext
    const problemId = "prob-security-test-1";
    const hiddenCases = [
      { input: { a: 1 }, expectedOutput: 2, isHidden: true },
    ];
    const visibleCases = [
      { input: { a: 0 }, expectedOutput: 0, isHidden: false },
    ];

    const validToken = encryptHiddenTestCases(
      problemId,
      hiddenCases,
      visibleCases
    );

    // Flip bytes in the token to simulate tampering
    const tokenBuffer = Buffer.from(validToken, "base64url");
    tokenBuffer[tokenBuffer.length - 2] ^= 0xff; // corrupt ciphertext byte
    const tamperedToken = tokenBuffer.toString("base64url");

    let tamperedError = null;
    try {
      decryptExecutionToken(tamperedToken, problemId);
    } catch (err) {
      tamperedError = err.message;
    }
    assert(
      tamperedError === "Invalid, tampered, or mismatched execution token.",
      "AES-256-GCM authentication tag verification rejects tampered token"
    );

    // ----------------------------------------------------
    // Scenario 4: Problem-ID Mismatch Rejected
    // ----------------------------------------------------
    console.log("\n--- Scenario 4: Problem-ID Mismatch ---");
    let mismatchError = null;
    try {
      // Attempt to decrypt token generated for prob-security-test-1 using prob-security-test-2
      decryptExecutionToken(validToken, "prob-security-test-2");
    } catch (err) {
      mismatchError = err.message;
    }
    assert(
      mismatchError === "Invalid, tampered, or mismatched execution token.",
      "Authenticated encryption AAD binding rejects problem-ID mismatch"
    );

    // ----------------------------------------------------
    // Scenario 5: Cache Expiry Enforced During Lookup
    // ----------------------------------------------------
    console.log("\n--- Scenario 5: Cache Expiry During Lookup ---");
    clearCacheForTesting();

    const expiredProblemId = "prob-expired-test";
    setInCache(expiredProblemId, [...visibleCases, ...hiddenCases], visibleCases);

    // Backdate the cache entry past CACHE_TTL_MS
    const cachedEntry = getFromCache(expiredProblemId);
    assert(cachedEntry !== null, "Cache entry initially exists");
    cachedEntry.createdAt = Date.now() - (CACHE_TTL_MS + 5000);

    // Lookup should now detect expiration and evict
    const lookupAfterExpiry = getFromCache(expiredProblemId);
    assert(
      lookupAfterExpiry === null,
      "Lookup enforces expiration, evicts stale entry, and returns null"
    );

    // ----------------------------------------------------
    // Scenario 6: Client-Side Test-Case Tampering Ignored
    // ----------------------------------------------------
    console.log("\n--- Scenario 6: Client-Side Test-Case Tampering ---");
    clearCacheForTesting();

    const authoritativeProblem = {
      id: "prob-auth-test-99",
      title: "Authoritative Problem",
      testCases: [
        { input: { nums: [1, 2] }, expectedOutput: 3, isHidden: false },
        { input: { nums: [99, 1] }, expectedOutput: 100, isHidden: true },
      ],
    };

    const clientSafe = sanitizeProblemForClient(authoritativeProblem);

    // Client maliciously tampers with visible test case and attempts to inject fake tests
    const tamperedClientProblem = {
      ...clientSafe,
      testCases: [
        { input: { nums: [0, 0] }, expectedOutput: 9999, isHidden: false }, // tampered!
        { input: { nums: [1, 1] }, expectedOutput: 2, isHidden: false }, // injected!
      ],
    };

    // Server-side authoritative resolution must ignore tampered client test cases
    const resolvedFromCache = resolveAuthoritativeTestCases(
      tamperedClientProblem,
      { visibleOnly: false }
    );
    assert(
      resolvedFromCache.length === 2,
      "Authoritative resolution ignored client-injected test count"
    );
    assert(
      resolvedFromCache[0].expectedOutput === 3,
      "Authoritative resolution preserved genuine server expected output (3), ignoring client tampering (9999)"
    );

    // Even if server cache is cleared (simulating restart), token resolution restores authoritative tests
    clearCacheForTesting();
    const resolvedFromToken = resolveAuthoritativeTestCases(
      tamperedClientProblem,
      { visibleOnly: false }
    );
    assert(
      resolvedFromToken[0].expectedOutput === 3,
      "Token-based recovery restores genuine server test (3), ignoring client tampering"
    );
    assert(
      resolvedFromToken[1].expectedOutput === 100 && resolvedFromToken[1].isHidden === true,
      "Token-based recovery restores hidden test (100) securely"
    );

    // Client attempts to call with non-existent problem ID and no token
    let fakeProblemError = null;
    try {
      resolveAuthoritativeTestCases({ id: "fake-unregistered-id" });
    } catch (err) {
      fakeProblemError = err.message;
    }
    assert(
      fakeProblemError ===
        "Authoritative test cases could not be verified. Please regenerate the problem.",
      "Fails closed when client passes unverified problem without valid server state or token"
    );

    // ----------------------------------------------------
    // Scenario 7: Hidden-Result Redaction
    // ----------------------------------------------------
    console.log("\n--- Scenario 7: Hidden-Result Redaction ---");
    const executionCases = [
      { input: { nums: [1, 3, 2, 4, 1] }, expectedOutput: [3, 1, 4, 2, 1], isHidden: false },
      { input: { nums: [5, 5, 5] }, expectedOutput: [5, 5, 5], isHidden: true },
    ];

    const jsCode = `
function shiftPeakElements(nums) {
  const result = [...nums];
  const peaks = [];
  for (let i = 1; i < nums.length - 1; i++) {
    if (nums[i] > nums[i - 1] && nums[i] > nums[i + 1]) peaks.push(i);
  }
  for (let j = peaks.length - 1; j >= 0; j--) {
    const i = peaks[j];
    [result[i - 1], result[i]] = [result[i], result[i - 1]];
  }
  return result;
}
`;

    const execResult = await executeCode({
      code: jsCode,
      language: "javascript",
      testCases: executionCases,
      isRunCode: false,
    });

    const visibleRes = execResult.testResults[0];
    const hiddenRes = execResult.testResults[1];

    assert(
      visibleRes.isHidden === false &&
        visibleRes.input !== undefined &&
        visibleRes.expected !== undefined &&
        visibleRes.actual !== undefined,
      "Visible test result retains input, expected, and actual for candidate review"
    );

    assert(
      hiddenRes.isHidden === true &&
        hiddenRes.input === undefined &&
        hiddenRes.expected === undefined &&
        hiddenRes.actual === undefined,
      "Hidden test result strictly redacts input, expected, and actual"
    );

    // ----------------------------------------------------
    // Scenario 8: Problem ID Agreement & Restoration
    // ----------------------------------------------------
    console.log("\n--- Scenario 8: Problem ID Agreement & Restoration ---");
    clearCacheForTesting();

    // 8a: Completely missing problem ID fails closed
    let missingIdErr = null;
    try {
      resolveAuthoritativeTestCases({ title: "No ID Problem" });
    } catch (e) {
      missingIdErr = e.message;
    }
    assert(
      missingIdErr === "A valid problem ID is required to resolve authoritative test cases.",
      "Throws expected error when problem ID is completely missing"
    );

    // 8b: Generated problem receives stable id and problemId
    const baseProblem = {
      title: "Problem ID Test",
      testCases: [
        { input: { x: 1 }, expectedOutput: 2, isHidden: false },
        { input: { x: 5 }, expectedOutput: 10, isHidden: true },
      ],
    };
    const sanitized = sanitizeProblemForClient(baseProblem);
    assert(
      typeof sanitized.id === "string" && sanitized.id === sanitized.problemId,
      "Generated problem receives stable and identical id and problemId fields"
    );

    // 8c: Resolves when caller provides problem.id
    const resolvedViaId = resolveAuthoritativeTestCases(
      { id: sanitized.id, executionToken: sanitized.executionToken },
      { visibleOnly: true }
    );
    assert(
      resolvedViaId.length === 1 && resolvedViaId[0].expectedOutput === 2,
      "Resolves visible test cases when problem.id is supplied"
    );

    // 8d: Resolves when caller provides problem.problemId
    const resolvedViaProblemId = resolveAuthoritativeTestCases(
      { problemId: sanitized.id, executionToken: sanitized.executionToken },
      { visibleOnly: true }
    );
    assert(
      resolvedViaProblemId.length === 1 && resolvedViaProblemId[0].expectedOutput === 2,
      "Resolves visible test cases when problem.problemId is supplied"
    );

    // 8e: Resolves when caller provides problem._id (MongoDB style)
    const resolvedViaUnderscoreId = resolveAuthoritativeTestCases(
      { _id: sanitized.id, executionToken: sanitized.executionToken },
      { visibleOnly: false }
    );
    assert(
      resolvedViaUnderscoreId.length === 2,
      "Resolves full test cases when problem._id is supplied"
    );

    // 8f: Restored problem simulation (cache cleared, verified via token)
    clearCacheForTesting();
    const restoredProblem = {
      id: sanitized.id,
      problemId: sanitized.id,
      title: "Restored Problem",
      executionToken: sanitized.executionToken,
    };
    const restoredVisible = resolveAuthoritativeTestCases(restoredProblem, { visibleOnly: true });
    const restoredFull = resolveAuthoritativeTestCases(restoredProblem, { visibleOnly: false });
    assert(
      restoredVisible.length === 1 && restoredFull.length === 2,
      "Refreshed/restored problem resolves authoritatively from execution token after cache clear"
    );
  } finally {
    // Restore original key state in-memory
    if (originalKey !== undefined) {
      process.env.TEST_CASE_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TEST_CASE_ENCRYPTION_KEY;
    }
    clearCacheForTesting();
  }

  console.log("\n=================================================");
  console.log(`TOTAL SECURITY TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log("=================================================");

  if (passed !== total) {
    process.exitCode = 1;
  }
}

await runSecurityTests();
