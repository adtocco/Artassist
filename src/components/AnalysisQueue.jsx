import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { findPhotoSeries, analyzePhoto } from '../lib/openai';
import './AnalysisQueue.css';

export default function AnalysisQueue({ lang = 'fr' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('photo_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    const iv = setInterval(fetchItems, 5000);
    return () => clearInterval(iv);
  }, []);

  const processNow = async (item) => {
    try {
      // Claim item by updating status -> processing if still pending
      const { data: claimed, error: claimErr } = await supabase
        .from('photo_analyses')
        .update({ status: 'processing', processor: 'manual', analysis_started_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (claimErr || !claimed) {
        alert('Unable to claim item (maybe already processing)');
        return;
      }

      // create signed url
      const { data: signedData } = await supabase.storage.from('photos').createSignedUrl(item.storage_path, 300);
      const urlToAnalyze = signedData?.signedUrl || item.photo_url;

      const analysis = await analyzePhoto(urlToAnalyze, item.prompt_type, lang);

      await supabase.from('photo_analyses').update({ status: 'done', analysis, analysis_finished_at: new Date().toISOString(), processor: 'manual' }).eq('id', item.id);
      fetchItems();
    } catch (err) {
      console.error('Processing failed:', err);
      await supabase.from('photo_analyses').update({ status: 'error', error_message: err.message }).eq('id', item.id);
      fetchItems();
    }
  };

  return (
    <div className="analysis-queue">
      <h3>Analyse Queue</h3>
      {loading && <p>Loading queue...</p>}
      {!loading && items.length === 0 && <p>No queued items.</p>}
      <ul>
        {items.map((it) => (
          <li key={it.id} className={`queue-item ${it.status}`}>
            <div className="meta">
              <strong>{it.file_name}</strong> — <em>{it.status}</em>
            </div>
            <div className="actions">
              {it.status === 'pending' && (
                <button onClick={() => processNow(it)}>Process now</button>
              )}
              {it.status === 'processing' && <span>Processing…</span>}
              {it.status === 'done' && <button onClick={() => navigator.clipboard.writeText(it.analysis || '')}>Copy analysis</button>}
            </div>
            <div className="small">{it.prompt_type} • {it.created_at}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
