# ⚡ Quick Start Guide

Get ArtAssist running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free)
- An OpenAI API key

## Step-by-Step Setup

### 1. Install Dependencies (30 seconds)

```bash
npm install
```

### 2. Set Up Supabase (2 minutes)

1. Go to https://supabase.com and sign up/in
2. Click "New Project"
3. Enter project details and create
4. Wait for project to initialize
5. Go to "SQL Editor" in the left menu
6. Click "New Query"
7. Copy the entire contents of `supabase-schema.sql`
8. Paste and click "Run"
9. You should see "Success. No rows returned"

### 3. Get Your Credentials (1 minute)

**Supabase Credentials:**
- In Supabase, click ⚙️ Settings (bottom left)
- Click "API" in the settings menu
- Copy "Project URL" 
- Copy "anon public" key (under Project API keys)

**OpenAI API Key:**
- Go to https://platform.openai.com
- Sign in or create account
- Click your profile (top right) → "API keys"
- Click "Create new secret key"
- Copy the key (you won't see it again!)

### 4. Configure Environment (30 seconds)

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-key-here
VITE_OPENAI_API_KEY=sk-...your-key-here
```

### 5. Run the App! (5 seconds)

```bash
npm run dev
```

Open http://localhost:5173 in your browser! 🎉

## First Use

1. Click "Sign Up"
2. Enter an email and password
3. Check your email for confirmation link
4. Click the link to confirm
5. Sign in with your credentials
6. Upload a photo!
7. Wait 10-20 seconds for AI analysis
8. Click the photo to see the full analysis

## Troubleshooting

### "Failed to fetch" on sign up
- Check your Supabase URL and key in `.env`
- Make sure you ran the schema SQL in Supabase

### "OpenAI API error"
- Check your OpenAI API key in `.env`
- Make sure your OpenAI account has credits

### Photos not uploading
- Check browser console for errors
- Verify the `photos` bucket exists in Supabase Storage
- The schema SQL should have created it automatically

### Can't sign in after confirming email
- Check your email confirmation link
- Try clicking "Forgot Password" to reset

## Next Steps

- Upload more photos and try different analysis types
- Use "Find Photo Series" with 3+ photos
- Read README.md for detailed documentation
- Check PRODUCTION_NOTES.md before deploying publicly

## Deploy to Production

See [RENDER_DEPLOY.md](RENDER_DEPLOY.md) for deployment instructions.

## Need Help?

- 📖 Full documentation: [README.md](README.md)
- 🚀 Deployment guide: [RENDER_DEPLOY.md](RENDER_DEPLOY.md)
- 📊 Production tips: [PRODUCTION_NOTES.md](PRODUCTION_NOTES.md)
- 📝 Complete overview: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

## Project Structure Overview

```
ArtAssist/
├── src/
│   ├── components/        # React components
│   ├── lib/              # Supabase & OpenAI clients
│   ├── App.jsx           # Main app
│   └── main.jsx          # Entry point
├── .env                  # Your credentials (don't commit!)
├── package.json          # Dependencies
└── vite.config.js        # Build config
```

Enjoy building with ArtAssist! 🎨✨
