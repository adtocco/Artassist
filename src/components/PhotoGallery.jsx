import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { findPhotoSeries, analyzePhoto } from '../lib/openai';
import './PhotoGallery.css';

// Simple Markdown renderer for images and text
function renderMarkdown(text) {
  if (!text) return null;
  
  const lines = text.split('\n');
  const elements = [];
  
  lines.forEach((line, idx) => {
    // Match markdown images: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = imageRegex.exec(line)) !== null) {
      // Add text before the image
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${idx}-${lastIndex}`}>{line.slice(lastIndex, match.index)}</span>);
      }
      // Add the image
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
    
    // Add remaining text after last image
    if (lastIndex < line.length) {
      parts.push(<span key={`text-${idx}-${lastIndex}`}>{line.slice(lastIndex)}</span>);
    }
    
    // Handle headers
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
      // Handle bold text within line
      const boldRegex = /\*\*([^*]+)\*\*/g;
      const formattedLine = line.replace(boldRegex, '<strong>$1</strong>');
      elements.push(<p key={idx} dangerouslySetInnerHTML={{ __html: formattedLine }} />);
    }
  });
  
  return elements;
}

export default function PhotoGallery({ refreshTrigger, lang = 'fr', selectedCollection = null, collections = [], userSettings = null, onPhotosChanged = null, onSendToWall = null }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [seriesRecommendation, setSeriesRecommendation] = useState(null);
  const [analyzingSeries, setAnalyzingSeries] = useState(false);
  const [seriesInstructions, setSeriesInstructions] = useState('');
  const [reanalyzingIds, setReanalyzingIds] = useState(new Set());
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [seriesTitle, setSeriesTitle] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  // Series state
  const [seriesList, setSeriesList] = useState([]);
  const [showCreateSeriesDialog, setShowCreateSeriesDialog] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [newSeriesDescription, setNewSeriesDescription] = useState('');
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [activeSeries, setActiveSeries] = useState(null);
  const [seriesPhotos, setSeriesPhotos] = useState([]);
  const [analyzingSeriesItem, setAnalyzingSeriesItem] = useState(false);
  const [seriesAnalysisResult, setSeriesAnalysisResult] = useState(null);
  const [showSeriesPanel, setShowSeriesPanel] = useState(false);
  const [seriesContext, setSeriesContext] = useState('');
  const [draggedPhotoIdx, setDraggedPhotoIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [gridColumns, setGridColumns] = useState(4);
  const [createdSeriesNames, setCreatedSeriesNames] = useState(new Set());

  // Gallery-to-series drag state
  const [galleryDragPhotoId, setGalleryDragPhotoId] = useState(null);
  const [dropTargetSeriesId, setDropTargetSeriesId] = useState(null);
  const [dropTargetNewSeries, setDropTargetNewSeries] = useState(false);

  // Keyboard navigation for modal
  useEffect(() => {
    if (!selectedPhoto) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedPhoto(null);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = photos.findIndex(p => p.id === selectedPhoto.id);
        if (idx < photos.length - 1) setSelectedPhoto(photos[idx + 1]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = photos.findIndex(p => p.id === selectedPhoto.id);
        if (idx > 0) setSelectedPhoto(photos[idx - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhoto, photos]);

  useEffect(() => {
    fetchPhotos();
    if (selectedCollection?.id) {
      fetchSeriesList();
    } else {
      setSeriesList([]);
      setActiveSeries(null);
      setSeriesAnalysisResult(null);
      setShowSeriesPanel(false);
    }
  }, [refreshTrigger, selectedCollection]);

  const fetchPhotos = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // If viewing a specific collection, fetch via collection_photos junction table
      if (selectedCollection?.id) {
        const { data: collectionPhotos, error } = await supabase
          .from('collection_photos')
          .select(`
            id,
            analysis,
            analysis_type,
            analysis_detail_level,
            analysis_tone,
            analysis_focus_areas,
            photo:photo_analyses(*)
          `)
          .eq('collection_id', selectedCollection.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        // Flatten the data and merge collection-specific analysis
        const photos = (collectionPhotos || []).map(cp => ({
          ...cp.photo,
          collection_photo_id: cp.id,
          collection_analysis: cp.analysis,
          collection_analysis_type: cp.analysis_type,
          // Prioritize collection settings over photo settings
          analysis_detail_level: cp.analysis_detail_level || cp.photo.analysis_detail_level,
          analysis_tone: cp.analysis_tone || cp.photo.analysis_tone,
          analysis_focus_areas: cp.analysis_focus_areas || cp.photo.analysis_focus_areas
        }));
        
        setPhotos(photos);
      } else if (selectedCollection === 'none') {
        // Photos not in any collection - check via collection_photos
        const { data: allPhotos, error } = await supabase
          .from('photo_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Get all photo IDs that are in at least one collection
        const { data: photosInCollections } = await supabase
          .from('collection_photos')
          .select('photo_id');
        
        const photoIdsInCollections = new Set((photosInCollections || []).map(p => p.photo_id));
        
        // Filter to only photos not in any collection
        const uncategorizedPhotos = (allPhotos || []).filter(p => !photoIdsInCollections.has(p.id));
        setPhotos(uncategorizedPhotos);
      } else {
        // All photos
        const { data, error } = await supabase
          .from('photo_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPhotos(data || []);
      }
      
      setSelectedPhotos(new Set()); // Clear selection when changing collection
    } catch (err) {
      console.error('Error fetching photos:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---- Series functions ----
  const fetchSeriesList = async () => {
    if (!selectedCollection?.id) return;
    try {
      const { data, error } = await supabase
        .from('collection_series')
        .select(`
          *,
          photo_count:series_photos(count)
        `)
        .eq('collection_id', selectedCollection.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSeriesList(data || []);
    } catch (err) {
      console.error('Error fetching series:', err);
    }
  };

  const createSeries = async () => {
    if (!newSeriesName.trim() || selectedPhotos.size === 0) return;
    setCreatingSeries(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: series, error } = await supabase
        .from('collection_series')
        .insert({
          collection_id: selectedCollection.id,
          user_id: user.id,
          name: newSeriesName.trim(),
          description: newSeriesDescription.trim() || null
        })
        .select()
        .single();
      if (error) throw error;

      // Add selected photos to the series
      const entries = Array.from(selectedPhotos).map(photoId => ({
        series_id: series.id,
        photo_id: photoId
      }));
      const { error: linkError } = await supabase
        .from('series_photos')
        .insert(entries);
      if (linkError) throw linkError;

      setShowCreateSeriesDialog(false);
      setNewSeriesName('');
      setNewSeriesDescription('');
      setSelectedPhotos(new Set());
      fetchSeriesList();
    } catch (err) {
      console.error('Error creating series:', err);
      alert(lang === 'fr' ? 'Erreur lors de la création de la série' : 'Error creating series');
    } finally {
      setCreatingSeries(false);
    }
  };

  const deleteSeries = async (seriesId) => {
    const msg = lang === 'fr'
      ? 'Supprimer cette série ? Les photos ne seront pas supprimées.'
      : 'Delete this series? Photos will not be deleted.';
    if (!confirm(msg)) return;
    try {
      const { error } = await supabase
        .from('collection_series')
        .delete()
        .eq('id', seriesId);
      if (error) throw error;
      if (activeSeries?.id === seriesId) {
        setActiveSeries(null);
        setSeriesPhotos([]);
        setSeriesAnalysisResult(null);
      }
      fetchSeriesList();
    } catch (err) {
      console.error('Error deleting series:', err);
    }
  };

  const viewSeries = async (series) => {
    setActiveSeries(series);
    setSeriesAnalysisResult(series.analysis || null);
    try {
      const { data, error } = await supabase
        .from('series_photos')
        .select(`
          id,
          position,
          photo:photo_analyses(*)
        `)
        .eq('series_id', series.id)
        .order('position', { ascending: true });
      if (error) throw error;
      setSeriesPhotos((data || []).map(sp => ({ ...sp.photo, _series_photo_id: sp.id })));
    } catch (err) {
      console.error('Error fetching series photos:', err);
    }
  };

  // Drag & Drop handlers for series photo reordering
  const handleDragStart = (idx) => {
    setDraggedPhotoIdx(idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
  };

  const handleDrop = async (targetIdx) => {
    if (draggedPhotoIdx === null || draggedPhotoIdx === targetIdx) {
      setDraggedPhotoIdx(null);
      setDragOverIdx(null);
      return;
    }
    // Reorder locally
    const reordered = [...seriesPhotos];
    const [moved] = reordered.splice(draggedPhotoIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setSeriesPhotos(reordered);
    setDraggedPhotoIdx(null);
    setDragOverIdx(null);

    // Persist new positions to DB
    try {
      const updates = reordered.map((photo, i) => 
        supabase
          .from('series_photos')
          .update({ position: i })
          .eq('series_id', activeSeries.id)
          .eq('photo_id', photo.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Error saving photo order:', err);
    }
  };

  const handleDragEnd = () => {
    setDraggedPhotoIdx(null);
    setDragOverIdx(null);
  };

  // ---- Gallery-to-Series drag & drop ----
  const handleGalleryDragStart = (e, photoId) => {
    setGalleryDragPhotoId(photoId);
    // If this photo is part of a selection, we'll drag all selected
    const dragIds = selectedPhotos.has(photoId) && selectedPhotos.size > 1
      ? Array.from(selectedPhotos)
      : [photoId];
    e.dataTransfer.setData('application/json', JSON.stringify(dragIds));
    e.dataTransfer.effectAllowed = 'copy';
    // Show drag count badge via a custom drag image
    if (dragIds.length > 1) {
      const badge = document.createElement('div');
      badge.textContent = `${dragIds.length} photos`;
      badge.style.cssText = 'position:absolute;top:-1000px;background:#6c63ff;color:white;padding:6px 14px;border-radius:20px;font-weight:600;font-size:14px;';
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 40, 20);
      setTimeout(() => document.body.removeChild(badge), 0);
    }
  };

  const handleGalleryDragEnd = () => {
    setGalleryDragPhotoId(null);
    setDropTargetSeriesId(null);
    setDropTargetNewSeries(false);
  };

  const handleSeriesDragOver = (e, seriesId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetSeriesId(seriesId);
  };

  const handleSeriesDragLeave = (e) => {
    // Only clear if we're actually leaving the element (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetSeriesId(null);
    }
  };

  const handleSeriesDrop = async (e, seriesId) => {
    e.preventDefault();
    setDropTargetSeriesId(null);
    try {
      const dragIds = JSON.parse(e.dataTransfer.getData('application/json'));
      const entries = dragIds.map(photoId => ({
        series_id: seriesId,
        photo_id: photoId
      }));
      const { error } = await supabase
        .from('series_photos')
        .upsert(entries, { onConflict: 'series_id,photo_id', ignoreDuplicates: true });
      if (error) throw error;
      setSelectedPhotos(new Set());
      fetchSeriesList();
      if (activeSeries?.id === seriesId) {
        viewSeries(activeSeries);
      }
    } catch (err) {
      console.error('Error adding photos to series via drag:', err);
    }
  };

  const handleNewSeriesDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetNewSeries(true);
  };

  const handleNewSeriesDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetNewSeries(false);
    }
  };

  const handleNewSeriesDrop = async (e) => {
    e.preventDefault();
    setDropTargetNewSeries(false);
    try {
      const dragIds = JSON.parse(e.dataTransfer.getData('application/json'));
      const name = prompt(lang === 'fr' ? 'Nom de la nouvelle série :' : 'New series name:');
      if (!name || !name.trim()) return;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: series, error } = await supabase
        .from('collection_series')
        .insert({
          collection_id: selectedCollection.id,
          user_id: user.id,
          name: name.trim()
        })
        .select()
        .single();
      if (error) throw error;

      const entries = dragIds.map((photoId, i) => ({
        series_id: series.id,
        photo_id: photoId,
        position: i
      }));
      await supabase
        .from('series_photos')
        .upsert(entries, { onConflict: 'series_id,photo_id', ignoreDuplicates: true });

      setSelectedPhotos(new Set());
      fetchSeriesList();
    } catch (err) {
      console.error('Error creating series from drop:', err);
    }
  };

  const removePhotoFromSeries = async (photoId) => {
    if (!activeSeries) return;
    try {
      const { error } = await supabase
        .from('series_photos')
        .delete()
        .eq('series_id', activeSeries.id)
        .eq('photo_id', photoId);
      if (error) throw error;
      setSeriesPhotos(prev => prev.filter(p => p.id !== photoId));
      fetchSeriesList();
    } catch (err) {
      console.error('Error removing photo from series:', err);
    }
  };

  const addSelectedToSeries = async (seriesId) => {
    if (selectedPhotos.size === 0) return;
    try {
      const entries = Array.from(selectedPhotos).map(photoId => ({
        series_id: seriesId,
        photo_id: photoId
      }));
      // Use upsert to ignore duplicates
      const { error } = await supabase
        .from('series_photos')
        .upsert(entries, { onConflict: 'series_id,photo_id', ignoreDuplicates: true });
      if (error) throw error;
      setSelectedPhotos(new Set());
      fetchSeriesList();
      if (activeSeries?.id === seriesId) {
        viewSeries(activeSeries);
      }
    } catch (err) {
      console.error('Error adding photos to series:', err);
      alert(lang === 'fr' ? 'Erreur lors de l\'ajout' : 'Error adding photos');
    }
  };

  const analyzeSeriesItem = async () => {
    if (seriesPhotos.length < 2) {
      alert(lang === 'fr' ? 'Il faut au moins 2 photos pour analyser une série' : 'You need at least 2 photos to analyze a series');
      return;
    }
    setAnalyzingSeriesItem(true);
    try {
      const context = [activeSeries?.description, seriesContext].filter(Boolean).join('\n');
      const result = await findPhotoSeries(seriesPhotos, lang, context, userSettings, 'series');
      setSeriesAnalysisResult(result);
      // Save analysis to DB
      await supabase
        .from('collection_series')
        .update({ analysis: result, updated_at: new Date().toISOString() })
        .eq('id', activeSeries.id);
    } catch (err) {
      console.error('Error analyzing series:', err);
      alert(lang === 'fr' ? 'Erreur lors de l\'analyse : ' + err.message : 'Error analyzing: ' + err.message);
    } finally {
      setAnalyzingSeriesItem(false);
    }
  };

  const togglePhotoSelection = (photoId, e) => {
    e.stopPropagation();
    const newSelection = new Set(selectedPhotos);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotos(newSelection);
  };

  const movePhotosToCollection = async (targetCollection) => {
    try {
      const photoIds = Array.from(selectedPhotos);
      
      // If removing from current collection (targetCollection is null or 'none')
      if (!targetCollection || targetCollection === 'none') {
        // Remove from collection_photos if viewing a specific collection
        if (selectedCollection?.id) {
          const { error } = await supabase
            .from('collection_photos')
            .delete()
            .eq('collection_id', selectedCollection.id)
            .in('photo_id', photoIds);
          
          if (error) throw error;
        }
      } else {
        // Add to new collection via collection_photos
        // First check which photos are already in the target collection
        const { data: existingEntries } = await supabase
          .from('collection_photos')
          .select('photo_id')
          .eq('collection_id', targetCollection.id)
          .in('photo_id', photoIds);
        
        const existingPhotoIds = new Set((existingEntries || []).map(e => e.photo_id));
        const newPhotoIds = photoIds.filter(id => !existingPhotoIds.has(id));
        
        if (newPhotoIds.length > 0) {
          // Insert new entries
          const newEntries = newPhotoIds.map(photoId => ({
            collection_id: targetCollection.id,
            photo_id: photoId,
            analysis_type: targetCollection.analysis_type
          }));
          
          const { error } = await supabase
            .from('collection_photos')
            .insert(newEntries);
          
          if (error) throw error;
        }
      }

      setSelectedPhotos(new Set());
      setShowMoveDialog(false);
      fetchPhotos(); // Refresh list
      // Notify parent to refresh collections (counts & covers)
      if (onPhotosChanged) onPhotosChanged();
    } catch (err) {
      console.error('Error moving photos:', err);
      alert(lang === 'fr' ? 'Erreur lors du déplacement' : 'Error moving photos');
    }
  };

  const exportPhotosAsJson = () => {
    const exportData = photos.map(({ photo_url, ...photo }) => photo);
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const collectionName = selectedCollection?.name || 'photos';
    a.download = `${collectionName.replace(/\s+/g, '_')}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const analyzeCollection = async () => {
    if (photos.length < 2) {
      alert('You need at least 2 photos to analyze series recommendations');
      return;
    }

    setAnalyzingSeries(true);
    try {
      const recommendation = await findPhotoSeries(photos, lang, seriesInstructions, userSettings, 'collection');
      setSeriesRecommendation(recommendation);
    } catch (err) {
      console.error('Error analyzing series:', err);
      alert('Error analyzing photo series: ' + err.message);
    } finally {
      setAnalyzingSeries(false);
    }
  };

  // Parse collection analysis JSON
  const parseCollectionAnalysis = (raw) => {
    if (!raw) return null;
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null; // Not JSON — fallback to markdown
    }
  };

  // Find photo objects by name from analysis
  const resolvePhotosByNames = (photoNames) => {
    return photoNames
      .map(name => photos.find(p => (p.photo_name || p.file_name) === name))
      .filter(Boolean);
  };

  // Create a series directly from analysis suggestion
  const createSeriesFromAnalysis = async (seriesData) => {
    if (!selectedCollection?.id) return;
    const matchedPhotos = resolvePhotosByNames(seriesData.photo_names);
    if (matchedPhotos.length < 2) {
      alert(lang === 'fr' ? 'Impossible de retrouver les photos de cette série' : 'Cannot find photos for this series');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: series, error } = await supabase
        .from('collection_series')
        .insert({
          collection_id: selectedCollection.id,
          user_id: user.id,
          name: seriesData.name,
          description: seriesData.description || null
        })
        .select()
        .single();
      if (error) throw error;

      const entries = matchedPhotos.map((photo, i) => ({
        series_id: series.id,
        photo_id: photo.id,
        position: i
      }));
      await supabase.from('series_photos').insert(entries);
      fetchSeriesList();
      setCreatedSeriesNames(prev => new Set([...prev, seriesData.name]));
      return series;
    } catch (err) {
      console.error('Error creating series from analysis:', err);
      alert(lang === 'fr' ? 'Erreur lors de la création' : 'Error creating series');
      return null;
    }
  };

  // Create series + wall + open wall
  const createSeriesAndWall = async (seriesData) => {
    const series = await createSeriesFromAnalysis(seriesData);
    if (!series || !onSendToWall) return;
    const matchedPhotos = resolvePhotosByNames(seriesData.photo_names);
    onSendToWall(matchedPhotos.map(p => p.id), matchedPhotos);
  };

  const saveSeriesAnalysis = async (makePublic = false) => {
    if (!seriesTitle.trim()) {
      alert(lang === 'fr' ? 'Veuillez donner un titre à cette analyse' : 'Please provide a title for this analysis');
      return;
    }

    setSavingAnalysis(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate share token if public
      const shareToken = makePublic ? crypto.randomUUID().replace(/-/g, '').substring(0, 32) : null;
      
      const { data, error } = await supabase
        .from('series_analyses')
        .insert({
          user_id: user.id,
          title: seriesTitle.trim(),
          analysis: seriesRecommendation,
          photo_ids: photos.map(p => p.id),
          instructions: seriesInstructions || null,
          is_public: makePublic,
          share_token: shareToken
        })
        .select()
        .single();

      if (error) throw error;

      setShowSaveDialog(false);
      setSeriesTitle('');
      
      if (makePublic && data.share_token) {
        const shareUrl = `${window.location.origin}/share/${data.share_token}`;
        await navigator.clipboard.writeText(shareUrl);
        alert(lang === 'fr' 
          ? `Analyse sauvegardée ! Le lien de partage a été copié dans le presse-papier :\n${shareUrl}` 
          : `Analysis saved! Share link copied to clipboard:\n${shareUrl}`);
      } else {
        alert(lang === 'fr' ? 'Analyse sauvegardée avec succès !' : 'Analysis saved successfully!');
      }
    } catch (err) {
      console.error('Error saving series analysis:', err);
      alert(lang === 'fr' ? 'Erreur lors de la sauvegarde : ' + err.message : 'Error saving: ' + err.message);
    } finally {
      setSavingAnalysis(false);
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
      // Notify parent to refresh collections (counts & covers)
      if (onPhotosChanged) onPhotosChanged();
    } catch (err) {
      console.error('Error deleting photo:', err);
      alert('Error deleting photo: ' + err.message);
    }
  };

  const removeFromCollection = async (photo) => {
    const msg = lang === 'fr'
      ? 'Retirer cette photo de la collection ? (la photo ne sera pas supprimée)'
      : 'Remove this photo from the collection? (the photo will not be deleted)';
    if (!confirm(msg)) return;

    try {
      const { error } = await supabase
        .from('collection_photos')
        .delete()
        .eq('collection_id', selectedCollection.id)
        .eq('photo_id', photo.id);

      if (error) throw error;

      fetchPhotos();
      if (selectedPhoto?.id === photo.id) {
        setSelectedPhoto(null);
      }
      // Notify parent to refresh collections (counts & covers)
      if (onPhotosChanged) onPhotosChanged();
    } catch (err) {
      console.error('Error removing from collection:', err);
      alert(lang === 'fr' ? 'Erreur lors du retrait : ' + err.message : 'Error removing: ' + err.message);
    }
  };

  const reanalyzePhoto = async (photo, e) => {
    if (e) e.stopPropagation();
    
    setReanalyzingIds(prev => new Set(prev).add(photo.id));
    try {
      // Get a signed URL for better reliability
      const { data: signedData } = await supabase.storage
        .from('photos')
        .createSignedUrl(photo.storage_path, 60);

      const urlToAnalyze = signedData?.signedUrl || photo.photo_url;

      // Prepare collection analysis if we're in a collection view
      let collectionAnalysis = null;
      if (selectedCollection?.id && selectedCollection.analysis_type) {
        collectionAnalysis = {
          type: selectedCollection.analysis_type,
          instructions: selectedCollection.analysis_instructions
        };
      }

      // Re-analyze with OpenAI
      const analysisResult = await analyzePhoto(urlToAnalyze, photo.prompt_type || 'artist', lang, collectionAnalysis, userSettings);

      // Update in database
      const { error: updateError } = await supabase
        .from('photo_analyses')
        .update({
          analysis: analysisResult.analysis,
          photo_name: analysisResult.name,
          analysis_detail_level: userSettings?.analysis_detail_level || null,
          analysis_tone: userSettings?.analysis_tone || null,
          analysis_focus_areas: userSettings?.focus_areas || []
        })
        .eq('id', photo.id);

      if (updateError) throw updateError;

      // If we're in a collection view, also update the collection-specific analysis
      if (selectedCollection?.id && photo.collection_photo_id) {
        await supabase
          .from('collection_photos')
          .update({
            analysis: analysisResult.analysis,
            analysis_type: selectedCollection.analysis_type,
            analysis_detail_level: userSettings?.analysis_detail_level || null,
            analysis_tone: userSettings?.analysis_tone || null,
            analysis_focus_areas: userSettings?.focus_areas || []
          })
          .eq('id', photo.collection_photo_id);
      }

    } catch (err) {
      console.error('Error re-analyzing photo:', err);
      alert(lang === 'fr' ? 'Erreur lors de la ré-analyse : ' + err.message : 'Error re-analyzing photo: ' + err.message);
    } finally {
      setReanalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(photo.id);
        // If this was the last one, refresh the photo list
        if (next.size === 0) {
          fetchPhotos();
        }
        return next;
      });
    }
  };

  const reanalyzeBulk = async () => {
    const ids = Array.from(selectedPhotos);
    const photosToReanalyze = photos.filter(p => ids.includes(p.id));
    if (photosToReanalyze.length === 0) return;

    const msg = lang === 'fr'
      ? `Ré-analyser ${photosToReanalyze.length} photo(s) ? Cela peut prendre du temps.`
      : `Re-analyze ${photosToReanalyze.length} photo(s)? This may take a while.`;
    if (!confirm(msg)) return;

    setSelectedPhotos(new Set());
    
    // Mark all as reanalyzing
    setReanalyzingIds(prev => {
      const next = new Set(prev);
      photosToReanalyze.forEach(p => next.add(p.id));
      return next;
    });

    // Process sequentially to avoid API rate limits
    for (const photo of photosToReanalyze) {
      await reanalyzePhoto(photo);
    }
  };

  // Update modal when photos change after reanalysis
  useEffect(() => {
    if (selectedPhoto && reanalyzingIds.size === 0) {
      const updatedPhoto = photos.find(p => p.id === selectedPhoto.id);
      if (updatedPhoto && JSON.stringify(updatedPhoto) !== JSON.stringify(selectedPhoto)) {
        console.log('🔄 Updating modal with fresh photo data');
        setSelectedPhoto(updatedPhoto);
      }
    }
  }, [photos, reanalyzingIds]);

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-skeleton">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="empty-gallery">
        {selectedCollection?.id ? (
          <>
            <div className="empty-icon">📂</div>
            <h3>{lang === 'fr' ? 'Collection vide' : 'Empty collection'}</h3>
            <p>{lang === 'fr' 
              ? 'Téléversez des photos ci-dessus ou ajoutez-en depuis vos photos existantes.'
              : 'Upload photos above or add existing ones to this collection.'}</p>
          </>
        ) : (
          <>
            <div className="empty-icon">📸</div>
            <h3>{lang === 'fr' ? 'Aucune photo' : 'No photos yet'}</h3>
            <p>{lang === 'fr' 
              ? 'Créez une collection dans le panneau de gauche, puis téléversez vos premières photos pour commencer.'
              : 'Create a collection in the left panel, then upload your first photos to get started.'}</p>
            <div className="onboarding-steps">
              <div className="onboarding-step">
                <span className="step-number">1</span>
                <span>{lang === 'fr' ? 'Créez une collection' : 'Create a collection'}</span>
              </div>
              <div className="onboarding-step">
                <span className="step-number">2</span>
                <span>{lang === 'fr' ? 'Sélectionnez-la' : 'Select it'}</span>
              </div>
              <div className="onboarding-step">
                <span className="step-number">3</span>
                <span>{lang === 'fr' ? 'Téléversez vos photos' : 'Upload your photos'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="photo-gallery">
      <div className="gallery-header">
        <h2>
          {selectedCollection?.name || (selectedCollection === 'none' 
            ? (lang === 'fr' ? 'Sans collection' : 'No Collection')
            : (lang === 'fr' ? 'Toutes les photos' : 'All Photos')
          )} ({photos.length})
        </h2>
        
        {/* Selection actions */}
        {selectedPhotos.size > 0 && (
          <div className="selection-actions">
            <span className="selection-count">
              {selectedPhotos.size} {lang === 'fr' ? 'sélectionnée(s)' : 'selected'}
            </span>
            <button 
              onClick={() => setShowMoveDialog(true)}
              className="move-photos-btn"
            >
              📁 {lang === 'fr' ? 'Déplacer' : 'Move'}
            </button>
            <button 
              onClick={reanalyzeBulk}
              className="reanalyze-photos-btn"
              disabled={reanalyzingIds.size > 0}
            >
              🔄 {lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
            </button>
            {selectedCollection?.id && (
              <button
                onClick={() => setShowCreateSeriesDialog(true)}
                className="create-series-from-selection-btn"
              >
                📋 {lang === 'fr' ? 'Créer une série' : 'Create Series'}
              </button>
            )}
            {selectedCollection?.id && seriesList.length > 0 && (
              <div className="add-to-series-dropdown">
                <select
                  onChange={(e) => { if (e.target.value) { addSelectedToSeries(e.target.value); e.target.value = ''; } }}
                  defaultValue=""
                >
                  <option value="" disabled>{lang === 'fr' ? '+ Ajouter à une série' : '+ Add to series'}</option>
                  {seriesList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {onSendToWall && (
              <button
                onClick={() => onSendToWall(Array.from(selectedPhotos), photos)}
                className="send-to-wall-btn"
              >
                📐 {lang === 'fr' ? 'Mur' : 'Wall'}
              </button>
            )}
            <button 
              onClick={() => setSelectedPhotos(new Set())}
              className="clear-selection-btn"
            >
              ✕
            </button>
          </div>
        )}

        {selectedCollection?.id && (
          <>
            <button 
              onClick={analyzeCollection}
              disabled={analyzingSeries || photos.length < 2}
              className="analyze-series-button"
            >
              {analyzingSeries ? (lang === 'fr' ? 'Analyse en cours...' : 'Analyzing...') : '🎯 ' + (lang === 'fr' ? 'Analyser la collection' : 'Analyze Collection')}
            </button>
            <button
              onClick={exportPhotosAsJson}
              disabled={photos.length === 0}
              className="export-json-button"
              title={lang === 'fr' ? 'Exporter les données en JSON' : 'Export data as JSON'}
            >
              📥 {lang === 'fr' ? 'Exporter JSON' : 'Export JSON'}
            </button>
          </>
        )}

        <div className="grid-size-toggle">
          {[2, 4, 8].map(cols => (
            <button
              key={cols}
              className={`grid-size-btn ${gridColumns === cols ? 'active' : ''}`}
              onClick={() => setGridColumns(cols)}
              title={`${cols} ${lang === 'fr' ? 'par ligne' : 'per row'}`}
            >
              {cols}
            </button>
          ))}
        </div>
      </div>

      {/* Series Panel - replaced by sidebar below */}

      {/* Create Series Dialog */}
      {showCreateSeriesDialog && (
        <div className="modal-overlay" onClick={() => setShowCreateSeriesDialog(false)}>
          <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>📋 {lang === 'fr' ? 'Créer une série' : 'Create a Series'}</h3>
            <p className="create-series-info">
              {selectedPhotos.size} {lang === 'fr' ? 'photo(s) sélectionnée(s)' : 'photo(s) selected'}
            </p>
            <input
              type="text"
              placeholder={lang === 'fr' ? 'Nom de la série...' : 'Series name...'}
              value={newSeriesName}
              onChange={(e) => setNewSeriesName(e.target.value)}
              className="series-title-input"
              autoFocus
            />
            <textarea
              placeholder={lang === 'fr' ? 'Description / instructions pour l\'analyse (optionnel)...' : 'Description / analysis instructions (optional)...'}
              value={newSeriesDescription}
              onChange={(e) => setNewSeriesDescription(e.target.value)}
              className="series-description-input"
              rows={3}
            />
            <div className="save-dialog-buttons">
              <button
                onClick={createSeries}
                disabled={creatingSeries || !newSeriesName.trim()}
                className="save-private-button"
              >
                📋 {lang === 'fr' ? 'Créer' : 'Create'}
              </button>
              <button
                onClick={() => setShowCreateSeriesDialog(false)}
                className="cancel-button"
              >
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {seriesRecommendation && (() => {
        const parsed = parseCollectionAnalysis(seriesRecommendation);
        if (parsed && parsed.series) {
          // Structured JSON rendering
          return (
            <div className="series-recommendation">
              <h3>📊 {lang === 'fr' ? 'Analyse de la collection' : 'Collection Analysis'}</h3>

              {/* Global analysis */}
              {parsed.global_analysis && (
                <div className="analysis-global">
                  <p>{parsed.global_analysis}</p>
                </div>
              )}

              {/* Proposed series */}
              <h4 className="analysis-section-title">🎞 {lang === 'fr' ? 'Séries proposées' : 'Proposed Series'}</h4>
              <div className="analysis-series-list">
                {parsed.series.map((s, idx) => {
                  const matchedPhotos = resolvePhotosByNames(s.photo_names);
                  return (
                    <div key={idx} className="analysis-series-card">
                      <div className="analysis-series-card-header">
                        <h5>{s.name}</h5>
                        <span className="analysis-series-card-count">{s.photo_names.length} 📷</span>
                      </div>
                      <p className="analysis-series-card-desc">{s.description}</p>
                      {s.reasoning && <p className="analysis-series-card-reasoning">💡 {s.reasoning}</p>}
                      
                      <div className="analysis-series-photos">
                        {matchedPhotos.map(p => (
                          <div key={p.id} className="analysis-series-photo">
                            <img src={p.photo_url} alt={p.photo_name || p.file_name} />
                            <span>{p.photo_name || p.file_name}</span>
                          </div>
                        ))}
                        {s.photo_names.length > matchedPhotos.length && (
                          <span className="analysis-series-missing">
                            ⚠️ {s.photo_names.length - matchedPhotos.length} {lang === 'fr' ? 'photo(s) non trouvée(s)' : 'photo(s) not found'}
                          </span>
                        )}
                      </div>

                      <div className="analysis-series-card-actions">
                        <button
                          className={`analysis-create-series-btn${createdSeriesNames.has(s.name) ? ' created' : ''}`}
                          onClick={() => createSeriesFromAnalysis(s)}
                          disabled={matchedPhotos.length < 2 || createdSeriesNames.has(s.name)}
                        >
                          {createdSeriesNames.has(s.name)
                            ? `✅ ${lang === 'fr' ? 'Série ajoutée' : 'Series added'}`
                            : `✅ ${lang === 'fr' ? 'Créer la série' : 'Create series'}`}
                        </button>
                        {onSendToWall && (
                          <button
                            className={`analysis-create-wall-btn${createdSeriesNames.has(s.name) ? ' created' : ''}`}
                            onClick={() => createSeriesAndWall(s)}
                            disabled={matchedPhotos.length < 2 || createdSeriesNames.has(s.name)}
                          >
                            {createdSeriesNames.has(s.name)
                              ? `✅ ${lang === 'fr' ? 'Série ajoutée' : 'Series added'}`
                              : `📐 ${lang === 'fr' ? 'Série + Mur' : 'Series + Wall'}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Highlights */}
              {parsed.highlights && parsed.highlights.length > 0 && (
                <>
                  <h4 className="analysis-section-title">⭐ {lang === 'fr' ? 'Photos remarquables' : 'Notable Photos'}</h4>
                  <div className="analysis-highlights">
                    {parsed.highlights.map((h, idx) => {
                      const photo = photos.find(p => (p.photo_name || p.file_name) === h.photo_name);
                      return (
                        <div key={idx} className="analysis-highlight-card">
                          {photo && <img src={photo.photo_url} alt={h.photo_name} className="analysis-highlight-img" />}
                          <div className="analysis-highlight-info">
                            <strong>{h.photo_name}</strong>
                            <p>{h.reason}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="series-actions">
                <button 
                  onClick={() => setShowSaveDialog(true)}
                  className="save-series-button"
                  disabled={savingAnalysis}
                >
                  💾 {lang === 'fr' ? 'Sauvegarder' : 'Save'}
                </button>
                <button 
                  onClick={() => setSeriesRecommendation(null)}
                  className="close-recommendation"
                >
                  {lang === 'fr' ? 'Fermer' : 'Close'}
                </button>
              </div>
            </div>
          );
        }
        // Fallback: markdown rendering
        return (
          <div className="series-recommendation">
            <h3>📊 Collection Analysis & Series Recommendations</h3>
            <div className="recommendation-content markdown-content">
              {renderMarkdown(seriesRecommendation)}
            </div>
            <div className="series-actions">
              <button 
                onClick={() => setShowSaveDialog(true)}
                className="save-series-button"
                disabled={savingAnalysis}
              >
                💾 {lang === 'fr' ? 'Sauvegarder' : 'Save'}
              </button>
              {onSendToWall && (
                <button
                  onClick={() => onSendToWall(photos.map(p => p.id), photos)}
                  className="send-to-wall-btn"
                >
                  📐 {lang === 'fr' ? 'Créer un mur' : 'Create wall'}
                </button>
              )}
              <button 
                onClick={() => setSeriesRecommendation(null)}
                className="close-recommendation"
              >
                {lang === 'fr' ? 'Fermer' : 'Close'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Move to Collection Dialog */}
      {showMoveDialog && (
        <div className="modal-overlay" onClick={() => setShowMoveDialog(false)}>
          <div className="move-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'fr' ? 'Déplacer vers une collection' : 'Move to Collection'}</h3>
            <div className="collection-options">
              <button 
                onClick={() => movePhotosToCollection(null)}
                className="collection-option"
              >
                📷 {lang === 'fr' ? 'Sans collection' : 'No Collection'}
              </button>
              {collections.map((c) => (
                <button 
                  key={c.id}
                  onClick={() => movePhotosToCollection(c)}
                  className="collection-option"
                >
                  📁 {c.name}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setShowMoveDialog(false)}
              className="cancel-btn"
            >
              {lang === 'fr' ? 'Annuler' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Save Dialog Modal */}
      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'fr' ? 'Sauvegarder l\'analyse de série' : 'Save Series Analysis'}</h3>
            <input
              type="text"
              placeholder={lang === 'fr' ? 'Titre de l\'analyse...' : 'Analysis title...'}
              value={seriesTitle}
              onChange={(e) => setSeriesTitle(e.target.value)}
              className="series-title-input"
              autoFocus
            />
            <div className="save-dialog-buttons">
              <button
                onClick={() => saveSeriesAnalysis(false)}
                disabled={savingAnalysis || !seriesTitle.trim()}
                className="save-private-button"
              >
                🔒 {lang === 'fr' ? 'Sauvegarder (privé)' : 'Save (private)'}
              </button>
              <button
                onClick={() => saveSeriesAnalysis(true)}
                disabled={savingAnalysis || !seriesTitle.trim()}
                className="save-public-button"
              >
                🔗 {lang === 'fr' ? 'Sauvegarder & Partager' : 'Save & Share'}
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="cancel-button"
              >
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`gallery-with-sidebar ${selectedCollection?.id ? 'has-sidebar' : ''}`}>
        <div className={`gallery-grid grid-cols-${gridColumns}`}>
        {photos.map((photo) => {
          // Extract appreciation from analysis
          let appreciation = null;
          try {
            const analysisSource = photo.collection_analysis || photo.analysis;
            if (analysisSource) {
              const parsedAnalysis = JSON.parse(analysisSource);
              if (parsedAnalysis.appreciation) {
                appreciation = parsedAnalysis.appreciation;
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }

          return (
          <div 
            key={photo.id} 
            className={`gallery-item ${reanalyzingIds.has(photo.id) ? 'reanalyzing' : ''} ${selectedPhotos.has(photo.id) ? 'selected' : ''} ${galleryDragPhotoId === photo.id ? 'gallery-dragging' : ''}`}
            onClick={() => setSelectedPhoto(photo)}
            draggable={!!selectedCollection?.id}
            onDragStart={(e) => selectedCollection?.id && handleGalleryDragStart(e, photo.id)}
            onDragEnd={handleGalleryDragEnd}
          >
            {/* Selection checkbox */}
            <div 
              className={`photo-checkbox ${selectedPhotos.has(photo.id) ? 'checked' : ''}`}
              onClick={(e) => togglePhotoSelection(photo.id, e)}
            >
              {selectedPhotos.has(photo.id) && '✓'}
            </div>
            
            {/* Drag badge for multi-select */}
            {selectedCollection?.id && selectedPhotos.has(photo.id) && selectedPhotos.size > 1 && (
              <div className="drag-count-badge">{selectedPhotos.size}</div>
            )}
            
            {/* Appreciation badge */}
            {appreciation && (
              <div className="photo-appreciation-badge">{appreciation}</div>
            )}
            
            {reanalyzingIds.has(photo.id) && (
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
                  disabled={reanalyzingIds.has(photo.id)}
                  aria-label={lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
                  title={lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
                >
                  {reanalyzingIds.has(photo.id) ? '⏳' : '🔄'}
                </button>
                <button
                  className={selectedCollection?.id ? "thumbnail-remove" : "thumbnail-delete"}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    selectedCollection?.id ? removeFromCollection(photo) : deletePhoto(photo);
                  }}
                  aria-label={selectedCollection?.id ? (lang === 'fr' ? 'Retirer de la collection' : 'Remove from collection') : `Delete ${photo.file_name}`}
                  title={selectedCollection?.id ? (lang === 'fr' ? 'Retirer de la collection' : 'Remove from collection') : (lang === 'fr' ? 'Supprimer' : 'Delete')}
                >
                  {selectedCollection?.id ? '−' : '🗑️'}
                </button>
              </div>
            </div>
          </div>
          );
        })}
        </div>

        {/* Series Sidebar — always visible when in a collection */}
        {selectedCollection?.id && (
          <aside className="series-sidebar">
            <div className="series-sidebar-header">
              <h3>📋 {lang === 'fr' ? 'Séries' : 'Series'}</h3>
              <button
                onClick={() => setShowCreateSeriesDialog(true)}
                className="series-sidebar-add-btn"
                title={lang === 'fr' ? 'Créer une série' : 'Create series'}
              >
                +
              </button>
            </div>

            <p className="series-sidebar-hint">
              {lang === 'fr'
                ? '↕ Glissez des photos ici pour les ajouter'
                : '↕ Drag photos here to add them'}
            </p>

            {/* Series list with drop zones */}
            <div className="series-sidebar-list">
              {seriesList.map(s => (
                <div
                  key={s.id}
                  className={`series-sidebar-item ${activeSeries?.id === s.id ? 'active' : ''} ${dropTargetSeriesId === s.id ? 'drop-target' : ''}`}
                  onDragOver={(e) => handleSeriesDragOver(e, s.id)}
                  onDragLeave={handleSeriesDragLeave}
                  onDrop={(e) => handleSeriesDrop(e, s.id)}
                >
                  <div className="series-sidebar-item-info" onClick={() => viewSeries(s)}>
                    <span className="series-sidebar-item-name">{s.name}</span>
                    <span className="series-sidebar-item-meta">
                      {s.photo_count?.[0]?.count || 0} 📷
                      {s.analysis && <span className="series-analyzed-dot" title={lang === 'fr' ? 'Analysée' : 'Analyzed'}>●</span>}
                    </span>
                  </div>
                  <button
                    className="series-sidebar-delete-btn"
                    onClick={(e) => { e.stopPropagation(); deleteSeries(s.id); }}
                    title={lang === 'fr' ? 'Supprimer' : 'Delete'}
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Drop zone for new series */}
              <div
                className={`series-sidebar-new-drop ${dropTargetNewSeries ? 'drop-target' : ''}`}
                onDragOver={handleNewSeriesDragOver}
                onDragLeave={handleNewSeriesDragLeave}
                onDrop={handleNewSeriesDrop}
              >
                <span>+ {lang === 'fr' ? 'Nouvelle série' : 'New series'}</span>
              </div>
            </div>

            {/* Active Series Detail */}
            {activeSeries && (
              <div className="series-sidebar-detail">
                <div className="series-detail-header">
                  <h4>{activeSeries.name}</h4>
                  <button
                    onClick={() => { setActiveSeries(null); setSeriesPhotos([]); setSeriesAnalysisResult(null); }}
                    className="close-series-btn"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  className="series-desc-input"
                  placeholder={lang === 'fr' ? 'Ajouter une description...' : 'Add a description...'}
                  value={activeSeries.description || ''}
                  onChange={(e) => setActiveSeries(prev => ({ ...prev, description: e.target.value }))}
                  onBlur={async () => {
                    try {
                      await supabase.from('collection_series').update({ description: activeSeries.description?.trim() || null, updated_at: new Date().toISOString() }).eq('id', activeSeries.id);
                      fetchSeriesList();
                    } catch (err) { console.error('Error saving description:', err); }
                  }}
                  rows={2}
                />

                {/* Series photos — drag to reorder */}
                <div className="series-photos-grid">
                  {seriesPhotos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className={`series-photo-thumb${draggedPhotoIdx === idx ? ' dragging' : ''}${dragOverIdx === idx ? ' drag-over' : ''}`}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(idx); }}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => { e.stopPropagation(); handleDrop(idx); }}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="series-photo-drag-handle" title={lang === 'fr' ? 'Réordonner' : 'Reorder'}>⠿</div>
                      <img src={photo.photo_url} alt={photo.photo_name || photo.file_name} />
                      <span className="series-photo-name">{photo.photo_name || photo.file_name}</span>
                      <button
                        className="series-photo-remove"
                        onClick={() => removePhotoFromSeries(photo.id)}
                        title={lang === 'fr' ? 'Retirer' : 'Remove'}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            )}
          </aside>
        )}
      </div>

      {selectedPhoto && (() => {
        const currentIndex = photos.findIndex(p => p.id === selectedPhoto.id);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < photos.length - 1;
        return (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          {/* Navigation arrows */}
          {hasPrev && (
            <button className="modal-nav modal-nav-prev" onClick={(e) => { e.stopPropagation(); setSelectedPhoto(photos[currentIndex - 1]); }} title={lang === 'fr' ? 'Photo précédente' : 'Previous photo'}>
              ‹
            </button>
          )}
          {hasNext && (
            <button className="modal-nav modal-nav-next" onClick={(e) => { e.stopPropagation(); setSelectedPhoto(photos[currentIndex + 1]); }} title={lang === 'fr' ? 'Photo suivante' : 'Next photo'}>
              ›
            </button>
          )}
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-top-bar">
              <span className="modal-photo-counter">{currentIndex + 1} / {photos.length}</span>
              <button 
                className="modal-close"
                onClick={() => setSelectedPhoto(null)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-photo">
              <img src={selectedPhoto.photo_url} alt={selectedPhoto.file_name} />
            </div>
            
            <div className="modal-details">
              <div className="modal-details-header">
                <div className="modal-details-title-row">
                  <h3>{selectedPhoto.photo_name || selectedPhoto.file_name}</h3>
                  <div className="modal-meta-inline">
                    {selectedPhoto.photo_name && (
                      <span className="modal-file-name">{selectedPhoto.file_name}</span>
                    )}
                    <span className="modal-prompt-type">
                      {selectedPhoto.collection_analysis_type || selectedPhoto.prompt_type}
                      {selectedPhoto.collection_analysis && (
                        <span className="collection-analysis-badge"> ({lang === 'fr' ? 'collection' : 'collection'})</span>
                      )}
                    </span>
                    <span className="modal-date-inline">
                      📅 {new Date(selectedPhoto.created_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {selectedPhoto.analysis && selectedPhoto.updated_at && selectedPhoto.updated_at !== selectedPhoto.created_at && (
                      <span className="modal-date-inline modal-date-updated">
                        🔄 {new Date(selectedPhoto.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {selectedPhoto.analysis_detail_level && (
                      <span className={`settings-tag-inline detail-${selectedPhoto.analysis_detail_level}`}>
                        {selectedPhoto.analysis_detail_level === 'concise' ? '📝' : 
                         selectedPhoto.analysis_detail_level === 'detailed' ? '📚' : 
                         '⚖️'}
                      </span>
                    )}
                    {selectedPhoto.analysis_tone && (
                      <span className={`settings-tag-inline tone-${selectedPhoto.analysis_tone}`}>
                        {selectedPhoto.analysis_tone === 'friendly' ? '😊' : 
                         selectedPhoto.analysis_tone === 'technical' ? '🔧' : 
                         '💼'}
                      </span>
                    )}
                    {selectedPhoto.analysis_focus_areas && selectedPhoto.analysis_focus_areas.length > 0 && (
                      <span className="settings-tag-inline focus-areas" title={selectedPhoto.analysis_focus_areas.join(', ')}>
                        🎯 {selectedPhoto.analysis_focus_areas.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {(() => {
                // Use collection-specific analysis if available, otherwise use default analysis
                const analysisSource = selectedPhoto.collection_analysis || selectedPhoto.analysis;
                let analysis;
                try {
                  analysis = JSON.parse(analysisSource);
                } catch {
                  analysis = null;
                }
                
                if (analysis && (analysis.appreciation || analysis.score !== undefined)) {
                  // Check if this is a marketing/social media analysis
                  const isMarketingAnalysis = analysis.hashtags || analysis.captions || analysis.subject;
                  const appreciationText = analysis.appreciation || `${analysis.score}/100`;
                  
                  return (
                    <div className="analysis-structured">
                      <div className="analysis-header">
                        <div className={`analysis-appreciation ${isMarketingAnalysis ? 'virality-appreciation' : ''}`}>
                          <span className="appreciation-value">{appreciationText}</span>
                          {isMarketingAnalysis && (
                            <span className="appreciation-type">🔥 {lang === 'fr' ? 'Viralité' : 'Virality'}</span>
                          )}
                        </div>
                        <p className="analysis-summary">{analysis.summary}</p>
                      </div>
                      
                      {/* Artistic analysis: Story section */}
                      {!isMarketingAnalysis && analysis.story && (
                        <div className="analysis-story">
                          <h5>📖 {lang === 'fr' ? 'Histoire' : 'Story'}</h5>
                          <p>{analysis.story}</p>
                        </div>
                      )}
                      
                      {/* Marketing analysis: Subject */}
                      {analysis.subject && (
                        <div className="analysis-subject">
                          <h5>📷 {lang === 'fr' ? 'Sujet de la photo' : 'Photo Subject'}</h5>
                          <p>{analysis.subject}</p>
                        </div>
                      )}
                      
                      {/* Marketing analysis section */}
                      {analysis.marketing && (
                        <div className="analysis-marketing">
                          <h5>📱 {lang === 'fr' ? 'Analyse Marketing' : 'Marketing Analysis'}</h5>
                          <p>{analysis.marketing}</p>
                        </div>
                      )}
                      
                      {/* Marketing analysis: Hashtags */}
                      {analysis.hashtags && analysis.hashtags.length > 0 && (
                        <div className="analysis-hashtags">
                          <h5># {lang === 'fr' ? 'Hashtags recommandés' : 'Recommended Hashtags'}</h5>
                          <div className="hashtags-container">
                            {analysis.hashtags.map((tag, i) => (
                              <span key={i} className="hashtag-badge">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Marketing analysis: Captions/Text proposals */}
                      {analysis.captions && analysis.captions.length > 0 && (
                        <div className="analysis-captions">
                          <h5>✍️ {lang === 'fr' ? 'Propositions de textes' : 'Caption Proposals'}</h5>
                          <div className="captions-list">
                            {analysis.captions.map((caption, i) => (
                              <div key={i} className="caption-item">
                                <span className="caption-number">{i + 1}</span>
                                <p>{caption}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Artistic analysis sections - only show if not marketing */}
                      {!isMarketingAnalysis && (
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
                      )}
                      
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
                    <p>{analysisSource}</p>
                  </div>
                );
              })()}

              <div className="modal-actions">
                <button 
                  className="reanalyze-button"
                  onClick={(e) => reanalyzePhoto(selectedPhoto, e)}
                  disabled={reanalyzingIds.has(selectedPhoto.id)}
                >
                  {reanalyzingIds.has(selectedPhoto.id) 
                    ? (lang === 'fr' ? '⏳ Analyse en cours...' : '⏳ Analyzing...') 
                    : (lang === 'fr' ? '🔄 Ré-analyser' : '🔄 Re-analyze')}
                </button>
                <button 
                  className={selectedCollection?.id ? "remove-button" : "delete-button"}
                  onClick={() => selectedCollection?.id ? removeFromCollection(selectedPhoto) : deletePhoto(selectedPhoto)}
                >
                  {selectedCollection?.id ? '−' : '🗑️'} {selectedCollection?.id ? (lang === 'fr' ? 'Retirer de la collection' : 'Remove from collection') : (lang === 'fr' ? 'Supprimer' : 'Delete Photo')}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
