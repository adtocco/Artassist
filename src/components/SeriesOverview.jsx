import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { findPhotoSeries } from '../lib/openai';
import { useAnalysisQueue } from './AnalysisQueue';
import './SeriesOverview.css';

// Simple Markdown renderer
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  lines.forEach((line, idx) => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = imageRegex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push(<span key={`t-${idx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
      parts.push(<img key={`i-${idx}-${match.index}`} src={match[2]} alt={match[1]} className="markdown-image" loading="lazy" />);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) parts.push(<span key={`t-${idx}-${lastIndex}`}>{line.slice(lastIndex)}</span>);
    if (line.startsWith('### ')) elements.push(<h4 key={idx}>{line.slice(4)}</h4>);
    else if (line.startsWith('## ')) elements.push(<h3 key={idx}>{line.slice(3)}</h3>);
    else if (line.startsWith('# ')) elements.push(<h2 key={idx}>{line.slice(2)}</h2>);
    else if (line.startsWith('**') && line.endsWith('**')) elements.push(<p key={idx}><strong>{line.slice(2, -2)}</strong></p>);
    else if (parts.length > 0) elements.push(<p key={idx} className="markdown-line">{parts}</p>);
    else if (line.trim() === '') elements.push(<br key={idx} />);
    else {
      const boldRegex = /\*\*([^*]+)\*\*/g;
      elements.push(<p key={idx} dangerouslySetInnerHTML={{ __html: line.replace(boldRegex, '<strong>$1</strong>') }} />);
    }
  });
  return elements;
}

export default function SeriesOverview({ lang = 'fr', onSendToWall = null, userSettings = null }) {
  const { enqueue } = useAnalysisQueue();
  const [seriesByCollection, setSeriesByCollection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const [seriesContext, setSeriesContext] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  useEffect(() => {
    fetchAllSeries();
  }, []);

  const fetchAllSeries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch all series with collection name and photo count
      const { data, error } = await supabase
        .from('collection_series')
        .select(`
          *,
          collections!inner(name),
          photo_count:series_photos(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by collection
      const grouped = {};
      (data || []).forEach(s => {
        const collName = s.collections?.name || (lang === 'fr' ? 'Sans collection' : 'No collection');
        if (!grouped[collName]) grouped[collName] = [];
        grouped[collName].push(s);
      });

      // Convert to array sorted by collection name
      const result = Object.entries(grouped)
        .map(([collectionName, series]) => ({ collectionName, series }))
        .sort((a, b) => a.collectionName.localeCompare(b.collectionName));

      setSeriesByCollection(result);
    } catch (err) {
      console.error('Error fetching series:', err);
    } finally {
      setLoading(false);
    }
  };

  const analyzeSeries = () => {
    if (seriesPhotos.length < 2) {
      alert(lang === 'fr' ? 'Il faut au moins 2 photos pour analyser une série' : 'You need at least 2 photos to analyze a series');
      return;
    }
    setAnalyzing(true);
    const seriesId = selectedSeries?.id;
    const context = [selectedSeries?.description, seriesContext].filter(Boolean).join('\n');

    enqueue({
      type: 'series',
      title: selectedSeries?.name || (lang === 'fr' ? 'Série' : 'Series'),
      execute: () => findPhotoSeries(seriesPhotos, lang, context, userSettings, 'series'),
      onComplete: async (result) => {
        setAnalysisResult(result);
        setAnalyzing(false);
        // Save analysis to DB
        await supabase
          .from('collection_series')
          .update({ analysis: result, updated_at: new Date().toISOString() })
          .eq('id', seriesId);
        // Update local state
        setSelectedSeries(prev => prev?.id === seriesId ? { ...prev, analysis: result } : prev);
        setSeriesByCollection(prev =>
          prev.map(g => ({
            ...g,
            series: g.series.map(s => s.id === seriesId ? { ...s, analysis: result } : s)
          }))
        );
      },
      onError: () => {
        setAnalyzing(false);
      },
    });
  };

  const openSeries = async (series) => {
    setSelectedSeries(series);
    setSeriesContext('');
    setAnalysisResult(series.analysis || null);
    // Fetch photos for this series
    try {
      const { data } = await supabase
        .from('series_photos')
        .select(`
          *,
          photo:photo_analyses(id, photo_url, photo_name, file_name)
        `)
        .eq('series_id', series.id)
        .order('position');
      setSeriesPhotos((data || []).map(sp => sp.photo).filter(Boolean));
    } catch (err) {
      console.error('Error fetching series photos:', err);
      setSeriesPhotos([]);
    }
  };

  const deleteSeries = async (e, series) => {
    e.stopPropagation();
    if (!confirm(lang === 'fr' ? 'Supprimer cette série ?' : 'Delete this series?')) return;
    try {
      await supabase.from('series_photos').delete().eq('series_id', series.id);
      await supabase.from('collection_series').delete().eq('id', series.id);
      setSeriesByCollection(prev =>
        prev.map(g => ({
          ...g,
          series: g.series.filter(s => s.id !== series.id)
        })).filter(g => g.series.length > 0)
      );
      if (selectedSeries?.id === series.id) {
        setSelectedSeries(null);
        setSeriesPhotos([]);
      }
    } catch (err) {
      console.error('Error deleting series:', err);
    }
  };

  const sendToWall = (photos) => {
    if (onSendToWall && photos.length > 0) {
      onSendToWall(photos.map(p => p.id), photos);
    }
  };

  // ── Drag & drop reorder ──
  const onReorderDragStart = (idx) => setDragIdx(idx);
  const onReorderDragOver = (e, idx) => { e.preventDefault(); if (dragOverIdx !== idx) setDragOverIdx(idx); };
  const onReorderDragLeave = () => setDragOverIdx(null);
  const onReorderDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };
  const onReorderDrop = async (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...seriesPhotos];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setSeriesPhotos(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    try {
      await Promise.all(reordered.map((photo, i) =>
        supabase.from('series_photos').update({ position: i }).eq('series_id', selectedSeries.id).eq('photo_id', photo.id)
      ));
    } catch (err) { console.error('Error saving photo order:', err); }
  };

  const totalSeries = seriesByCollection.reduce((sum, g) => sum + g.series.length, 0);

  if (loading) {
    return <div className="series-overview"><div className="loading">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div></div>;
  }

  return (
    <div className="series-overview">
      <h2>🎞 {lang === 'fr' ? 'Séries' : 'Series'} ({totalSeries})</h2>

      {totalSeries === 0 ? (
        <div className="series-overview-empty">
          <div className="series-overview-empty-icon">🎞</div>
          <p>{lang === 'fr'
            ? 'Aucune série créée. Ouvrez une collection et créez des séries à partir de vos photos.'
            : 'No series created. Open a collection and create series from your photos.'}</p>
        </div>
      ) : (
        <div className="series-overview-groups">
          {seriesByCollection.map(group => (
            <div key={group.collectionName} className="series-overview-group">
              <h3 className="series-overview-collection-name">📁 {group.collectionName}</h3>
              <div className="series-overview-grid">
                {group.series.map(s => (
                  <div key={s.id} className="series-overview-card" onClick={() => openSeries(s)}>
                    <div className="series-overview-card-header">
                      <span className="series-overview-card-name">{s.name}</span>
                      <span className="series-overview-card-count">
                        {s.photo_count?.[0]?.count || 0} 📷
                      </span>
                    </div>
                    {s.description && (
                      <p className="series-overview-card-desc">{s.description}</p>
                    )}
                    <div className="series-overview-card-footer">
                      <span className="series-overview-card-date">
                        {new Date(s.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {s.analysis && <span className="series-overview-analyzed-badge">✔ {lang === 'fr' ? 'Analysée' : 'Analyzed'}</span>}
                      <button className="series-overview-delete-btn" onClick={(e) => deleteSeries(e, s)} title={lang === 'fr' ? 'Supprimer' : 'Delete'}>
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedSeries && (
        <div className="modal-overlay" onClick={() => { setSelectedSeries(null); setSeriesPhotos([]); }}>
          <div className="series-overview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="series-overview-modal-header">
              <div>
                <h2>{selectedSeries.name}</h2>
                <span className="series-overview-modal-collection">
                  📁 {selectedSeries.collections?.name}
                </span>
              </div>
              <div className="series-overview-modal-actions">
                <button
                  className="series-overview-delete-btn"
                  onClick={(e) => deleteSeries(e, selectedSeries)}
                  title={lang === 'fr' ? 'Supprimer la série' : 'Delete series'}
                >
                  🗑 {lang === 'fr' ? 'Supprimer' : 'Delete'}
                </button>
                <button className="modal-close" onClick={() => { setSelectedSeries(null); setSeriesPhotos([]); }}>×</button>
              </div>
            </div>

            <textarea
              className="series-overview-desc-input"
              placeholder={lang === 'fr' ? 'Ajouter une description...' : 'Add a description...'}
              value={selectedSeries.description || ''}
              onChange={(e) => setSelectedSeries(prev => ({ ...prev, description: e.target.value }))}
              onBlur={async () => {
                try {
                  await supabase.from('collection_series').update({ description: selectedSeries.description?.trim() || null, updated_at: new Date().toISOString() }).eq('id', selectedSeries.id);
                  setSeriesByCollection(prev => prev.map(g => ({ ...g, series: g.series.map(s => s.id === selectedSeries.id ? { ...s, description: selectedSeries.description } : s) })));
                } catch (err) { console.error('Error saving description:', err); }
              }}
              rows={2}
            />

            {/* Photos grid — drag to reorder */}
            {seriesPhotos.length > 0 && (
              <div className="series-overview-photos">
                {seriesPhotos.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`series-overview-photo${dragIdx === idx ? ' dragging' : ''}${dragOverIdx === idx ? ' drag-over' : ''}`}
                    draggable
                    onDragStart={() => onReorderDragStart(idx)}
                    onDragOver={(e) => onReorderDragOver(e, idx)}
                    onDragLeave={onReorderDragLeave}
                    onDrop={() => onReorderDrop(idx)}
                    onDragEnd={onReorderDragEnd}
                  >
                    <div className="series-overview-photo-handle" title={lang === 'fr' ? 'Réordonner' : 'Reorder'}>⠿</div>
                    <img src={p.photo_url} alt={p.photo_name || p.file_name} loading="lazy" />
                    <span className="series-overview-photo-name">{p.photo_name || p.file_name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Analysis controls */}
            <div className="series-overview-analysis-controls">
              <textarea
                className="series-overview-context-input"
                placeholder={lang === 'fr' ? 'Contexte pour l\'analyse...' : 'Analysis context...'}
                value={seriesContext}
                onChange={(e) => setSeriesContext(e.target.value)}
                rows={2}
              />
              <div className="series-overview-modal-actions">
                <button
                  onClick={analyzeSeries}
                  disabled={analyzing || seriesPhotos.length < 2}
                  className="series-overview-analyze-btn"
                >
                  {analyzing
                    ? (lang === 'fr' ? '⏳ Analyse...' : '⏳ Analyzing...')
                    : '🎯 ' + (lang === 'fr' ? 'Analyser la série' : 'Analyze series')}
                </button>
                {onSendToWall && seriesPhotos.length > 0 && (
                  <button className="series-overview-wall-btn" onClick={() => sendToWall(seriesPhotos)}>
                    📐 {lang === 'fr' ? 'Créer un mur' : 'Create wall'}
                  </button>
                )}
              </div>
            </div>

            {/* Analysis result */}
            {analysisResult && (
              <div className="series-overview-analysis">
                <h3>📊 {lang === 'fr' ? 'Analyse' : 'Analysis'}</h3>
                <div className="recommendation-content markdown-content">
                  {renderMarkdown(analysisResult)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
