import { GoogleGenerativeAI } from "@google/generative-ai";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function embedTextWithGemini(text: string): Promise<number[]> {
  try {
    console.log("Inside embedTextWithGemini function");
    console.log("🔑 GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Loaded ✅" : "❌ Missing");

    const genAI = getGenAI();
    // Use a stable Gemini Embedding model (gemini-embedding-001 is most compatible)
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    // Generate embedding with forced 768 dimensions to match Pinecone
    const result = await model.embedContent({
      content: { parts: [{ text }], role: "user" },
      outputDimensionality: 768
    } as any);

    // Extract embedding vector
    const embedding = result.embedding?.values || [];
    console.log("🧠 Embedding length:", embedding.length);
    return embedding;
  } catch (error: any) {
    console.error("❌ Gemini embedding error:", error.message || error);
    return [];
  }

}

//chat with gemini

export async function queryGemini(prompt: string) {


  console.log("[DEBUG] getOptimizationTips called with prompt:", prompt);

console.log(process.env.GEMINI_API_KEY, "GEMINI_API_KEY");
    if (!process.env.GEMINI_API_KEY) {
        console.error("[ERROR] GEMINI_API_KEY is not set.");
        throw new Error("GEMINI_API_KEY is not set");
    }
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log("[DEBUG] Gemini model initialized.");

    const result = await model.generateContent(prompt)
    console.log("[DEBUG] Received response from Gemini.");

    const text = result.response.text();
    console.log("[DEBUG] Extracted text from Gemini response:", text);

    return text;
  } catch (error) {
    console.error("[ERROR] Failed to get optimization tips from Gemini:", error);
    throw error;  // rethrow so caller knows it failed
  }
}



const systemPrompt =`You are generating original competitive programming problems.
Do not copy LeetCode wording.
Ensure deterministic outputs.
`

const userPrompt  = `Rewrite the coding problem "{title}" as a new original problem.

Requirements:
- Use different wording
- Same logical problem
- Clear input/output format
- Constraints
- At least 8 test cases
- Include edge cases
- Output test cases as JSON

Return JSON:
{
  "statement": "...",
  "constraints": "...",
  "examples": "...",
  "testCases": [
    { "input": "...", "output": "...", "hidden": false },
    { "input": "...", "output": "...", "hidden": true }
  ]
}
`




 
