import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePhoto } from '../lib/openai';
import './PhotoUpload.css';

export default function PhotoUpload({ onPhotoAnalyzed, lang = 'fr', selectedCollection = null, userSettings = null }) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setError('');
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

      setProgress(lang === 'fr' ? 'Terminé !' : 'Complete!');
      setSelectedFiles([]);
      if (onPhotoAnalyzed) {
        onPhotoAnalyzed(results);
      }
      
      // Reset form
      setTimeout(() => {
        setProgress('');
      }, 2000);
      
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An error occurred during upload or analysis');
    } finally {
      setUploading(false);
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

        <div className="file-input-wrapper">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            id="photo-input"
          />
          <label htmlFor="photo-input" className={uploading ? 'disabled' : ''}>
            {selectedFiles.length > 0 
              ? (lang === 'fr' ? `${selectedFiles.length} fichier(s) sélectionné(s)` : `${selectedFiles.length} file(s) selected`)
              : (lang === 'fr' ? 'Choisir des photos' : 'Choose Photos')}
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

      {progress && <p className="progress-message">{progress}</p>}
      {error && <p className="error-message">{error}</p>}

      {selectedFiles.length > 0 && (
        <div className="selected-files">
          <h3>Selected Files:</h3>
          <ul>
            {selectedFiles.map((file, idx) => (
              <li key={idx}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
