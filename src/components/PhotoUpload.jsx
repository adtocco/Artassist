import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { analyzePhoto } from '../lib/openai';
import './PhotoUpload.css';

export default function PhotoUpload({ onPhotoAnalyzed }) {
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

        setProgress(`Analyzing ${i + 1} of ${selectedFiles.length}...`);
        
        // Analyze with OpenAI
        const analysis = await analyzePhoto(publicUrl, promptType);

        // Save to database
        const { data: dbData, error: dbError } = await supabase
          .from('photo_analyses')
          .insert({
            user_id: user.id,
            photo_url: publicUrl,
            storage_path: fileName,
            analysis: analysis,
            prompt_type: promptType,
            file_name: file.name
          })
          .select()
          .single();

        if (dbError) throw dbError;

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

  return (
    <div className="photo-upload">
      <h2>Upload Photos for Analysis</h2>
      
      <div className="upload-controls">
        <div className="prompt-selector">
          <label>Analysis Type:</label>
          <select 
            value={promptType} 
            onChange={(e) => setPromptType(e.target.value)}
            disabled={uploading}
          >
            <option value="artist">Artistic Critique</option>
            <option value="gallery">Gallery Evaluation</option>
            <option value="socialMedia">Social Media Optimization</option>
          </select>
        </div>

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
