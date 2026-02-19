import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePhoto } from '../lib/openai';
import './PhotoUpload.css';

const ANALYSIS_TIPS = {
  fr: [
    "L'IA examine la composition de votre photo...",
    "Analyse de la palette de couleurs en cours...",
    "Étude de l'éclairage et des contrastes...",
    "Évaluation de l'impact émotionnel...",
    "Recherche des lignes directrices...",
    "Analyse de la profondeur de champ...",
    "Examen du cadrage et de l'équilibre visuel...",
    "Évaluation de la qualité technique...",
    "Identification du style photographique...",
    "Rédaction de l'analyse détaillée..."
  ],
  en: [
    "AI is examining your photo's composition...",
    "Analyzing the color palette...",
    "Studying lighting and contrasts...",
    "Evaluating emotional impact...",
    "Looking for leading lines...",
    "Analyzing depth of field...",
    "Examining framing and visual balance...",
    "Evaluating technical quality...",
    "Identifying photographic style...",
    "Writing the detailed analysis..."
  ]
};

export default function PhotoUpload({ onPhotoAnalyzed, lang = 'fr', selectedCollection = null, userSettings = null }) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [analysisPhase, setAnalysisPhase] = useState(null); // 'uploading' | 'analyzing' | 'done' | null
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const tipIntervalRef = useRef(null);

  // Rotate tips during analysis
  useEffect(() => {
    if (analysisPhase === 'analyzing') {
      setCurrentTipIndex(0);
      tipIntervalRef.current = setInterval(() => {
        setCurrentTipIndex(prev => (prev + 1) % ANALYSIS_TIPS[lang].length);
      }, 3000);
    } else {
      if (tipIntervalRef.current) clearInterval(tipIntervalRef.current);
    }
    return () => { if (tipIntervalRef.current) clearInterval(tipIntervalRef.current); };
  }, [analysisPhase, lang]);

  // Elapsed time counter
  useEffect(() => {
    if (analysisPhase === 'uploading' || analysisPhase === 'analyzing') {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [analysisPhase]);

  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      setError('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Check if a valid collection is selected (not 'none' or null)
  const hasValidCollection = selectedCollection && selectedCollection !== 'none' && selectedCollection.id;

  const uploadAndAnalyze = async () => {
    if (selectedFiles.length === 0) {
      setError(lang === 'fr' ? 'Veuillez sélectionner au moins une photo' : 'Please select at least one photo');
      return;
    }

    setUploading(true);
    setError('');
    const results = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setAnalysisPhase('uploading');
        setProgress(lang === 'fr' 
          ? `Téléversement ${i + 1} sur ${selectedFiles.length}...`
          : `Uploading ${i + 1} of ${selectedFiles.length}...`);
        
        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('photos')
          .getPublicUrl(fileName);

        let analysisResult = null;
        
        // Only analyze if a collection is selected
        if (hasValidCollection) {
          // Try to create a short-lived signed URL so external services can reliably download the image
          const { data: signedData } = await supabase.storage
            .from('photos')
            .createSignedUrl(fileName, 60);

          const urlToAnalyze = signedData?.signedUrl || publicUrl;

          setAnalysisPhase('analyzing');
          setProgress(lang === 'fr' 
            ? `Analyse ${i + 1} sur ${selectedFiles.length}...`
            : `Analyzing ${i + 1} of ${selectedFiles.length}...`);

          // Prepare collection analysis options
          const collectionAnalysis = {
            type: selectedCollection.analysis_type || 'artist',
            instructions: selectedCollection.analysis_instructions
          };

          // Analyze with OpenAI
          analysisResult = await analyzePhoto(urlToAnalyze, 'artist', lang, collectionAnalysis, userSettings);
        }

        // Save photo to database
        const { data: dbData, error: dbError } = await supabase
          .from('photo_analyses')
          .insert({
            user_id: user.id,
            photo_url: publicUrl,
            storage_path: fileName,
            analysis: analysisResult?.analysis || null,
            photo_name: analysisResult?.name || file.name.replace(/\.[^/.]+$/, ''), // Use filename without extension if no analysis
            prompt_type: 'artist', // Always use 'artist' as prompt_type
            file_name: file.name,
            analysis_detail_level: userSettings?.analysis_detail_level || null,
            analysis_tone: userSettings?.analysis_tone || null,
            analysis_focus_areas: userSettings?.focus_areas || []
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // If uploading to a specific collection, also create collection_photos entry
        if (hasValidCollection) {
          const { error: collectionPhotoError } = await supabase
            .from('collection_photos')
            .insert({
              collection_id: selectedCollection.id,
              photo_id: dbData.id,
              analysis: analysisResult?.analysis || null,
              analysis_type: selectedCollection.analysis_type,
              analysis_detail_level: userSettings?.analysis_detail_level || null,
              analysis_tone: userSettings?.analysis_tone || null,
              analysis_focus_areas: userSettings?.focus_areas || []
            });
          
          if (collectionPhotoError) {
            console.error('Error adding to collection:', collectionPhotoError);
          }
        }

        results.push(dbData);
      }

      setAnalysisPhase('done');
      setProgress(lang === 'fr' ? 'Terminé !' : 'Complete!');
      setSelectedFiles([]);
      if (onPhotoAnalyzed) {
        onPhotoAnalyzed(results);
      }
      
      // Reset form
      setTimeout(() => {
        setProgress('');
        setAnalysisPhase(null);
      }, 2500);
      
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred during upload or analysis');
    } finally {
      setUploading(false);
      if (error) {
        setAnalysisPhase(null);
      }
    }
  };

  const getAnalysisTypeLabel = (type, lang) => {
    const labels = {
      artist: { fr: 'Artistique', en: 'Artistic' },
      socialMedia: { fr: 'Réseaux Sociaux', en: 'Social Media' },
    };
    return labels[type]?.[lang] || labels[type]?.en || type;
  };

  return (
    <div className="photo-upload">
      <h2>{lang === 'fr' ? 'Téléverser des photos' : 'Upload Photos'}</h2>
      
      <div className="upload-controls">
        {hasValidCollection ? (
          <div className="collection-analysis-info">
            <label>{lang === 'fr' ? "Collection" : 'Collection'}:</label>
            <span className="collection-name-badge">{selectedCollection.name}</span>
            <label>{lang === 'fr' ? "Type d'analyse" : 'Analysis Type'}:</label>
            <span className="analysis-type-badge">
              {getAnalysisTypeLabel(selectedCollection.analysis_type || 'general', lang)}
            </span>
            {selectedCollection.analysis_type === 'custom' && selectedCollection.analysis_instructions && (
              <span className="custom-instructions-preview" title={selectedCollection.analysis_instructions}>
                📝 {lang === 'fr' ? 'Instructions personnalisées' : 'Custom instructions'}
              </span>
            )}
          </div>
        ) : (
          <div className="no-collection-warning">
            <span className="warning-icon">⚠️</span>
            <span>
              {lang === 'fr' 
                ? 'Sélectionnez une collection pour analyser les photos lors du téléversement'
                : 'Select a collection to analyze photos on upload'}
            </span>
          </div>
        )}

        <div 
          className={`file-input-wrapper ${isDragging ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            id="photo-input"
          />
          <label htmlFor="photo-input" className={uploading ? 'disabled' : ''}>
            {isDragging 
              ? (lang === 'fr' ? '📥 Déposez vos photos ici' : '📥 Drop your photos here')
              : selectedFiles.length > 0 
                ? (lang === 'fr' ? `${selectedFiles.length} fichier(s) sélectionné(s) — cliquez pour en ajouter` : `${selectedFiles.length} file(s) selected — click to add more`)
                : (lang === 'fr' ? '📷 Choisir des photos ou glisser-déposer ici' : '📷 Choose photos or drag & drop here')}
          </label>
        </div>

        <button 
          onClick={uploadAndAnalyze} 
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button"
        >
          {uploading 
            ? (lang === 'fr' ? 'Traitement...' : 'Processing...') 
            : hasValidCollection 
              ? (lang === 'fr' ? 'Téléverser et analyser' : 'Upload & Analyze')
              : (lang === 'fr' ? 'Téléverser (sans analyse)' : 'Upload (no analysis)')}
        </button>
      </div>

      {analysisPhase && (
        <div className={`analysis-overlay ${analysisPhase}`}>
          <div className="analysis-overlay-content">
            {analysisPhase === 'uploading' && (
              <>
                <div className="upload-animation">
                  <div className="upload-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                </div>
                <p className="analysis-status-text">{progress}</p>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill uploading" />
                </div>
              </>
            )}

            {analysisPhase === 'analyzing' && (
              <>
                <div className="analyzing-animation">
                  <div className="eye-icon">
                    <svg viewBox="0 0 64 64" fill="none">
                      <ellipse className="eye-shape" cx="32" cy="32" rx="28" ry="18" stroke="url(#eyeGrad)" strokeWidth="3" />
                      <circle className="eye-pupil" cx="32" cy="32" r="8" fill="url(#eyeGrad)" />
                      <circle className="eye-glint" cx="36" cy="28" r="2.5" fill="white" />
                      <defs>
                        <linearGradient id="eyeGrad" x1="0" y1="0" x2="64" y2="64">
                          <stop offset="0%" stopColor="#667eea" />
                          <stop offset="100%" stopColor="#764ba2" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className="scan-line" />
                </div>
                <p className="analysis-status-text">{progress}</p>
                <p className="analysis-tip" key={currentTipIndex}>
                  {ANALYSIS_TIPS[lang][currentTipIndex]}
                </p>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill analyzing" />
                </div>
                <span className="elapsed-time">
                  {elapsedSeconds}s
                </span>
              </>
            )}

            {analysisPhase === 'done' && (
              <>
                <div className="done-animation">
                  <svg className="checkmark" viewBox="0 0 52 52">
                    <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                    <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                </div>
                <p className="analysis-status-text done">{progress}</p>
              </>
            )}
          </div>
        </div>
      )}
      {error && <p className="error-message">{error}</p>}

      {selectedFiles.length > 0 && !analysisPhase && (
        <div className="selected-files-preview">
          {selectedFiles.map((file, idx) => (
            <div key={idx} className="file-preview-item">
              <img src={URL.createObjectURL(file)} alt={file.name} />
              <button className="remove-file" onClick={() => removeFile(idx)} title={lang === 'fr' ? 'Retirer' : 'Remove'}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
