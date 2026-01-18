import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { processItem } from './processor.js';
import { spawn } from 'child_process';

const app = express();
app.use(bodyParser.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !OPENAI_API_KEY) {
  console.warn('Warning: SUPABASE_URL, SUPABASE_SERVICE_ROLE and OPENAI_API_KEY must be provided as env vars.');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false }
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Process a single queued item by id
app.post('/api/process/:id', async (req, res) => {
  const id = req.params.id;
  const lang = req.body?.lang || 'fr';
  try {
    const result = await processItem({ id, supabaseAdmin, openai, lang });
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error processing item', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;

// Serve frontend static files when present (production build in ../dist)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');

// If a dist folder exists, serve it and fall back to index.html for SPA routes
import fs from 'fs';
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: '1d' }));

  // Keep API and health endpoints intact; for all other GETs, return index.html
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}
app.listen(port, () => console.log(`Server listening on ${port}`));
