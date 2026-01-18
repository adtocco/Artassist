import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { processItem } from './processor.js';

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
  try {
    const result = await processItem({ id, supabaseAdmin, openai });
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error processing item', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
