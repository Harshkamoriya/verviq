import { GoogleGenerativeAI } from "@google/generative-ai";

// Models to try in order — both are currently active (July 2025)
// gemini-1.5-* are shut down; gemini-2.5-flash-lite is the lightweight fallback
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash-latest", "gemini-pro"];

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s

function getGenAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateWithGemini(prompt: string): Promise<string> {
  let lastError: unknown;
  const genAi = getGenAi();

  for (const modelName of MODELS) {
    const model = genAi.getGenerativeModel({ model: modelName });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[Gemini] model=${modelName} attempt=${attempt + 1}`);
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        console.log(`[Gemini] ✅ success model=${modelName}`);
        return text;
      } catch (err: any) {
        lastError = err;
        const status: number | undefined = err?.status ?? err?.response?.status;

        console.warn(
          `[Gemini] ${modelName} attempt ${attempt + 1} failed — status=${status ?? "unknown"}`
        );

        // 404 = model not found, 400/401/403 = bad request — skip model immediately
        // 429 = quota exhausted — no point retrying same model, move to next
        if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429) {
          console.warn(`[Gemini] Status ${status} for ${modelName} — skipping to next model`);
          break;
        }

        // 429 / 503 / 500 — retryable, wait then retry
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.log(`[Gemini] Waiting ${delay}ms before retry...`);
          await sleep(delay);
        }
      }
    }

    console.warn(`[Gemini] All retries exhausted for model=${modelName}, trying next model`);
  }

  console.error("[Gemini] All models and retries failed");
  throw lastError;
}
