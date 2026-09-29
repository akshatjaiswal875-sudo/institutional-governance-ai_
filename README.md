# Institutional Governance & AI Knowledge Base

Production-oriented Next.js + Supabase + pgvector foundation implementing the five-role governance model, meeting workflow, AI transcription/summarization/action extraction, embeddings, hybrid retrieval, and RAG assistant.

## 1. Requirements
- Node.js 20+
- A Supabase project
- An OpenAI API key

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
Go to `/meetings` → create a meeting → open it → upload audio/video → the processing route stores the media, transcribes it, summarizes it, extracts actions, creates embeddings, and changes the meeting to `Pending Approval`.

### Important production note
The included Whisper endpoint sends the uploaded file directly. For production recordings larger than the provider's upload limit, implement server-side media chunking/transcoding before transcription. The database and UI are structured so that this can be added without changing the governance model.

## 7. Deployment
For Vercel, add the same environment variables under Project Settings → Environment Variables, then deploy. Add your production URL to Supabase Auth redirect/site URL settings.

## 8. Security
RLS is enabled for all application tables, with role-aware policies. The application also checks roles before privileged server actions. Never ship the service-role key to the browser.

<!-- Keep production deployment history traceable. -->
