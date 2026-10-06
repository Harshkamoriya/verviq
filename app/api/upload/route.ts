import { NextResponse, NextRequest } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { getAuth, currentUser } from "@clerk/nextjs/server";
import { v4 as uuidv4 } from "uuid";
import { pdf } from "pdf-parse";

import prisma from "@/app/lib/db";
import { embedTextWithGemini } from "@/app/lib/gemini";

// Vercel serverless: give upload enough time for PDF parse + embeddings.
export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  console.log("🟢 [UPLOAD ROUTE] Request received at:", new Date().toISOString());

  try {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || process.env.INDEX_NAME;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!pineconeKey) {
      return jsonError("PINECONE_API_KEY is not configured on the server", 500);
    }
    if (!indexName) {
      return jsonError("PINECONE_INDEX_NAME is not configured on the server", 500);
    }
    if (!geminiKey) {
      return jsonError("GEMINI_API_KEY is not configured on the server", 500);
    }

    const { userId: clerkId } = getAuth(req);
    if (!clerkId) {
      return jsonError("Unauthorized — please sign in again", 401);
    }

    let user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      console.log("⚠️ User not found in DB. Auto-syncing from Clerk...");
      const clerkUser = await currentUser();

      if (!clerkUser) {
        return jsonError("Clerk user data missing", 401);
      }

      const email = clerkUser.emailAddresses?.[0]?.emailAddress;
      if (!email) {
        return jsonError("User email not found in Clerk", 400);
      }

      user = await prisma.user.create({
        data: {
          clerkId,
          email,
          name:
            `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
            undefined,
        },
      });
      console.log("✅ User auto-synced into Prisma DB:", user.id);
    }

    const formData = await req.formData();
    const file = formData.get("resume") as File | null;
    if (!file) {
      return jsonError("No file uploaded — missing 'resume' key.", 400);
    }

    console.log("📄 File received:", file.name, "Size:", file.size, "Type:", file.type);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("🔍 Parsing PDF...");
    const pdfData = await pdf(buffer);
    const fullText = (pdfData.text || "").trim();
    console.log("📜 Extracted text length:", fullText.length);

    if (!fullText || fullText.length < 50) {
      return jsonError(
        "Could not extract enough text from this PDF. Try a text-based resume (not a scanned image).",
        400
      );
    }

    const CHUNK_SIZE = 500;
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
      chunks.push(fullText.slice(i, i + CHUNK_SIZE));
    }
    console.log(`🧩 Total chunks created: ${chunks.length}`);

    const document = await prisma.document.create({
      data: {
        title: file.name || "Untitled Document",
        fileUrl: "",
        userId: user.id,
      },
    });

    // Vercel has a read-only filesystem (except /tmp). We already store
    // fullResumeText in Postgres, so a durable local PDF path is not required.
    const resumeId = uuidv4();
    const filePath = `memory://${resumeId}.pdf`;

    const resume = await prisma.resume.create({
      data: {
        id: resumeId,
        userId: user.id,
        filePath,
        fullResumeText: fullText,
        filename: file.name,
        mimeType: file.type || "application/pdf",
        sizeBytes: file.size,
        processedAt: new Date(),
      },
    });

    console.log("✅ Resume saved with ID:", resume.id);

    const pc = new Pinecone({ apiKey: pineconeKey });
    const index = pc.index(indexName);
    const namespace = index.namespace(resumeId);

    let chunkCount = 0;
    let skippedEmpty = 0;

    for (const chunk of chunks) {
      chunkCount++;
      const embedding = await embedTextWithGemini(chunk);

      if (!embedding || embedding.length === 0) {
        skippedEmpty++;
        console.warn(`⚠️ Empty embedding for chunk ${chunkCount}, skipping Pinecone upsert`);
        continue;
      }

      await prisma.chunk.create({
        data: {
          documentId: document.id,
          content: chunk,
          embedding,
        },
      });

      await namespace.upsert([
        {
          id: `${resumeId}-${chunkCount}`,
          values: embedding,
          metadata: { documentId: document.id, content: chunk },
        },
      ]);
    }

    if (chunkCount - skippedEmpty === 0) {
      return jsonError(
        "Failed to create resume embeddings. Check GEMINI_API_KEY / model access.",
        500
      );
    }

    console.log(
      `✅ Upload complete. chunks=${chunkCount}, embedded=${chunkCount - skippedEmpty}, skipped=${skippedEmpty}`
    );

    return NextResponse.json({
      success: true,
      documentId: document.id,
      resumeId,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string };
    console.error("❌ [UPLOAD ERROR]:", err);
    console.error("📛 Stack trace:", err?.stack || "No stack available");
    if (err?.code) {
      console.error("🧩 Error Code:", err.code);
      console.error("🧾 Meta:", err.meta);
    }

    const message =
      err?.message ||
      (typeof error === "string" ? error : "Unexpected server error during upload");

    return jsonError(message, 500);
  } finally {
    console.log("🔚 [END] Upload route finished at:", new Date().toISOString());
  }
}
