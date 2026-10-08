import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const flashModel = genAI.getGenerativeModel({
  model: "gemini-3.5-flash",
});

export async function generateText(prompt) {
  const result = await flashModel.generateContent(prompt);
  return result.response.text();
}