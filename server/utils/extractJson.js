// A helper function to find and parse JSON from a string
export function extractJson(text) {
  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error("No valid JSON object found in the AI response.");
  }

  let jsonString = text.substring(startIndex, endIndex + 1);

  try {
    return JSON.parse(jsonString);
  } catch (e1) {
    console.warn(
      "Initial JSON parsing failed. Attempting cleanup...",
      e1.message
    );

    try {
      jsonString = jsonString.replace(
        /(['"])?([a-zA-Z0-9_]+)(['"])?:/g,
        '"$2":'
      );

      jsonString = jsonString.replace(/,\s*([}\]])/g, "$1");

      return JSON.parse(jsonString);
    } catch (e2) {
      console.error(
        "Failed to parse extracted JSON even after cleanup:",
        e2.message
      );

      throw new Error("Invalid JSON response from AI.");
    }
  }
}