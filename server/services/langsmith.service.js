import { RunTree, Client } from "langsmith";

/**
 * PrepAI LangSmith AI Observability Service (Node.js)
 *
 * Implements privacy-first, metadata-only tracing for Gemini model calls.
 * Prompts, code solutions, resumes, and interview transcripts are strictly stripped.
 * Model token metrics and costs are handled transparently and kept separate.
 * Non-blocking: tracing failures, timeouts, and network delays never impact live user requests.
 */

export const isTracingEnabled = () => {
  const flag = process.env.LANGSMITH_TRACING || process.env.LANGCHAIN_TRACING_V2;
  const apiKey = process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY;
  return (flag === "true" || flag === "1") && Boolean(apiKey && apiKey.trim() !== "");
};

let clientInstance = null;

function getClient() {
  if (!isTracingEnabled()) return null;
  if (!clientInstance) {
    try {
      clientInstance = new Client({
        apiKey: process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY,
        apiUrl: process.env.LANGSMITH_ENDPOINT || process.env.LANGCHAIN_ENDPOINT || "https://api.smith.langchain.com",
      });
    } catch (err) {
      console.warn("[LangSmith Node] Failed to initialize Client:", err.message);
      return null;
    }
  }
  return clientInstance;
}

/**
 * Official Google Gemini public pricing lookup.
 * Returns null if the exact model ID is not on official public pricing sheets.
 * Note: Under the Google AI Studio Free Tier, billed cost is $0.00.
 */
export function calculateEstimatedCost(promptTokens, completionTokens, model = "gemini-3.5-flash-lite") {
  if (typeof promptTokens !== "number" || typeof completionTokens !== "number") {
    return null;
  }

  // Exact model ID check:
  // "gemini-3.5-flash-lite" is an unlisted/custom model ID in this repository without published pricing.
  // Official published rates exist for:
  // - "gemini-1.5-flash": $0.075 / 1M input, $0.30 / 1M output (<=128k prompt)
  // - "gemini-2.0-flash": $0.10 / 1M input, $0.40 / 1M output
  // - "gemini-2.0-flash-lite-preview-02-05": $0.075 / 1M input, $0.30 / 1M output
  // Because pricing cannot be established reliably for "gemini-3.5-flash-lite", return null.
  if (model === "gemini-1.5-flash" || model === "gemini-2.0-flash-lite-preview-02-05") {
    const inputCost = promptTokens * 0.000000075;
    const outputCost = completionTokens * 0.00000030;
    return Number((inputCost + outputCost).toFixed(8));
  }

  if (model === "gemini-2.0-flash") {
    const inputCost = promptTokens * 0.00000010;
    const outputCost = completionTokens * 0.00000040;
    return Number((inputCost + outputCost).toFixed(8));
  }

  return null;
}

/**
 * Sanitize error messages to strictly prevent prompts, user code, or credentials from leaking into traces.
 */
export function sanitizeErrorMessage(error) {
  if (!error) return "Model execution failed";
  const rawMsg = typeof error.message === "string" ? error.message : String(error);

  // Redact potential API keys (e.g. AIzaSy..., bearer tokens)
  const scrubbed = rawMsg
    .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_API_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED_TOKEN]");

  const errorName = error.name || "Error";
  const status = error.status || error.code || "";
  // Truncate to short classifier and strip carriage returns
  const cleanSnippet = scrubbed.slice(0, 80).replace(/[\r\n]+/g, " ").trim();
  return `${errorName}${status ? ` (code ${status})` : ""}: ${cleanSnippet}`;
}

/**
 * Start a privacy-guarded LLM run.
 * Does NOT transmit raw prompt text, code, or user documents.
 * Dispatches postRun asynchronously so it NEVER delays the downstream AI model call.
 *
 * @param {Object} params
 * @param {string} params.stage - Operation label (e.g., 'problem_generation', 'code_review')
 * @param {number} params.promptLength - Character length of prompt (metadata only)
 * @param {string} [params.model="gemini-3.5-flash-lite"]
 * @returns {RunTree|null}
 */
export function startTrace({ stage = "general", promptLength = 0, model = "gemini-3.5-flash-lite" }) {
  if (!isTracingEnabled()) return null;

  try {
    const client = getClient();
    const projectName = process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || "prepai-server";

    const run = new RunTree({
      name: `gemini_${stage}`,
      run_type: "llm",
      inputs: {
        stage,
        prompt_chars: promptLength,
        content_redacted: true,
      },
      extra: {
        metadata: {
          app_name: "PrepAI",
          environment: process.env.NODE_ENV || "development",
          provider: "google",
          model,
          stage,
          privacy_mode: "metadata_only",
        },
      },
      client,
      project_name: projectName,
    });

    // Fire asynchronously in background - NEVER block model execution
    run.postRun().catch((postErr) => {
      console.warn(`[LangSmith Node] postRun background warning (${stage}):`, postErr.message);
    });

    return run;
  } catch (err) {
    console.warn(`[LangSmith Node] startTrace warning (${stage}):`, err.message);
    return null;
  }
}

/**
 * End a run with token metrics and status.
 * Does NOT transmit model completions or raw response bodies.
 * Dispatches patchRun asynchronously.
 *
 * @param {RunTree|null} run
 * @param {Object} params
 * @param {number} params.responseLength - Character length of completion
 * @param {Object} [params.usageMetadata] - Google GenAI token usage metadata
 * @param {number} [params.durationMs]
 * @param {Error|null} [params.error]
 * @param {string} [params.model="gemini-3.5-flash-lite"]
 */
export function endTrace(
  run,
  {
    responseLength = 0,
    usageMetadata = null,
    durationMs = 0,
    error = null,
    model = "gemini-3.5-flash-lite",
  } = {}
) {
  if (!run) return;

  try {
    const promptTokens = usageMetadata?.promptTokenCount ?? null;
    const completionTokens = usageMetadata?.candidatesTokenCount ?? null;
    const totalTokens = usageMetadata?.totalTokenCount ?? null;
    const estimatedCostUsd = calculateEstimatedCost(promptTokens, completionTokens, model);

    const usageInfo = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      token_source: promptTokens != null ? "provider_reported" : "unavailable",
      estimated_cost_usd: estimatedCostUsd,
      billed_cost_usd: 0.00, // Google AI Studio Free Tier
      cost_status: estimatedCostUsd !== null ? "calculated" : "pricing_unavailable_for_model",
      cost_note:
        estimatedCostUsd === null
          ? `Official pricing cannot be established reliably for model '${model}'; actual billed cost under Google AI Studio free tier is $0.00`
          : undefined,
    };

    const sanitizedError = error ? sanitizeErrorMessage(error) : null;

    if (error) {
      run
        .end({
          outputs: {
            status: "failed",
            error_type: error.name || "Error",
            content_redacted: true,
          },
          error: sanitizedError,
          end_time: Date.now(),
          extra: {
            metadata: {
              duration_ms: durationMs,
              ...usageInfo,
            },
          },
        })
        .then(() => run.patchRun())
        .catch((patchErr) => {
          console.warn("[LangSmith Node] patchRun error warning:", patchErr.message);
        });
    } else {
      run
        .end({
          outputs: {
            status: "success",
            response_chars: responseLength,
            content_redacted: true,
          },
          end_time: Date.now(),
          extra: {
            metadata: {
              duration_ms: durationMs,
              ...usageInfo,
            },
          },
        })
        .then(() => run.patchRun())
        .catch((patchErr) => {
          console.warn("[LangSmith Node] patchRun success warning:", patchErr.message);
        });
    }
  } catch (err) {
    // Non-blocking: tracing failures must never impact live user requests
    console.warn("[LangSmith Node] endTrace warning:", err.message);
  }
}

export default {
  isTracingEnabled,
  calculateEstimatedCost,
  sanitizeErrorMessage,
  startTrace,
  endTrace,
};
