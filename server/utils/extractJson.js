/**
 * PrepAI Robust JSON Extractor & Sanitizer
 * 
 * Safely extracts and parses JSON from AI model outputs without destructive regex
 * operations that corrupt code strings. Handles markdown code fences, balanced braces,
 * unescaped literal newlines in strings, and invalid escape sequences (e.g. \s, \d in regexes).
 */

export class JsonExtractionError extends Error {
  constructor(message, { rawSnippet = null, cause = null } = {}) {
    super(message);
    this.name = "JsonExtractionError";
    this.rawSnippet = rawSnippet;
    if (cause) this.cause = cause;
  }
}

/**
 * Redacts potential sensitive tokens (API keys, secrets, tokens) from diagnostic snippets.
 */
function redactSecrets(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/(?:AIza[0-9A-Za-z-_]{35})/g, "[REDACTED_API_KEY]")
    .replace(/(?:sk-[0-9A-Za-z-_]{20,})/g, "[REDACTED_KEY]")
    .replace(/(?:Bearer\s+[A-Za-z0-9._~+/-]+=*)/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/(?:["']?(?:apiKey|password|secret|token)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$2');
}

/**
 * Extracts the primary JSON substring from text by scanning for balanced braces
 * while respecting string literals, escaped quotes, and comments.
 */
function findBalancedJsonSubstring(text) {
  if (!text || typeof text !== "string") return null;

  // First check if text contains markdown code fence ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const targetText = fenceMatch ? fenceMatch[1].trim() : text;

  // Find first { or [
  let startIdx = -1;
  let rootChar = "";
  for (let i = 0; i < targetText.length; i++) {
    const ch = targetText[i];
    if (ch === "{" || ch === "[") {
      startIdx = i;
      rootChar = ch;
      break;
    }
  }

  if (startIdx === -1) return null;

  const closeChar = rootChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIdx; i < targetText.length; i++) {
    const ch = targetText[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === rootChar) {
        depth++;
      } else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          return targetText.substring(startIdx, i + 1);
        }
      }
    }
  }

  // If depth didn't return to 0, return from startIdx to end as best effort
  return targetText.substring(startIdx);
}

/**
 * Non-destructively repairs common model JSON formatting defects inside string literals:
 * 1. Invalid JSON string escape sequences (e.g. \s, \d, \w, \+) by doubling the backslash (\\s, \\d).
 * 2. Unescaped control characters (literal newlines/carriage returns/tabs) inside string literals.
 * 3. Trailing commas before closing braces/brackets outside string literals.
 */
function sanitizeJsonString(raw) {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (isEscaped) {
        // We are at the character immediately after an unescaped backslash
        isEscaped = false;
        // Valid JSON escape characters: " \ / b f n r t u
        const isValidEscape = /["\\/bfnrtu]/i.test(ch);
        if (isValidEscape) {
          result += "\\" + ch;
        } else {
          // Invalid escape sequence like \s, \d, \w, \+ -> double the backslash to preserve literal code
          result += "\\\\" + ch;
        }
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === "\n") {
        // Unescaped literal newline inside string literal -> convert to \n
        result += "\\n";
      } else if (ch === "\r") {
        // Unescaped literal carriage return inside string literal -> convert to \r
        result += "\\r";
      } else if (ch === "\t") {
        // Unescaped literal tab inside string literal -> convert to \t
        result += "\\t";
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        result += ch;
      } else if (ch === ",") {
        // Check for trailing comma before } or ]
        let j = i + 1;
        while (j < raw.length && /\s/.test(raw[j])) j++;
        if (j < raw.length && (raw[j] === "}" || raw[j] === "]")) {
          // Omit trailing comma
          continue;
        }
        result += ch;
      } else {
        result += ch;
      }
    }
  }

  // If the string ended with an unclosed escape
  if (isEscaped) {
    result += "\\";
  }

  return result;
}

/**
 * Extracts and parses JSON from raw model text.
 * Throws JsonExtractionError with redacted, length-limited diagnostic context on failure.
 *
 * @param {string} text - Raw AI output string
 * @returns {any} Parsed JavaScript value
 */
export function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new JsonExtractionError("Input text must be a non-empty string");
  }

  const jsonCandidate = findBalancedJsonSubstring(text);
  if (!jsonCandidate) {
    const snippet = redactSecrets(text.slice(0, 150));
    throw new JsonExtractionError("No valid JSON structure found in AI response", {
      rawSnippet: snippet,
    });
  }

  // 1. Direct standard parse attempt
  try {
    return JSON.parse(jsonCandidate);
  } catch (err1) {
    // 2. String-aware non-destructive sanitization attempt
    try {
      const sanitized = sanitizeJsonString(jsonCandidate);
      return JSON.parse(sanitized);
    } catch (err2) {
      // Create a safely redacted, length-limited diagnostic snippet (max 150 chars around error)
      const sanitizedSnippet = redactSecrets(jsonCandidate.slice(0, 150));
      throw new JsonExtractionError(
        `Failed to parse JSON from AI response: ${err2.message}`,
        {
          rawSnippet: sanitizedSnippet,
          cause: err2,
        }
      );
    }
  }
}