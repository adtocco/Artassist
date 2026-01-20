import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { analyzePhoto } from '../lib/openai';
import './Collections.css';

const ANALYSIS_TYPES = [
  { value: 'general', labelFr: 'Analyse générale', labelEn: 'General analysis' },
  { value: 'series', labelFr: 'Analyse de série', labelEn: 'Series analysis' },
  { value: 'technique', labelFr: 'Technique artistique', labelEn: 'Artistic technique' },
  { value: 'composition', labelFr: 'Composition', labelEn: 'Composition' },
  { value: 'color', labelFr: 'Palette de couleurs', labelEn: 'Color palette' },
  { value: 'style', labelFr: 'Style et influences', labelEn: 'Style and influences' },
  { value: 'custom', labelFr: 'Personnalisé', labelEn: 'Custom' },
];

export default function Collections({ lang = 'fr', onSelectCollection, onRefresh }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [newAnalysisType, setNewAnalysisType] = useState('general');
  const [newAnalysisInstructions, setNewAnalysisInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [editingCollection, setEditingCollection] = useState(null);
  const [showAddPhotosDialog, setShowAddPhotosDialog] = useState(null); // collection to add photos to
  const [availablePhotos, setAvailablePhotos] = useState([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [addProgress, setAddProgress] = useState('');

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch collections with photo count from collection_photos junction table
      const { data, error } = await supabase
        .from('collections')
        .select(`
          *,
          photo_count:collection_photos(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Also get cover photos
      const collectionsWithCovers = await Promise.all((data || []).map(async (collection) => {
        if (collection.cover_photo_id) {
          const { data: coverPhoto } = await supabase
            .from('photo_analyses')
            .select('photo_url, photo_name')
            .eq('id', collection.cover_photo_id)
            .single();
          return { ...collection, cover_photo: coverPhoto };
        }
        // If no cover, get first photo from collection via collection_photos
        const { data: firstCollectionPhoto } = await supabase
          .from('collection_photos')
          .select('photo_id')
          .eq('collection_id', collection.id)
          .limit(1)
          .single();
        
        if (firstCollectionPhoto?.photo_id) {
          const { data: firstPhoto } = await supabase
            .from('photo_analyses')
            .select('photo_url, photo_name')
            .eq('id', firstCollectionPhoto.photo_id)
            .single();
          return { ...collection, cover_photo: firstPhoto };
        }
        return { ...collection, cover_photo: null };
      }));

      setCollections(collectionsWithCovers);
    } catch (err) {
      console.error('Error fetching collections:', err);
    } finally {
      setLoading(false);
    }
  };

  const createCollection = async () => {
    if (!newCollectionName.trim()) return;
    
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('collections')
        .insert({
          user_id: user.id,
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim() || null,
          analysis_type: newAnalysisType,
          analysis_instructions: newAnalysisType === 'custom' ? newAnalysisInstructions.trim() : null
        })
        .select()
        .single();

      if (error) throw error;

      setCollections([{ ...data, photo_count: [{ count: 0 }] }, ...collections]);
      setNewCollectionName('');
      setNewCollectionDescription('');
      setNewAnalysisType('general');
      setNewAnalysisInstructions('');
      setShowCreateDialog(false);
    } catch (err) {
      console.error('Error creating collection:', err);
      alert(lang === 'fr' ? 'Erreur lors de la création' : 'Error creating collection');
    } finally {
      setCreating(false);
    }
  };

  const updateCollection = async () => {
    if (!editingCollection || !editingCollection.name.trim()) return;
    
    try {
      const { data, error } = await supabase
        .from('collections')
        .update({
          name: editingCollection.name.trim(),
          description: editingCollection.description?.trim() || null,
          analysis_type: editingCollection.analysis_type || 'general',
          analysis_instructions: editingCollection.analysis_type === 'custom' 
            ? editingCollection.analysis_instructions?.trim() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCollection.id)
        .select()
        .single();

      if (error) throw error;

      setCollections(collections.map(c => c.id === data.id ? { ...c, ...data } : c));
      setEditingCollection(null);
    } catch (err) {
      console.error('Error updating collection:', err);
    }
  };

  const deleteCollection = async (collection) => {
    const confirmMsg = lang === 'fr' 
      ? `Supprimer la collection "${collection.name}" ? Les photos ne seront pas supprimées.`
      : `Delete collection "${collection.name}"? Photos will not be deleted.`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collection.id);

      if (error) throw error;

      setCollections(collections.filter(c => c.id !== collection.id));
      if (selectedCollection?.id === collection.id) {
        setSelectedCollection(null);
        onSelectCollection?.(null);
      }
    } catch (err) {
      console.error('Error deleting collection:', err);
    }
  };

  const openAddPhotosDialog = async (collection) => {
    setShowAddPhotosDialog(collection);
    setSelectedPhotoIds(new Set());
    setLoadingPhotos(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // First get photo IDs already in this collection
      const { data: existingPhotos } = await supabase
        .from('collection_photos')
        .select('photo_id')
        .eq('collection_id', collection.id);
      
      const existingPhotoIds = (existingPhotos || []).map(p => p.photo_id);
      
      // Fetch all user photos
      let query = supabase
        .from('photo_analyses')
        .select('id, photo_url, photo_name, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      // Exclude photos already in the collection
      if (existingPhotoIds.length > 0) {
        query = query.not('id', 'in', `(${existingPhotoIds.join(',')})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAvailablePhotos(data || []);
    } catch (err) {
      console.error('Error fetching available photos:', err);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const togglePhotoSelection = (photoId) => {
    const newSelection = new Set(selectedPhotoIds);
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);
    } else {
      newSelection.add(photoId);
    }
    setSelectedPhotoIds(newSelection);
  };

  const addPhotosToCollection = async () => {
    console.log('addPhotosToCollection called', { selectedPhotoIds: selectedPhotoIds.size, showAddPhotosDialog });
    
    if (selectedPhotoIds.size === 0 || !showAddPhotosDialog) {
      console.log('Early return - no photos selected or no dialog');
      return;
    }
    
    const collection = showAddPhotosDialog;
    setAddingPhotos(true);
    setAddProgress(lang === 'fr' ? 'Ajout en cours...' : 'Adding...');
    
    try {
      // Get selected photos data for analysis
      const selectedPhotosData = availablePhotos.filter(p => selectedPhotoIds.has(p.id));
      console.log('Selected photos data:', selectedPhotosData);
      
      for (let i = 0; i < selectedPhotosData.length; i++) {
        const photo = selectedPhotosData[i];
        setAddProgress(`${lang === 'fr' ? 'Ajout' : 'Adding'} ${i + 1}/${selectedPhotosData.length}...`);
        
        let analysis = null;
        
        // If collection has a specific analysis type, run analysis
        if (collection.analysis_type && collection.analysis_type !== 'general') {
          try {
            const collectionAnalysis = {
              type: collection.analysis_type,
              instructions: collection.analysis_instructions
            };
            
            const analysisResult = await analyzePhoto(photo.photo_url, 'artist', lang, collectionAnalysis);
            analysis = analysisResult.analysis;
          } catch (analysisErr) {
            console.error('Error analyzing photo for collection:', analysisErr);
            // Continue without analysis if it fails
          }
        }
        
        // Insert into collection_photos junction table
        console.log('Inserting into collection_photos:', { collection_id: collection.id, photo_id: photo.id });
        const { error } = await supabase
          .from('collection_photos')
          .insert({
            collection_id: collection.id,
            photo_id: photo.id,
            analysis: analysis,
            analysis_type: collection.analysis_type
          });

        if (error) {
          console.error('Supabase insert error:', error);
          throw error;
        }
      }

      setShowAddPhotosDialog(null);
      setSelectedPhotoIds(new Set());
      setAvailablePhotos([]);
      setAddProgress('');
      fetchCollections(); // Refresh to update photo counts
      onRefresh?.(); // Refresh gallery
    } catch (err) {
      console.error('Error adding photos to collection:', err);
      alert(lang === 'fr' ? `Erreur: ${err.message || err}` : `Error: ${err.message || err}`);
    } finally {
      setAddingPhotos(false);
      setAddProgress('');
    }
  };

  const handleSelectCollection = (collection) => {
    const newSelection = selectedCollection?.id === collection?.id ? null : collection;
    setSelectedCollection(newSelection);
    onSelectCollection?.(newSelection);
  };

  if (loading) {
    return <div className="collections-loading">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>;
  }

  return (
    <div className="collections-container">
      <div className="collections-header">
        <h3>📁 {lang === 'fr' ? 'Collections' : 'Collections'}</h3>
        <button 
          className="create-collection-btn"
          onClick={() => setShowCreateDialog(true)}
        >
          + {lang === 'fr' ? 'Nouvelle' : 'New'}
        </button>
      </div>

      <div className="collections-list">
        {/* "All photos" option */}
        <div 
          className={`collection-item ${!selectedCollection ? 'active' : ''}`}
          onClick={() => handleSelectCollection(null)}
        >
          <div className="collection-icon all-photos">📸</div>
          <div className="collection-info">
            <span className="collection-name">
              {lang === 'fr' ? 'Toutes les photos' : 'All Photos'}
            </span>
          </div>
        </div>

        {/* "No collection" option */}
        <div 
          className={`collection-item ${selectedCollection === 'none' ? 'active' : ''}`}
          onClick={() => handleSelectCollection('none')}
        >
          <div className="collection-icon no-collection">📷</div>
          <div className="collection-info">
            <span className="collection-name">
              {lang === 'fr' ? 'Sans collection' : 'No Collection'}
            </span>
          </div>
        </div>

        {/* User collections */}
        {collections.map((collection) => (
          <div 
            key={collection.id}
            className={`collection-item ${selectedCollection?.id === collection.id ? 'active' : ''}`}
            onClick={() => handleSelectCollection(collection)}
          >
            {collection.cover_photo ? (
              <img 
                src={collection.cover_photo.photo_url} 
                alt={collection.name}
                className="collection-cover"
              />
            ) : (
              <div className="collection-icon empty">📁</div>
            )}
            <div className="collection-info">
              <span className="collection-name">{collection.name}</span>
              <span className="collection-count">
                {collection.photo_count?.[0]?.count || 0} {lang === 'fr' ? 'photos' : 'photos'}
              </span>
            </div>
            <div className="collection-actions" onClick={(e) => e.stopPropagation()}>
              <button 
                className="add-photos-btn"
                onClick={() => openAddPhotosDialog(collection)}
                title={lang === 'fr' ? 'Ajouter des photos' : 'Add photos'}
              >
                ➕
              </button>
              <button 
                className="edit-btn"
                onClick={() => setEditingCollection({ ...collection })}
                title={lang === 'fr' ? 'Modifier' : 'Edit'}
              >
                ✏️
              </button>
              <button 
                className="delete-btn"
                onClick={() => deleteCollection(collection)}
                title={lang === 'fr' ? 'Supprimer' : 'Delete'}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Collection Dialog */}
      {showCreateDialog && createPortal(
        <div className="modal-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="collection-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'fr' ? 'Nouvelle collection' : 'New Collection'}</h3>
            <input
              type="text"
              placeholder={lang === 'fr' ? 'Nom de la collection' : 'Collection name'}
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              autoFocus
            />
            <textarea
              placeholder={lang === 'fr' ? 'Description (optionnel)' : 'Description (optional)'}
              value={newCollectionDescription}
              onChange={(e) => setNewCollectionDescription(e.target.value)}
              rows={2}
            />
            <label className="form-label">
              {lang === 'fr' ? "Type d'analyse" : 'Analysis type'}
            </label>
            <select 
              value={newAnalysisType}
              onChange={(e) => setNewAnalysisType(e.target.value)}
              className="analysis-type-select"
            >
              {ANALYSIS_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {lang === 'fr' ? type.labelFr : type.labelEn}
                </option>
              ))}
            </select>
            {newAnalysisType === 'custom' && (
              <textarea
                placeholder={lang === 'fr' ? 'Instructions personnalisées pour l\'analyse...' : 'Custom analysis instructions...'}
                value={newAnalysisInstructions}
                onChange={(e) => setNewAnalysisInstructions(e.target.value)}
                rows={3}
                className="custom-instructions"
              />
            )}
            <div className="dialog-buttons">
              <button 
                onClick={createCollection}
                disabled={creating || !newCollectionName.trim()}
                className="primary-btn"
              >
                {creating ? '...' : (lang === 'fr' ? 'Créer' : 'Create')}
              </button>
              <button onClick={() => setShowCreateDialog(false)} className="cancel-btn">
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Collection Dialog */}
      {editingCollection && createPortal(
        <div className="modal-overlay" onClick={() => setEditingCollection(null)}>
          <div className="collection-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'fr' ? 'Modifier la collection' : 'Edit Collection'}</h3>
            <input
              type="text"
              placeholder={lang === 'fr' ? 'Nom de la collection' : 'Collection name'}
              value={editingCollection.name}
              onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })}
              autoFocus
            />
            <textarea
              placeholder={lang === 'fr' ? 'Description (optionnel)' : 'Description (optional)'}
              value={editingCollection.description || ''}
              onChange={(e) => setEditingCollection({ ...editingCollection, description: e.target.value })}
              rows={2}
            />
            <label className="form-label">
              {lang === 'fr' ? "Type d'analyse" : 'Analysis type'}
            </label>
            <select 
              value={editingCollection.analysis_type || 'general'}
              onChange={(e) => setEditingCollection({ ...editingCollection, analysis_type: e.target.value })}
              className="analysis-type-select"
            >
              {ANALYSIS_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {lang === 'fr' ? type.labelFr : type.labelEn}
                </option>
              ))}
            </select>
            {editingCollection.analysis_type === 'custom' && (
              <textarea
                placeholder={lang === 'fr' ? 'Instructions personnalisées pour l\'analyse...' : 'Custom analysis instructions...'}
                value={editingCollection.analysis_instructions || ''}
                onChange={(e) => setEditingCollection({ ...editingCollection, analysis_instructions: e.target.value })}
                rows={3}
                className="custom-instructions"
              />
            )}
            <div className="dialog-buttons">
              <button 
                onClick={updateCollection}
                disabled={!editingCollection.name.trim()}
                className="primary-btn"
              >
                {lang === 'fr' ? 'Enregistrer' : 'Save'}
              </button>
              <button onClick={() => setEditingCollection(null)} className="cancel-btn">
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Photos to Collection Dialog */}
      {showAddPhotosDialog && createPortal(
        <div className="modal-overlay" onClick={() => setShowAddPhotosDialog(null)}>
          <div className="collection-dialog add-photos-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>
              {lang === 'fr' 
                ? `Ajouter des photos à "${showAddPhotosDialog.name}"` 
                : `Add photos to "${showAddPhotosDialog.name}"`}
            </h3>
            {loadingPhotos ? (
              <div className="loading-photos">
                {lang === 'fr' ? 'Chargement...' : 'Loading...'}
              </div>
            ) : availablePhotos.length === 0 ? (
              <div className="no-photos-available">
                {lang === 'fr' 
                  ? 'Aucune photo disponible à ajouter' 
                  : 'No photos available to add'}
              </div>
            ) : (
              <>
                <div className="available-photos-grid">
                  {availablePhotos.map(photo => (
                    <div 
                      key={photo.id}
                      className={`available-photo-item ${selectedPhotoIds.has(photo.id) ? 'selected' : ''} ${addingPhotos ? 'disabled' : ''}`}
                      onClick={() => !addingPhotos && togglePhotoSelection(photo.id)}
                    >
                      <img src={photo.photo_url} alt={photo.photo_name || 'Photo'} />
                      <div className="photo-checkbox">
                        {selectedPhotoIds.has(photo.id) && '✓'}
                      </div>
                      {photo.photo_name && (
                        <span className="photo-name-label">{photo.photo_name}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="selected-count">
                  {addingPhotos ? addProgress : (
                    <>
                      {selectedPhotoIds.size} {lang === 'fr' ? 'photo(s) sélectionnée(s)' : 'photo(s) selected'}
                      {showAddPhotosDialog.analysis_type && showAddPhotosDialog.analysis_type !== 'general' && (
                        <span className="analysis-note">
                          {' '} - {lang === 'fr' ? 'Analyse:' : 'Analysis:'} {ANALYSIS_TYPES.find(t => t.value === showAddPhotosDialog.analysis_type)?.[lang === 'fr' ? 'labelFr' : 'labelEn']}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
            <div className="dialog-buttons">
              <button 
                onClick={addPhotosToCollection}
                disabled={selectedPhotoIds.size === 0 || addingPhotos}
                className="primary-btn"
              >
                {addingPhotos ? (lang === 'fr' ? 'Ajout en cours...' : 'Adding...') : (lang === 'fr' ? 'Ajouter' : 'Add')}
              </button>
              <button 
                onClick={() => !addingPhotos && setShowAddPhotosDialog(null)} 
                className="cancel-btn"
                disabled={addingPhotos}
              >
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
