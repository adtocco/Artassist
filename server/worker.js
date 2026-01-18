import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { processItem } from './processor.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL || '8000', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

let running = true;
process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

async function loop() {
  while (running) {
    try {
      const { data: pending } = await supabaseAdmin
        .from('photo_analyses')
        .select('id')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (pending && pending.length > 0) {
        for (const p of pending) {
          try {
            console.log('Processing', p.id);
            await processItem({ id: p.id, supabaseAdmin, openai });
          } catch (err) {
            console.error('Failed to process', p.id, err.message);
          }
        }
      }
    } catch (err) {
      console.error('Worker loop error', err);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

loop().then(() => console.log('Worker stopped'));
