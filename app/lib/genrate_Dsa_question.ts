import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "./db";

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

const systemPrompt = `
You are an expert competitive programming problem setter.

Rules:
- Do NOT copy LeetCode wording
- Create an original problem with the SAME logic
- Be deterministic
- Output RAW JSON ONLY
- Do NOT use markdown code blocks (e.g., no \`\`\`json)
- No explanation text
`;

function buildUserPrompt(title: string) {
  return `
Rewrite the coding problem "${title}" as a new original problem.

Requirements:
- Same logical problem
- Completely different wording
- Clear input/output format
- Constraints
- At least 8 test cases
- Include edge cases
- Test cases must be realistic

Return JSON EXACTLY in this format:
{
  "statement": "string",
  "constraints": "string",
  "examples": "string",
  "testCases": [
    { "input": "string", "output": "string", "hidden": false },
    { "input": "string", "output": "string", "hidden": true }
  ]
}
`;
}

function cleanJSON(text: string) {
  // Remove markdown code blocks if the AI includes them regardless of prompt
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```json\n?/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function generateWithRetry(model: any, prompt: string, maxRetries = 10) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err: any) {
      // 429 = Too Many Requests / Quota Exceeded
      if (err.status === 429) {
        // Exponential backoff: 5s, 10s, 20s, 40s...
        const delay = Math.pow(2, retries) * 5000 + Math.random() * 2000;
        console.log(`⚠️ Rate limited. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${retries + 1}/${maxRetries})`);
        await sleep(delay);
        retries++;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Max retries (${maxRetries}) exceeded for AI generation. You may have hit your DAILY quota.`);
}

export async function generateProblemContent() {
  // Switching to 'gemini-pro' as it's the most stable and widely available model.
  // gemini-1.5-flash seems to be restricted or returning 404 in this environment.
 const model = getGenAI().getGenerativeModel({
  model: "gemini-2.5-flash",
});


  const questions = await prisma.question.findMany({
    where: {
      content: null, 
    },
  });

  console.log(`Found ${questions.length} questions to process`);
  let successCount = 0;
  let failCount = 0;

  for (const q of questions) {
    try {
      console.log(`Generating content for: ${q.title}`);

      // Wait 10 seconds between questions to be extremely safe with Free Tier RPM
      await sleep(10000); 

      const prompt = buildUserPrompt(q.title);
      const combinedPrompt = `${systemPrompt}\n${prompt}`;

      const result = await generateWithRetry(model, combinedPrompt);

      const rawText = result.response.text();
      const cleanedText = cleanJSON(rawText);

      const parsed = JSON.parse(cleanedText);

      await prisma.problemContent.create({
        data: {
          questionId: q.id,
          statement: parsed.statement,
          constraints: parsed.constraints,
          examples: parsed.examples,
          testCases: parsed.testCases,
        },
      });

      console.log(`✅ Saved content for ${q.title}`);
      successCount++;
    } catch (err: any) {
      console.error(`❌ Failed for ${q.title}`);
      const errorMessage = err.message || "Unknown error";
      console.error(errorMessage);
      failCount++;

      // If we hit a 404 for gemini-pro, we might have a serious API key issue
      if (errorMessage.includes("404")) {
        console.log("🛑 Model not found. Please verify your API key access.");
        break;
      }
      
      if (errorMessage.includes("Max retries")) {
        console.log("🛑 Quota likely exhausted for the day. Stopping.");
        break;
      }
    }
  }

  console.log(`\n🏁 Finished: ${successCount} successful, ${failCount} failed.`);
  await prisma.$disconnect();
}
