# Institutional Governance & AI Knowledge Base

Production-oriented Next.js + Supabase + pgvector foundation implementing the five-role governance model, meeting workflow, AI transcription/summarization/action extraction, embeddings, hybrid retrieval, and RAG assistant.

## 1. Requirements
- Node.js 20+
- A Supabase project
- A Hugging Face token with Inference Providers access (for hosted transcription and analysis), or a configured local Whisper runtime

## 2. Install
```bash
npm install
cp .env.example .env.local
npm run typecheck
npm run dev
```
Open http://localhost:3001.

## 3. Supabase setup
1. Create a project in Supabase.
2. Open SQL Editor.
3. Paste/run `supabase/migrations/001_governance.sql`.
4. In Authentication, create users with email/password.
5. For each Auth user, insert a matching row into `public.users` using the same UUID. Example:
```sql
insert into public.users(id,email,role,department)
select id,email,'Super Admin','Administration'
from auth.users
where email='you@example.com';
```
6. Put your project URL and publishable key in `.env.local`; put the service-role key only in the server environment.

## 4. Environment variables
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe for browser use. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must never be exposed with `NEXT_PUBLIC_`.

## 5. First login
Create a Supabase Auth user, create its `public.users` profile row, then sign in at `/login`.

## 6. Meeting AI flow
Go to `/meetings` → create a meeting → open it → upload audio/video → choose **Process**. The processing route downloads the private recording, transcribes it with the configured Whisper path, generates a summary and candidate decisions/action items, and saves a draft analysis for human review. The reviewer can edit the result and explicitly approve it; approval creates versioned minutes and governance action items. The legacy `/api/meetings/[id]/process` endpoint forwards to the same processing implementation.

### AI provider configuration
- Set `HUGGINGFACE_API_KEY` to enable hosted Whisper transcription and Hugging Face analysis.
- Set `WHISPER_WORKER_URL` (and optional `WHISPER_WORKER_TOKEN`) to use a dedicated transcription worker.
- If neither hosted option is configured, the application attempts the local Python Whisper runtime under `ai/whisper`; install its requirements and ensure ffmpeg is available.
- Video uploads are routed through the local Whisper/ffmpeg path unless a dedicated worker is configured.
- Semantic embeddings are optional. Set `ENABLE_OPENAI_EMBEDDINGS=true` and `OPENAI_API_KEY` to generate 1536-dimensional OpenAI embeddings. Without this flag, transcript analysis and human approval still work; semantic indexing is skipped.

### Important production note
The processing endpoint is synchronous and has a 300-second platform execution ceiling. For recordings that exceed that window, use a durable background worker/queue and poll processing status rather than increasing the request timeout. Validate the configured provider's file-size and duration limits before production rollout.

## 7. Deployment
For Vercel, add the same environment variables under Project Settings → Environment Variables, then deploy. Add your production URL to Supabase Auth redirect/site URL settings.

## 8. Security
RLS is enabled for all application tables, with role-aware policies. The application also checks roles before privileged server actions. Never ship the service-role key to the browser.

<!-- Keep production deployment history traceable. -->
