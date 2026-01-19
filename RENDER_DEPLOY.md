# Render Deployment Configuration

## Build Command
npm ci && npm run build

## Start Command (for Web Service)
npm run start

## Environment Variables to Set in Render Dashboard

Required environment variables:
- VITE_SUPABASE_URL: Your Supabase project URL
- VITE_SUPABASE_ANON_KEY: Your Supabase anonymous key
- VITE_OPENAI_API_KEY: Your OpenAI API key (for frontend - optional if using backend)
- SUPABASE_URL: Your Supabase project URL (for backend)
- SUPABASE_SERVICE_ROLE: Your Supabase service role key (for backend)
- OPENAI_API_KEY: Your OpenAI API key (for backend)

## Static Site Configuration

If deploying as a static site:
- Build Command: npm ci && npm run build
- Publish Directory: dist

## Notes

1. Make sure to set all environment variables in the Render dashboard
2. The app uses OpenAI API calls from the frontend (VITE_OPENAI_API_KEY)
3. Ensure your Supabase project has the schema set up (see supabase-schema.sql)
4. Run the migration in migrations/001_add_photo_name.sql for the photo name feature
