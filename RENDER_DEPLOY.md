# Render Deployment Configuration

## Build Command
npm install && npm run build

## Start Command (for Web Service)
npm run preview

## Environment Variables to Set in Render Dashboard

Required environment variables:
- VITE_SUPABASE_URL: Your Supabase project URL
- VITE_SUPABASE_ANON_KEY: Your Supabase anonymous key
- VITE_OPENAI_API_KEY: Your OpenAI API key

## Static Site Configuration

If deploying as a static site:
- Build Command: npm install && npm run build
- Publish Directory: dist

## Notes

1. Make sure to set all environment variables in the Render dashboard
2. For production, consider moving OpenAI API calls to a backend service
   to avoid exposing the API key in the browser
3. Ensure your Supabase project has the schema set up (see supabase-schema.sql)
