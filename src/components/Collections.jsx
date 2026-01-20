import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Collections.css';

export default function Collections({ lang = 'fr', onSelectCollection }) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [editingCollection, setEditingCollection] = useState(null);

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Fetch collections with photo count
      const { data, error } = await supabase
        .from('collections')
        .select(`
          *,
          photo_count:photo_analyses(count)
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
        // If no cover, get first photo from collection
        const { data: firstPhoto } = await supabase
          .from('photo_analyses')
          .select('photo_url, photo_name')
          .eq('collection_id', collection.id)
          .limit(1)
          .single();
        return { ...collection, cover_photo: firstPhoto };
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
          description: newCollectionDescription.trim() || null
        })
        .select()
        .single();

      if (error) throw error;

      setCollections([{ ...data, photo_count: [{ count: 0 }] }, ...collections]);
      setNewCollectionName('');
      setNewCollectionDescription('');
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
      {showCreateDialog && (
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
        </div>
      )}

      {/* Edit Collection Dialog */}
      {editingCollection && (
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
        </div>
      )}
    </div>
  );
}
