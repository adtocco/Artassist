import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './SavedSeries.css';

// Simple Markdown renderer (same as PhotoGallery)
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
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${idx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
      }
      parts.push(
        <img 
          key={`img-${idx}-${match.index}`} 
          src={match[2]} 
          alt={match[1]} 
          className="markdown-image"
          loading="lazy"
        />
      );
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < line.length) {
      parts.push(<span key={`text-${idx}-${lastIndex}`}>{line.slice(lastIndex)}</span>);
    }
    
    if (line.startsWith('### ')) {
      elements.push(<h4 key={idx}>{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={idx}>{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={idx}>{line.slice(2)}</h2>);
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(<p key={idx}><strong>{line.slice(2, -2)}</strong></p>);
    } else if (parts.length > 0) {
      elements.push(<p key={idx} className="markdown-line">{parts}</p>);
    } else if (line.trim() === '') {
      elements.push(<br key={idx} />);
    } else {
      const boldRegex = /\*\*([^*]+)\*\*/g;
      const formattedLine = line.replace(boldRegex, '<strong>$1</strong>');
      elements.push(<p key={idx} dangerouslySetInnerHTML={{ __html: formattedLine }} />);
    }
  });
  
  return elements;
}

export default function SavedSeries({ lang = 'fr' }) {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeries, setSelectedSeries] = useState(null);

  useEffect(() => {
    fetchSavedSeries();
  }, []);

  const fetchSavedSeries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('series_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSeries(data || []);
    } catch (err) {
      console.error('Error fetching saved series:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSeries = async (seriesItem) => {
    if (!confirm(lang === 'fr' ? 'Supprimer cette analyse ?' : 'Delete this analysis?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('series_analyses')
        .delete()
        .eq('id', seriesItem.id);

      if (error) throw error;
      setSeries(series.filter(s => s.id !== seriesItem.id));
      if (selectedSeries?.id === seriesItem.id) {
        setSelectedSeries(null);
      }
    } catch (err) {
      console.error('Error deleting series:', err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression' : 'Error deleting');
    }
  };

  const togglePublic = async (seriesItem) => {
    try {
      const newIsPublic = !seriesItem.is_public;
      const shareToken = newIsPublic && !seriesItem.share_token 
        ? crypto.randomUUID().replace(/-/g, '').substring(0, 32) 
        : seriesItem.share_token;

      const { data, error } = await supabase
        .from('series_analyses')
        .update({ 
          is_public: newIsPublic,
          share_token: shareToken
        })
        .eq('id', seriesItem.id)
        .select()
        .single();

      if (error) throw error;

      setSeries(series.map(s => s.id === seriesItem.id ? data : s));
      
      if (newIsPublic) {
        const shareUrl = `${window.location.origin}/share/${data.share_token}`;
        await navigator.clipboard.writeText(shareUrl);
        alert(lang === 'fr' 
          ? `Lien de partage copié :\n${shareUrl}` 
          : `Share link copied:\n${shareUrl}`);
      }
    } catch (err) {
      console.error('Error toggling public:', err);
    }
  };

  const copyShareLink = async (seriesItem) => {
    const shareUrl = `${window.location.origin}/share/${seriesItem.share_token}`;
    await navigator.clipboard.writeText(shareUrl);
    alert(lang === 'fr' ? 'Lien copié !' : 'Link copied!');
  };

  if (loading) {
    return <div className="loading">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>;
  }

  return (
    <div className="saved-series">
      <h2>📁 {lang === 'fr' ? 'Mes analyses sauvegardées' : 'My Saved Analyses'} ({series.length})</h2>
      
      {series.length === 0 ? (
        <p className="no-series">
          {lang === 'fr' 
            ? 'Aucune analyse sauvegardée. Analysez vos photos et sauvegardez les résultats !' 
            : 'No saved analyses. Analyze your photos and save the results!'}
        </p>
      ) : (
        <div className="series-list">
          {series.map((s) => (
            <div key={s.id} className="series-card" onClick={() => setSelectedSeries(s)}>
              <div className="series-card-header">
                <h3>{s.title}</h3>
                <span className={`visibility-badge ${s.is_public ? 'public' : 'private'}`}>
                  {s.is_public ? '🔗 Public' : '🔒 Privé'}
                </span>
              </div>
              <p className="series-date">
                {new Date(s.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
              {s.instructions && (
                <p className="series-instructions">📝 {s.instructions}</p>
              )}
              <div className="series-card-actions" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => togglePublic(s)} className="toggle-public-btn">
                  {s.is_public ? '🔒' : '🔗'}
                </button>
                {s.is_public && s.share_token && (
                  <button onClick={() => copyShareLink(s)} className="copy-link-btn">
                    📋
                  </button>
                )}
                <button onClick={() => deleteSeries(s)} className="delete-series-btn">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedSeries && (
        <div className="modal-overlay" onClick={() => setSelectedSeries(null)}>
          <div className="series-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedSeries(null)}>×</button>
            <h2>{selectedSeries.title}</h2>
            <p className="modal-date">
              {new Date(selectedSeries.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            {selectedSeries.instructions && (
              <p className="modal-instructions">
                <strong>{lang === 'fr' ? 'Consignes :' : 'Instructions:'}</strong> {selectedSeries.instructions}
              </p>
            )}
            <div className="recommendation-content markdown-content">
              {renderMarkdown(selectedSeries.analysis)}
            </div>
            {selectedSeries.is_public && selectedSeries.share_token && (
              <div className="share-section">
                <button onClick={() => copyShareLink(selectedSeries)} className="share-button">
                  🔗 {lang === 'fr' ? 'Copier le lien de partage' : 'Copy share link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
