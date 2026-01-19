import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { findPhotoSeries, analyzePhoto } from '../lib/openai';
import './PhotoGallery.css';

export default function PhotoGallery({ refreshTrigger, lang = 'fr' }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [seriesRecommendation, setSeriesRecommendation] = useState(null);
  const [analyzingSeries, setAnalyzingSeries] = useState(false);
  const [seriesInstructions, setSeriesInstructions] = useState('');
  const [reanalyzingId, setReanalyzingId] = useState(null);

  useEffect(() => {
    fetchPhotos();
  }, [refreshTrigger]);

  const fetchPhotos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('photo_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPhotos(data || []);
    } catch (err) {
      console.error('Error fetching photos:', err);
    } finally {
      setLoading(false);
    }
  };

  const analyzeCollection = async () => {
    if (photos.length < 2) {
      alert('You need at least 2 photos to analyze series recommendations');
      return;
    }

    setAnalyzingSeries(true);
    try {
      const recommendation = await findPhotoSeries(photos, lang, seriesInstructions);
      setSeriesRecommendation(recommendation);
    } catch (err) {
      console.error('Error analyzing series:', err);
      alert('Error analyzing photo series: ' + err.message);
    } finally {
      setAnalyzingSeries(false);
    }
  };

  const deletePhoto = async (photo) => {
    if (!confirm('Are you sure you want to delete this photo and its analysis?')) {
      return;
    }

    try {
      // Delete from storage
      await supabase.storage
        .from('photos')
        .remove([photo.storage_path]);

      // Delete from database
      const { error } = await supabase
        .from('photo_analyses')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;

      // Refresh list
      fetchPhotos();
      if (selectedPhoto?.id === photo.id) {
        setSelectedPhoto(null);
      }
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Error deleting photo: ' + err.message);
    }
  };

  const reanalyzePhoto = async (photo, e) => {
    if (e) e.stopPropagation();
    
    setReanalyzingId(photo.id);
    try {
      // Get a signed URL for better reliability
      const { data: signedData } = await supabase.storage
        .from('photos')
        .createSignedUrl(photo.storage_path, 60);

      const urlToAnalyze = signedData?.signedUrl || photo.photo_url;

      // Re-analyze with OpenAI
      const analysisResult = await analyzePhoto(urlToAnalyze, photo.prompt_type, lang);

      // Update in database
      const { error } = await supabase
        .from('photo_analyses')
        .update({
          analysis: analysisResult.analysis,
          photo_name: analysisResult.name
        })
        .eq('id', photo.id);

      if (error) throw error;

      // Build updated photo object
      const updatedPhoto = {
        ...photo,
        analysis: analysisResult.analysis,
        photo_name: analysisResult.name
      };

      // Update local state
      setPhotos(photos.map(p => p.id === photo.id ? updatedPhoto : p));
      if (selectedPhoto?.id === photo.id) {
        setSelectedPhoto(updatedPhoto);
      }
    } catch (err) {
      console.error('Error re-analyzing photo:', err);
      alert(lang === 'fr' ? 'Erreur lors de la ré-analyse : ' + err.message : 'Error re-analyzing photo: ' + err.message);
    } finally {
      setReanalyzingId(null);
    }
  };

  if (loading) {
    return <div className="loading">Loading your photos...</div>;
  }

  if (photos.length === 0) {
    return (
      <div className="empty-gallery">
        <p>No photos analyzed yet. Upload some photos to get started!</p>
      </div>
    );
  }

  return (
    <div className="photo-gallery">
      <div className="gallery-header">
        <h2>Your Photo Collection ({photos.length})</h2>
        <div className="series-controls">
          <label htmlFor="series-instructions">Consignes (optionnel) :</label>
          <textarea
            id="series-instructions"
            value={seriesInstructions}
            onChange={(e) => setSeriesInstructions(e.target.value)}
            placeholder={lang === 'fr' ? "Ex: Cherche une série cohérente autour de la couleur et du contraste" : "E.g.: Find a series focusing on color and contrast coherence"}
            rows={2}
          />

          <button 
            onClick={analyzeCollection}
            disabled={analyzingSeries || photos.length < 2}
            className="analyze-series-button"
          >
            {analyzingSeries ? (lang === 'fr' ? 'Analyse en cours...' : 'Analyzing...') : '🎯 ' + (lang === 'fr' ? 'Trouver une série' : 'Find Photo Series')}
          </button>
        </div>
      </div>

      {seriesRecommendation && (
        <div className="series-recommendation">
          <h3>📊 Collection Analysis & Series Recommendations</h3>
          <div className="recommendation-content">
            {seriesRecommendation.split('\n').map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
          <button 
            onClick={() => setSeriesRecommendation(null)}
            className="close-recommendation"
          >
            Close
          </button>
        </div>
      )}

      <div className="gallery-grid">
        {photos.map((photo) => (
          <div 
            key={photo.id} 
            className={`gallery-item ${reanalyzingId === photo.id ? 'reanalyzing' : ''}`}
            onClick={() => setSelectedPhoto(photo)}
          >
            {reanalyzingId === photo.id && (
              <div className="reanalyze-overlay">
                <div className="reanalyze-spinner"></div>
                <span>{lang === 'fr' ? 'Analyse en cours...' : 'Analyzing...'}</span>
              </div>
            )}
            {photo.photo_name && (
              <div className="photo-name">{photo.photo_name}</div>
            )}
            <img src={photo.photo_url} alt={photo.photo_name || photo.file_name} />
            <div className="gallery-item-overlay">
              <span className="prompt-badge">{photo.prompt_type}</span>
              <span className="file-name">{photo.file_name}</span>
              <div className="thumbnail-actions">
                <button
                  className="thumbnail-reanalyze"
                  onClick={(e) => reanalyzePhoto(photo, e)}
                  disabled={reanalyzingId === photo.id}
                  aria-label={lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
                  title={lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
                >
                  {reanalyzingId === photo.id ? '⏳' : '🔄'}
                </button>
                <button
                  className="thumbnail-delete"
                  onClick={(e) => { e.stopPropagation(); deletePhoto(photo); }}
                  aria-label={`Delete ${photo.file_name}`}
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="modal-close"
              onClick={() => setSelectedPhoto(null)}
            >
              ×
            </button>
            
            <div className="modal-photo">
              <img src={selectedPhoto.photo_url} alt={selectedPhoto.file_name} />
            </div>
            
            <div className="modal-details">
              <h3>{selectedPhoto.photo_name || selectedPhoto.file_name}</h3>
              {selectedPhoto.photo_name && (
                <span className="modal-file-name">{selectedPhoto.file_name}</span>
              )}
              <span className="modal-prompt-type">
                Analysis Type: {selectedPhoto.prompt_type}
              </span>
              <p className="modal-date">
                {new Date(selectedPhoto.created_at).toLocaleString()}
              </p>
              
              {(() => {
                let analysis;
                try {
                  analysis = JSON.parse(selectedPhoto.analysis);
                } catch {
                  analysis = null;
                }
                
                if (analysis && analysis.score !== undefined) {
                  return (
                    <div className="analysis-structured">
                      <div className="analysis-header">
                        <div className="analysis-score">
                          <span className="score-value">{analysis.score}</span>
                          <span className="score-label">/100</span>
                        </div>
                        <p className="analysis-summary">{analysis.summary}</p>
                      </div>
                      
                      <div className="analysis-sections">
                        {analysis.composition && (
                          <div className="analysis-section">
                            <h5>🎯 {lang === 'fr' ? 'Composition' : 'Composition'}</h5>
                            <p>{analysis.composition}</p>
                          </div>
                        )}
                        {analysis.lighting && (
                          <div className="analysis-section">
                            <h5>💡 {lang === 'fr' ? 'Éclairage' : 'Lighting'}</h5>
                            <p>{analysis.lighting}</p>
                          </div>
                        )}
                        {analysis.colors && (
                          <div className="analysis-section">
                            <h5>🎨 {lang === 'fr' ? 'Couleurs' : 'Colors'}</h5>
                            <p>{analysis.colors}</p>
                          </div>
                        )}
                        {analysis.emotion && (
                          <div className="analysis-section">
                            <h5>💫 {lang === 'fr' ? 'Émotion' : 'Emotion'}</h5>
                            <p>{analysis.emotion}</p>
                          </div>
                        )}
                        {analysis.technique && (
                          <div className="analysis-section">
                            <h5>⚙️ {lang === 'fr' ? 'Technique' : 'Technique'}</h5>
                            <p>{analysis.technique}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="analysis-lists">
                        {analysis.strengths && analysis.strengths.length > 0 && (
                          <div className="analysis-list strengths">
                            <h5>✅ {lang === 'fr' ? 'Points forts' : 'Strengths'}</h5>
                            <ul>
                              {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {analysis.improvements && analysis.improvements.length > 0 && (
                          <div className="analysis-list improvements">
                            <h5>💡 {lang === 'fr' ? 'Améliorations' : 'Improvements'}</h5>
                            <ul>
                              {analysis.improvements.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div className="analysis-content">
                    <h4>{lang === 'fr' ? 'Analyse' : 'Analysis'}:</h4>
                    <p>{selectedPhoto.analysis}</p>
                  </div>
                );
              })()}

              <div className="modal-actions">
                <button 
                  className="reanalyze-button"
                  onClick={(e) => reanalyzePhoto(selectedPhoto, e)}
                  disabled={reanalyzingId === selectedPhoto.id}
                >
                  {reanalyzingId === selectedPhoto.id 
                    ? (lang === 'fr' ? '⏳ Analyse en cours...' : '⏳ Analyzing...') 
                    : (lang === 'fr' ? '🔄 Ré-analyser' : '🔄 Re-analyze')}
                </button>
                <button 
                  className="delete-button"
                  onClick={() => deletePhoto(selectedPhoto)}
                >
                  🗑️ {lang === 'fr' ? 'Supprimer' : 'Delete Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
