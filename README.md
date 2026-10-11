# Intervu — AI Mock Interview Practice Coach

**Intervu** (IntervuAI) is an AI-powered **mock interview practice** product. Upload a resume, pick a target role and coach persona, do a voice interview grounded in your real experience via RAG, and get a structured performance report.

> This app (`pdf_reader`) is the practice coach. It is **not** claiming a full recruiter hiring pipeline (jobs, invites, scheduled rounds) as the shipped product.

---

## What it does

| Feature | Description |
|--------|-------------|
| Resume RAG | PDF upload → chunk → Gemini embeddings → Pinecone (namespace = `resumeId`) |
| Practice setup | Choose target role + coach persona (Ava / Marcus / Priya) |
| Voice interview | AssemblyAI STT + browser TTS + turn-taking |
| AI loop | Retrieve resume context → Gemini evaluates answer → next question |
| Report | Overall score, skill breakdown, Q&A review, improvement roadmap |
| History | Past practice sessions on the dashboard |

---

## Product flow

1. Land on `/` → sign in with **Clerk**
2. Go to `/dashboard` → upload resume, choose **role** + **coach**
3. Start practice → `/dashboard/session/[sessionId]` (voice room)
4. Finish → report at `/dashboard/session/[sessionId]/report`

---

## Architecture

```
Browser (dashboard + voice room)
  ├─ Mic → AssemblyAI WebSocket (STT)
  └─ Browser SpeechSynthesis (TTS)
           │
           ▼
Next.js App Router (this repo)
  ├─ POST /api/upload              → parse PDF, chunk, embed, Pinecone upsert
  ├─ POST /api/practice/start      → create InterviewSession
  ├─ GET  /api/getToken            → AssemblyAI token
  ├─ POST /api/interviews/[id]     → start / reply (RAG + Gemini)
  └─ POST /api/interviews/[id]/end → final report
           │
     ┌─────┼──────────┐
     ▼     ▼          ▼
 PostgreSQL  Pinecone   Gemini
 (Prisma)    (resume)   (LLM + embeddings)
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Auth | Clerk |
| Database | PostgreSQL + Prisma |
| LLM | Google Gemini (`gemini-2.5-flash` + fallbacks) |
| Embeddings | `gemini-embedding-001` (768-dim) |
| Vector DB | Pinecone |
| STT | AssemblyAI (streaming) |
| TTS | Browser `SpeechSynthesis` |
| PDF parse | `unpdf` (Vercel-friendly) |
| UI | Tailwind CSS, Framer Motion, TanStack Query |

Optional / experimental: LiveKit token route exists; primary voice path today is AssemblyAI + browser TTS.

---

## Project structure (keep-set)

```text
app/
  (marketing)/          # Landing page
  (dashboard)/          # Practice hub, session room, report
  api/
    upload/             # Resume ingest + RAG index
    practice/           # Start session + history
    interviews/[id]/    # Interview turn loop, end, report
    getToken/           # AssemblyAI token
    livekit/token/      # Optional LiveKit JWT
  lib/
    llm.ts              # Gemini + model fallbacks
    pinecone.ts         # Resume chunk retrieval
    gemini.ts           # Embeddings helpers
    interviewSession.ts # Session creation
    interviewUtils.ts   # Final report generation
    coachPersonas.ts    # Ava / Marcus / Priya
prisma/
  schema.prisma
```

---

## How RAG works

1. **Ingest:** PDF → plaintext (`unpdf`) → ~500-char chunks → embed → upsert to Pinecone under `namespace = resumeId`
2. **Interview turn:** Embed question + answer → query Pinecone top-K → inject chunks into Gemini prompt
3. **Output:** Structured score + next coach message (JSON), persisted on `InterviewSession`

This keeps questions and follow-ups grounded in the candidate’s real resume, not generic quiz content.

---

## Coach personas

| Coach | Style |
|-------|--------|
| **Ava** | Friendly, encouraging, moderate difficulty |
| **Marcus** | Strict, FAANG-depth follow-ups, hard |
| **Priya** | Balanced depth + breadth, medium-hard |

Same RAG pipeline; different system-prompt overlays.

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Pinecone index with **768** dimensions
- API keys: Clerk, Gemini, Pinecone, AssemblyAI

### Install & run

```bash
npm install
cp .env.example .env.local   # fill in values
npx prisma generate
npx prisma db push           # or migrate, if you use migrations
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

---

## Environment variables

See `.env.example`. Required for practice coach:

```env
DATABASE_URL=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
GEMINI_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
ASSEMBLY_API_KEY=
```

Optional (LiveKit experiments):

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

---

## API overview (practice)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/upload` | Resume PDF → embed → Pinecone |
| `POST` | `/api/practice/start` | Create practice session (`resumeId`, `jobRole`, `coachId`) |
| `GET` | `/api/practice/sessions` | Session history / stats |
| `GET` | `/api/getToken` | AssemblyAI streaming token |
| `GET`/`POST` | `/api/interviews/[id]` | Fetch session / start or reply |
| `POST` | `/api/interviews/[id]/end` | End + generate final report |

---

## Scope note

This README documents the **working mock interview practice product**. Other folders under the parent `verviq/` repo (e.g. `judge_backend`, recruiter/candidate round UIs) may exist for a broader hiring vision but are **out of scope** for what this app ships today.

---

## License

Private / unpublished unless otherwise stated by the repository owner.
