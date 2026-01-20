import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePhoto } from '../lib/openai';
import './PhotoUpload.css';

export default function PhotoUpload({ onPhotoAnalyzed, lang = 'fr', selectedCollection = null }) {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [promptType, setPromptType] = useState('artist');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setError('');
  };

  const uploadAndAnalyze = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one photo');
      return;
    }

    setUploading(true);
    setError('');
    const results = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Determine collection_id
      const collectionId = selectedCollection && selectedCollection !== 'none' 
        ? selectedCollection.id 
        : null;
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress(`Uploading ${i + 1} of ${selectedFiles.length}...`);
        
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

        // Try to create a short-lived signed URL so external services can reliably download the image
        const { data: signedData, error: signError } = await supabase.storage
          .from('photos')
          .createSignedUrl(fileName, 60); // signed URL valid for 60s

        const urlToAnalyze = signedData?.signedUrl || publicUrl;

        setProgress(`Analyzing ${i + 1} of ${selectedFiles.length}...`);

        // Prepare collection analysis options if a collection with analysis_type is selected
        const collectionAnalysis = selectedCollection && selectedCollection.analysis_type
          ? {
              type: selectedCollection.analysis_type,
              instructions: selectedCollection.analysis_instructions
            }
          : null;

        // Analyze with OpenAI (pass selected language and collection analysis type). Use signed URL when possible to avoid timeouts.
        const analysisResult = await analyzePhoto(urlToAnalyze, promptType, lang, collectionAnalysis);

        // Save photo to database (base photo info)
        const { data: dbData, error: dbError } = await supabase
          .from('photo_analyses')
          .insert({
            user_id: user.id,
            photo_url: publicUrl,
            storage_path: fileName,
            analysis: analysisResult.analysis, // Default/base analysis
            photo_name: analysisResult.name,
            prompt_type: promptType,
            file_name: file.name
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // If uploading to a specific collection, also create collection_photos entry
        if (collectionId) {
          const { error: collectionPhotoError } = await supabase
            .from('collection_photos')
            .insert({
              collection_id: collectionId,
              photo_id: dbData.id,
              analysis: collectionAnalysis ? analysisResult.analysis : null,
              analysis_type: selectedCollection?.analysis_type
            });
          
          if (collectionPhotoError) {
            console.error('Error adding to collection:', collectionPhotoError);
          }
        }

        results.push(dbData);
      }

      setProgress('Complete!');
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

  // Check if collection has its own analysis type
  const hasCollectionAnalysis = selectedCollection && selectedCollection.analysis_type && selectedCollection.analysis_type !== 'general';
  
  const getAnalysisTypeLabel = (type, lang) => {
    const labels = {
      general: { fr: 'Analyse générale', en: 'General analysis' },
      series: { fr: 'Analyse de série', en: 'Series analysis' },
      technique: { fr: 'Technique artistique', en: 'Artistic technique' },
      composition: { fr: 'Composition', en: 'Composition' },
      color: { fr: 'Palette de couleurs', en: 'Color palette' },
      style: { fr: 'Style et influences', en: 'Style and influences' },
      custom: { fr: 'Personnalisé', en: 'Custom' },
    };
    return labels[type]?.[lang] || labels[type]?.en || type;
  };

  return (
    <div className="photo-upload">
      <h2>{lang === 'fr' ? 'Téléverser des photos' : 'Upload Photos for Analysis'}</h2>
      
      <div className="upload-controls">
        {hasCollectionAnalysis ? (
          <div className="collection-analysis-info">
            <label>{lang === 'fr' ? "Type d'analyse (collection)" : 'Analysis Type (collection)'}:</label>
            <span className="analysis-type-badge">
              {getAnalysisTypeLabel(selectedCollection.analysis_type, lang)}
            </span>
            {selectedCollection.analysis_type === 'custom' && selectedCollection.analysis_instructions && (
              <span className="custom-instructions-preview" title={selectedCollection.analysis_instructions}>
                📝 {lang === 'fr' ? 'Instructions personnalisées' : 'Custom instructions'}
              </span>
            )}
          </div>
        ) : (
          <div className="prompt-selector">
            <label>{lang === 'fr' ? "Type d'analyse" : 'Analysis Type'}:</label>
            <select 
              value={promptType} 
              onChange={(e) => setPromptType(e.target.value)}
              disabled={uploading}
            >
              <option value="artist">{lang === 'fr' ? 'Critique artistique' : 'Artistic Critique'}</option>
              <option value="gallery">{lang === 'fr' ? 'Évaluation galerie' : 'Gallery Evaluation'}</option>
              <option value="socialMedia">{lang === 'fr' ? 'Réseaux sociaux' : 'Social Media Optimization'}</option>
            </select>
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
              ? `${selectedFiles.length} file(s) selected` 
              : 'Choose Photos'}
          </label>
        </div>

        <button 
          onClick={uploadAndAnalyze} 
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button"
        >
          {uploading ? 'Processing...' : 'Upload & Analyze'}
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
