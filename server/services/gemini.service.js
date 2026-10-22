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

export async function generateText(prompt) {
  if (typeof customGenerator === "function") {
    return customGenerator(prompt);
  }
  const result = await flashModel.generateContent(prompt);
  return result.response.text();
}