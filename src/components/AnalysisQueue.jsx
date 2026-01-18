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

  const getThumbUrl = (item) => {
    if (item.photo_url) return item.photo_url;
    try {
      const { data } = supabase.storage.from('photos').getPublicUrl(item.storage_path || '');
      return data?.publicUrl || '';
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="analysis-queue">
      <h3>Analyse Queue</h3>
      {loading && <p className="muted">Loading queue...</p>}
      {!loading && items.length === 0 && <p className="muted">No queued items.</p>}
      <ul>
        {items.map((it) => (
          <li key={it.id} className={`queue-item ${it.status}`}>
            <div className="thumb">
              {getThumbUrl(it) ? (
                <img src={getThumbUrl(it)} alt={it.file_name} />
              ) : (
                <div className="thumb-fallback">IMG</div>
              )}
            </div>

            <div className="content">
              <div className="row top">
                <div className="title">{it.file_name}</div>
                <div className={`badge status-${it.status}`}>{it.status}</div>
              </div>

              <div className="row meta">
                <div className="prompt-type">{it.prompt_type}</div>
                <div className="created">{it.created_at ? new Date(it.created_at).toLocaleString(lang) : ''}</div>
              </div>

              <div className="row actions">
                {it.status === 'pending' && (
                  <button className="btn primary" onClick={() => processNow(it)}>Process now</button>
                )}
                {it.status === 'processing' && <span className="muted">Processing…</span>}
                {it.status === 'done' && (
                  <>
                    <button className="btn" onClick={() => navigator.clipboard.writeText(it.analysis || '')}>Copy analysis</button>
                    <button className="btn subtle" onClick={() => navigator.clipboard.writeText(it.series || '')}>Copy series</button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
