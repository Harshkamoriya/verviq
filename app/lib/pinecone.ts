import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";

// Lazy init — Next.js evaluates route imports at build time.
// Constructing Pinecone with a missing key throws and fails `next build`.
function getPineconeIndex() {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is not set");
  }
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME is not set");
  }
  return new Pinecone({ apiKey }).index(indexName);
}

function getGenAi() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function queryResumeChunks(resumeId: string, query: string, topK: number = 10) {
  console.log("📌 queryResumeChunks called with:", { resumeId, query, topK });

  const genAi = getGenAi();
  const index = getPineconeIndex();

  // --- Generate embedding ---
  console.log("🧠 Generating embedding for query...");
  const model = genAi.getGenerativeModel({ model: "gemini-embedding-001" });
  const embedResult = await model.embedContent({
    content: { parts: [{ text: query }], role: "user" },
    outputDimensionality: 768
  } as any);
  const embedding = embedResult.embedding.values;
  console.log("✅ Embedding generated, length:", embedding.length);

  // --- Query Pinecone ---
  console.log(`📦 Querying Pinecone index "${process.env.PINECONE_INDEX_NAME}" in namespace "${resumeId}" with topK=${topK}...`);
  const queryResponse = await index.namespace(resumeId).query({
    vector: embedding,
    topK, // correct key
    includeMetadata: true,
  });
  console.log(`✅ Pinecone query returned ${queryResponse.matches.length} matches`);

  // --- Process results ---
  const chunks = queryResponse.matches.map((match) => {
console.log("🔹 Match:", { 
  score: match.score, 
  contentSnippet: String(match.metadata?.content).slice(0, 50) + "..." 
});
    return {
      content: match.metadata?.content as string,
      score: match.score,
    };
  });

  console.log("📄 Returning processed resume chunks" , chunks);
  return chunks;
}
