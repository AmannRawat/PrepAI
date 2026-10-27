import { GoogleGenerativeAI } from "@google/generative-ai";
import { startTrace, endTrace } from "./langsmith.service.js";

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

    const traceRun = startTrace({
      stage,
      promptLength: prompt?.length || 0,
      model: "gemini-3.5-flash-lite",
    });

    try {
      if (typeof customGenerator === "function") {
        const customResult = await customGenerator(prompt, options);
        if (traceRun) {
          endTrace(traceRun, {
            responseLength: typeof customResult === "string" ? customResult.length : 0,
            durationMs: Date.now() - attemptStart,
            model: "gemini-3.5-flash-lite",
          });
        }
        return customResult;
      }

      // Enforce bounded request timeout on the model request using AbortSignal
      const abortSignal = AbortSignal.timeout(timeoutMs);
      const result = await flashModel.generateContent(prompt, {
        timeout: timeoutMs,
        signal: abortSignal,
      });

      const responseText = result.response.text();
      const usageMetadata = result.response.usageMetadata;
      const attemptDuration = Date.now() - attemptStart;

      if (traceRun) {
        endTrace(traceRun, {
          responseLength: responseText?.length || 0,
          usageMetadata,
          durationMs: attemptDuration,
          model: "gemini-3.5-flash-lite",
        });
      }

      return responseText;
    } catch (err) {
      lastError = err;
      const attemptDuration = Date.now() - attemptStart;
      const totalDuration = Date.now() - startTime;

      if (traceRun) {
        endTrace(traceRun, {
          durationMs: attemptDuration,
          error: err,
          model: "gemini-3.5-flash-lite",
        });
      }

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