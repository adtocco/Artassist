Blueprint: Deploy ArtAssist on Render (Frontend + Backend + Worker)

Overview
- Frontend: Vite React app (build -> `dist`), served by Node web service here (or could be Static Site)
- Backend: `server/index.js` - exposes `/api/process/:id` and basic health endpoint; processing is triggered synchronously after upload.

Required environment variables (set in Render dashboard):
- SUPABASE_URL: your Supabase project URL
- SUPABASE_SERVICE_ROLE: Supabase service_role key (keep secret, used by server/worker)
- OPENAI_API_KEY: OpenAI API key (server-side)
- VITE_SUPABASE_URL: Supabase URL for frontend
- VITE_SUPABASE_ANON_KEY: Supabase anon key for frontend
- (optional) WORKER_POLL_INTERVAL: ms between polls (default 8000)

Files added by blueprint:
- `server/index.js` - Express web service
- `server/processor.js` - processing logic (used by server)
- `render.yaml` - Render services definitions

Database changes
- The `photo_analyses` table must contain the following columns (add via SQL migration if needed):
  - status TEXT DEFAULT 'pending'
  - analysis_started_at TIMESTAMP
  - analysis_finished_at TIMESTAMP
  - processor TEXT
  - error_message TEXT

Example SQL migration (supabase SQL editor):

ALTER TABLE photo_analyses
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS analysis_finished_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processor TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

Deploy steps (Render)
1. Push your repo to GitHub.
2. On Render, create a new service by connecting your GitHub repo and using `render.yaml` (Auto-deploy).
3. In Render dashboard, create the web service and set the environment variables listed above.
4. Deploy. The web service will build and start; after uploads the server will process images immediately.

Local testing
- Run frontend-only during development:
  npm run dev
- Run server locally (requires env vars):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... OPENAI_API_KEY=... npm run start
Local testing
- Run frontend-only during development:
  npm run dev
- Run server locally (requires env vars):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... OPENAI_API_KEY=... npm run start

Notes & security
- Never store `SUPABASE_SERVICE_ROLE` or `OPENAI_API_KEY` in the frontend or public repos.
- Use Render's encrypted environment variables to keep keys secret.
- Consider adding rate-limiting and retries for OpenAI calls and robust error handling for production.
