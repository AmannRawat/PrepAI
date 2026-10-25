import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const flashModel = genAI.getGenerativeModel({
  model: "gemini-3.5-flash-lite",
});

let customGenerator = null;

/**
 * Testing utility to mock generateText without making live external API calls.
 * Passing null restores the default Gemini API client.
 */
export function setCustomTextGenerator(fn) {
  customGenerator = fn;
}

export async function generateText(prompt, options = {}) {
  const stage = typeof options === "string" ? options : (options?.stage || "general");
  const maxAttempts = options?.maxAttempts || 2;
  const timeoutMs = options?.timeout || 25000;
  const overallDeadlineMs = options?.overallDeadlineMs || 55000;
  let lastError = null;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    if (Date.now() - startTime >= overallDeadlineMs) {
      break;
    }

    try {
      if (typeof customGenerator === "function") {
        return await customGenerator(prompt, options);
      }

      // Enforce bounded request timeout on the model request using AbortSignal
      const abortSignal = AbortSignal.timeout(timeoutMs);
      const result = await flashModel.generateContent(prompt, {
        timeout: timeoutMs,
        signal: abortSignal,
      });
      return result.response.text();
    } catch (err) {
      lastError = err;
      const attemptDuration = Date.now() - attemptStart;
      const totalDuration = Date.now() - startTime;

      const isTimeout =
        err.name === "AbortError" ||
        err.name === "TimeoutError" ||
        err.name === "GoogleGenerativeAIAbortError" ||
        /timeout|aborted|exceeded/i.test(err.message || "");

      const isTransport =
        (err.name === "TypeError" && err.message?.includes("fetch failed")) ||
        /ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET/i.test(err.message || "");

      const isTransientNetworkError =
        isTimeout ||
        isTransport ||
        err.status === 503 ||
        err.status === 429;

      console.warn(
        `[Gemini Service] Stage '${stage}' failure on attempt ${attempt}/${maxAttempts} (${attemptDuration}ms elapsed, total ${totalDuration}ms): ${err.message}`
      );

      err.stage = stage;
      err.durationMs = totalDuration;
      err.isTimeout = isTimeout;
      err.isTransportFailure = isTimeout || isTransport;

      // At most one retry for genuinely transient failures; abort if deadline exceeded
      if (
        !isTransientNetworkError ||
        attempt >= maxAttempts ||
        Date.now() - startTime + 500 >= overallDeadlineMs
      ) {
        throw err;
      }

      console.warn(`[Gemini Service] Retrying stage '${stage}' in 500ms...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (lastError) {
    lastError.stage = stage;
    lastError.durationMs = Date.now() - startTime;
  }
  throw lastError;
}