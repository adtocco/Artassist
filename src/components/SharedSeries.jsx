import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './SharedSeries.css';

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

export default function SharedSeries({ shareToken }) {
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (shareToken) {
      fetchSharedSeries();
    }
  }, [shareToken]);

  const fetchSharedSeries = async () => {
    try {
      const { data, error } = await supabase
        .from('series_analyses')
        .select('*')
        .eq('share_token', shareToken)
        .eq('is_public', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setError('not_found');
        } else {
          throw error;
        }
      } else {
        setSeries(data);
      }
    } catch (err) {
      console.error('Error fetching shared series:', err);
      setError('error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="shared-series-container">
        <div className="shared-loading">
          <div className="spinner"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="shared-series-container">
        <div className="shared-error">
          <h1>🔒 Analyse non trouvée</h1>
          <p>Cette analyse n'existe pas ou n'est plus partagée publiquement.</p>
          <a href="/" className="back-home">← Retour à l'accueil</a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-series-container">
        <div className="shared-error">
          <h1>❌ Erreur</h1>
          <p>Une erreur s'est produite lors du chargement de l'analyse.</p>
          <a href="/" className="back-home">← Retour à l'accueil</a>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-series-container">
      <header className="shared-header">
        <a href="/" className="logo-link">
          <h1>🎨 ArtAssist</h1>
        </a>
        <span className="shared-badge">Analyse partagée</span>
      </header>

      <main className="shared-content">
        <div className="shared-series-card">
          <h2>{series.title}</h2>
          <p className="shared-date">
            Créée le {new Date(series.created_at).toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
          
          {series.instructions && (
            <div className="shared-instructions">
              <strong>📝 Consignes :</strong> {series.instructions}
            </div>
          )}

          <div className="shared-analysis markdown-content">
            {renderMarkdown(series.analysis)}
          </div>
        </div>

        <div className="shared-cta">
          <p>Envie d'analyser vos propres photos ?</p>
          <a href="/" className="cta-button">Essayer ArtAssist gratuitement</a>
        </div>
      </main>

      <footer className="shared-footer">
        <p>Powered by ArtAssist - AI Photo Analysis with GPT-4</p>
      </footer>
    </div>
  );
}
