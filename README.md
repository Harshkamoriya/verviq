# Intervu — AI Practice Coach

Practice realistic mock interviews with AI coaches. Upload your resume, pick a role and coach persona, then get a live interview with instant feedback.

## Product flow

1. Land on `/` → sign in with Clerk
2. Go to `/dashboard` → upload resume, choose role + coach
3. Start practice → `/dashboard/session/[sessionId]`
4. Finish → report at `/dashboard/session/[sessionId]/report`

## Stack

- Next.js (App Router) + TypeScript
- Clerk auth
- Prisma + PostgreSQL
- Gemini (questions + embeddings)
- Pinecone (resume RAG)
- AssemblyAI (speech-to-text)
- LiveKit (optional realtime audio)

## Keep-set (what this repo is)

- `app/(marketing)` — landing
- `app/(dashboard)` — practice hub + session + report
- `app/api/practice` — start session + history
- `app/api/interviews/[id]` — turn loop, reset, end
- `app/api/upload` — resume upload + embed
- `app/api/getToken` — AssemblyAI token
- `app/api/livekit/token` — LiveKit JWT
- `app/lib` — LLM, Pinecone, interview helpers

## Setup

```bash
npm install
cp .env.example .env   # or use your existing .env
npx prisma generate
npm run dev
```

Required env vars: see `.env.example` (Clerk, Database, Gemini, Pinecone, AssemblyAI, LiveKit).
