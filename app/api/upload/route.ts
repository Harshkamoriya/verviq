import { NextResponse, NextRequest } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { getAuth, currentUser } from "@clerk/nextjs/server";
import { v4 as uuidv4 } from "uuid";

import prisma from "@/app/lib/db";
import { embedTextWithGemini } from "@/app/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(message: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

/** Quick prod debug: open /api/upload in browser to see which env keys exist (no secrets). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
      PINECONE_INDEX_NAME: !!(
        process.env.PINECONE_INDEX_NAME || process.env.INDEX_NAME
      ),
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
    },
  });
}

export async function POST(req: NextRequest) {
  console.log("🟢 [UPLOAD ROUTE] Request received at:", new Date().toISOString());

  try {
    const pineconeKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME || process.env.INDEX_NAME;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!process.env.DATABASE_URL) {
      return jsonError("DATABASE_URL is not configured on Vercel", 500);
    }
    if (!pineconeKey) {
      return jsonError("PINECONE_API_KEY is not configured on Vercel", 500);
    }
    if (!indexName) {
      return jsonError("PINECONE_INDEX_NAME is not configured on Vercel", 500);
    }
    if (!geminiKey) {
      return jsonError("GEMINI_API_KEY is not configured on Vercel", 500);
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

    if (file.size > 4_000_000) {
      return jsonError("Resume must be under ~4MB on Vercel Hobby plans.", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // unpdf works on Vercel serverless (no pdfjs worker file path issues).
    console.log("🔍 Parsing PDF...");
    const { extractText } = await import("unpdf");
    const pdfResult = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    const fullText = (typeof pdfResult.text === "string" ? pdfResult.text : pdfResult.text.join("\n")).trim();
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

    // No local disk write — Vercel filesystem is read-only outside /tmp.
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
    let embeddedCount = 0;

    for (const chunk of chunks) {
      chunkCount++;
      const embedding = await embedTextWithGemini(chunk);

      if (!embedding || embedding.length === 0) {
        console.warn(`⚠️ Empty embedding for chunk ${chunkCount}, skipping`);
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
      embeddedCount++;
    }

    if (embeddedCount === 0) {
      return jsonError(
        "Failed to create resume embeddings. Check GEMINI_API_KEY / model access on Vercel.",
        500
      );
    }

    console.log(`✅ Upload complete. chunks=${chunkCount}, embedded=${embeddedCount}`);

    return NextResponse.json({
      success: true,
      documentId: document.id,
      resumeId,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; meta?: unknown; stack?: string };
    console.error("❌ [UPLOAD ERROR]:", err);
    console.error("📛 Stack:", err?.stack || String(error));

    return jsonError(
      err?.message || "Unexpected server error during upload",
      500,
      { code: err?.code ?? null }
    );
  } finally {
    console.log("🔚 [END] Upload route finished at:", new Date().toISOString());
  }
}
