import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { findPhotoSeries } from '../lib/openai';
import './PhotoGallery.css';

export default function PhotoGallery({ refreshTrigger, lang = 'fr' }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [seriesRecommendation, setSeriesRecommendation] = useState(null);
  const [analyzingSeries, setAnalyzingSeries] = useState(false);
  const [seriesHint, setSeriesHint] = useState('');

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
      const recommendation = await findPhotoSeries(photos, lang, seriesHint.trim());
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

  const reanalyzePhoto = async (photo) => {
    if (!confirm('Relancer l\'analyse pour cette photo ?')) return;
    try {
      // Reset analysis fields and mark as pending for worker to pick up
      const updates = {
        status: 'pending',
        analysis: null,
        analysis_started_at: null,
        analysis_finished_at: null,
        error_message: null,
        processor: null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('photo_analyses')
        .update(updates)
        .eq('id', photo.id);

      if (error) throw error;

      fetchPhotos();
      alert('Photo remise en file pour analyse.');
    } catch (err) {
      console.error('Error reanalyzing photo:', err);
      alert('Erreur lors de la relance de l\'analyse: ' + err.message);
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Indicate a theme or hint (e.g. 'moody portraits', 'high-contrast')"
            value={seriesHint}
            onChange={(e) => setSeriesHint(e.target.value)}
            disabled={analyzingSeries}
            style={{ padding: '6px', borderRadius: 6, border: '1px solid #ccc', minWidth: 220 }}
          />
          <button 
            onClick={analyzeCollection}
            disabled={analyzingSeries || photos.length < 2}
            className="analyze-series-button"
          >
            {analyzingSeries ? 'Analyzing...' : '🎯 Find Photo Series'}
          </button>
        </div>
      </div>

      {seriesRecommendation && (
        <div className="series-recommendation">
          <h3>📊 Collection Analysis & Series Recommendations</h3>
          {seriesHint && (
            <p className="series-hint" style={{ fontStyle: 'italic', color: '#555' }}>
              Indication utilisée : {seriesHint}
            </p>
          )}
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
            className="gallery-item"
            onClick={() => setSelectedPhoto(photo)}
          >
            <img src={photo.photo_url} alt={photo.file_name} />
            <div className="gallery-item-overlay">
              <span className="prompt-badge">{photo.prompt_type}</span>
              <span className="file-name">{photo.file_name}</span>
              <button
                className="reanalyze-button"
                onClick={(e) => { e.stopPropagation(); reanalyzePhoto(photo); }}
                aria-label={`Reanalyze ${photo.file_name}`}
              >
                🔄
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
              <h3>{selectedPhoto.file_name}</h3>
              <span className="modal-prompt-type">
                Analysis Type: {selectedPhoto.prompt_type}
              </span>
              <p className="modal-date">
                {new Date(selectedPhoto.created_at).toLocaleString()}
              </p>
              
              <div className="analysis-content">
                <h4>Analysis:</h4>
                <p>{selectedPhoto.analysis}</p>
              </div>

              <button 
                className="reanalyze-button modal-reanalyze"
                onClick={() => reanalyzePhoto(selectedPhoto)}
              >
                🔄 Relancer l'analyse
              </button>

              <button 
                className="delete-button"
                onClick={() => deletePhoto(selectedPhoto)}
              >
                🗑️ Delete Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
