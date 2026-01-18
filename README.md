# ArtAssist 🎨

AI-Powered Artistic Photo Analysis Tool

## Overview

ArtAssist is a web application that allows photographers and artists to upload their photos for AI-powered artistic analysis using GPT-4. The tool provides three different analysis perspectives:

- **Artistic Critique**: Expert art criticism focusing on composition, lighting, color theory, and artistic merit
- **Gallery Evaluation**: Curator perspective assessing exhibition potential and market appeal
- **Social Media Optimization**: Strategic analysis for online engagement and viral potential

Additionally, ArtAssist can analyze your entire photo collection to identify which photos work well together as series and which individual photos are most impactful.

## Features

- 📸 **Photo Upload**: Upload single or multiple photos for analysis
- 🤖 **AI Analysis**: Get detailed artistic feedback using GPT-4's vision capabilities
- 💾 **Cloud Storage**: All photos stored securely in Supabase Storage (CDN)
- 🔐 **Authentication**: Secure user authentication with Supabase Auth
- 📊 **Series Recommendations**: AI identifies which photos work well together
- 🎯 **Multiple Perspectives**: Choose from artist, gallery, or social media analysis types
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React with Vite
- **Backend/Database**: Supabase (PostgreSQL, Auth, Storage)
- **AI**: OpenAI GPT-4 with Vision
- **Deployment**: Render

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- Supabase account
- OpenAI API account

### 1. Clone the Repository

```bash
git clone https://github.com/adtocco/Artassist.git
cd Artassist
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project in [Supabase](https://supabase.com)
2. Go to the SQL Editor and run the SQL from `supabase-schema.sql`
3. This will create:
   - `photo_analyses` table
   - `photos` storage bucket
   - Required policies for Row Level Security

### 4. Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Fill in your credentials in `.env`:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENAI_API_KEY=your_openai_api_key
```

You can find your Supabase credentials in:
- Project Settings → API → Project URL
- Project Settings → API → Project API keys (anon/public key)

### 5. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Usage

1. **Sign Up/Sign In**: Create an account or sign in with your email
2. **Upload Photos**: Select one or more photos and choose an analysis type
3. **View Analysis**: Click on any photo in the gallery to see its AI analysis
4. **Find Series**: Click "Find Photo Series" to get AI recommendations on which photos work well together
5. **Manage Photos**: Delete photos you no longer need

## Deployment to Render

See [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) for detailed deployment instructions.

Quick steps:
1. Create a new Static Site or Web Service in Render
2. Connect your GitHub repository
3. Set build command: `npm install && npm run build`
4. Set publish directory: `dist` (for static site)
5. Add environment variables in Render dashboard
6. Deploy!

## Database Schema

### photo_analyses Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| photo_url | TEXT | Public URL of the photo |
| storage_path | TEXT | Path in Supabase storage |
| file_name | TEXT | Original filename |
| analysis | TEXT | AI-generated analysis |
| prompt_type | TEXT | Type of analysis (artist/gallery/socialMedia) |
| created_at | TIMESTAMP | Creation timestamp |

## Security Notes

⚠️ **Important**: The current implementation uses `dangerouslyAllowBrowser: true` for the OpenAI client, which exposes the API key in the browser. This is acceptable for development and demos, but for production use, you should:

1. Create a backend API service
2. Move OpenAI API calls to the backend
3. Have the frontend call your backend API instead
4. Never expose API keys in the frontend code

## Project Structure

```
Artassist/
├── src/
│   ├── components/
│   │   ├── Auth.jsx              # Authentication component
│   │   ├── Auth.css
│   │   ├── PhotoUpload.jsx       # Photo upload & analysis
│   │   ├── PhotoUpload.css
│   │   ├── PhotoGallery.jsx      # Photo gallery & viewing
│   │   └── PhotoGallery.css
│   ├── lib/
│   │   ├── supabase.js           # Supabase client
│   │   └── openai.js             # OpenAI integration
│   ├── App.jsx                   # Main app component
│   ├── App.css
│   ├── main.jsx                  # Entry point
│   └── index.css                 # Global styles
├── public/
├── .env.example                  # Environment variables template
├── supabase-schema.sql           # Database schema
├── RENDER_DEPLOY.md              # Deployment guide
├── package.json
└── vite.config.js
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ using React, Supabase, and OpenAI
