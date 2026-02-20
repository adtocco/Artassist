import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import './WallView.css';

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const DEFAULT_W = 300;
const MIN_W = 60;

export default function WallView({ photos, initialPhotoIds, userSession, lang = 'fr', onClearInitial }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const moveHandlerRef = useRef(null);
  const upHandlerRef = useRef(null);

  const [walls, setWalls] = useState([]);
  const [activeWall, setActiveWall] = useState(null);
  const [items, setItems] = useState([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.5);
  const [selectedId, setSelectedId] = useState(null);
  const [maxZ, setMaxZ] = useState(0);
  const [wallName, setWallName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [aspectRatios, setAspectRatios] = useState({});
  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWallName, setNewWallName] = useState('');
  const [pendingPhotoIds, setPendingPhotoIds] = useState(null);
  // Share
  const [shareLink, setShareLink] = useState(null);
  // Photo picker modal
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [allPhotos, setAllPhotos] = useState([]);
  const [collections, setCollections] = useState([]);
  const [pickerFilter, setPickerFilter] = useState('all');
  const [pickerSelected, setPickerSelected] = useState(new Set());

  // Load walls on mount
  useEffect(() => {
    if (userSession?.user?.id) loadWalls();
  }, [userSession]);

  // Handle initial photos sent from gallery — open name dialog
  useEffect(() => {
    if (initialPhotoIds?.length > 0) {
      setPendingPhotoIds(initialPhotoIds);
      setNewWallName(`Mur du ${new Date().toLocaleDateString('fr-FR')}`);
      setShowCreateDialog(true);
      onClearInitial?.();
    }
  }, [initialPhotoIds]);

  // Wheel zoom (needs non-passive listener for preventDefault)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(z => Math.min(3, Math.max(0.1, +(z + delta).toFixed(2))));
    }
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [activeWall]);

  // Keyboard: Delete selected item
  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        deleteSelected();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, items]);

  // Cleanup window listeners on unmount
  useEffect(() => {
    return () => {
      if (moveHandlerRef.current) window.removeEventListener('pointermove', moveHandlerRef.current);
      if (upHandlerRef.current) window.removeEventListener('pointerup', upHandlerRef.current);
    };
  }, []);

  // ─── Data ────────────────────────────────────────────────────

  async function loadWalls() {
    const { data } = await supabase
      .from('walls')
      .select('*')
      .eq('user_id', userSession.user.id)
      .order('updated_at', { ascending: false });
    setWalls(data || []);
  }

  async function selectWall(wall) {
    setActiveWall(wall);
    setWallName(wall.name);
    setShareLink(wall.share_token ? `${window.location.origin}/wall/${wall.share_token}` : null);
    const { data } = await supabase
      .from('wall_items')
      .select('*')
      .eq('wall_id', wall.id)
      .order('z_index');
    setItems(data || []);
    setMaxZ(data?.length ? Math.max(...data.map(i => i.z_index)) : 0);
    setPan({ x: 0, y: 0 });
    setZoom(0.5);
    setSelectedId(null);
  }

  function openCreateDialog(photoIds = []) {
    setPendingPhotoIds(photoIds);
    setNewWallName(`Mur du ${new Date().toLocaleDateString('fr-FR')}`);
    setShowCreateDialog(true);
  }

  async function confirmCreateWall() {
    const name = newWallName.trim() || `Mur du ${new Date().toLocaleDateString('fr-FR')}`;
    const photoIds = pendingPhotoIds || [];
    setShowCreateDialog(false);
    setPendingPhotoIds(null);
    setNewWallName('');

    const { data: wall, error } = await supabase
      .from('walls')
      .insert({ user_id: userSession.user.id, name })
      .select()
      .single();
    if (error || !wall) return;

    let newItems = [];
    if (photoIds.length > 0) {
      const cols = Math.ceil(Math.sqrt(photoIds.length));
      const spacing = DEFAULT_W + 40;
      const startX = (CANVAS_W - cols * spacing) / 2;
      const startY = (CANVAS_H - Math.ceil(photoIds.length / cols) * spacing) / 2;
      newItems = photoIds.map((pid, i) => ({
        wall_id: wall.id,
        photo_id: pid,
        pos_x: startX + (i % cols) * spacing,
        pos_y: startY + Math.floor(i / cols) * spacing,
        width: DEFAULT_W,
        z_index: i + 1,
      }));
      const { data: inserted } = await supabase.from('wall_items').insert(newItems).select();
      newItems = inserted || [];
    }

    setActiveWall(wall);
    setWallName(wall.name);
    setItems(newItems);
    setMaxZ(newItems.length);
    setWalls(prev => [wall, ...prev]);
    setPan({ x: 0, y: 0 });
    setZoom(0.5);
    setSelectedId(null);
    setShareLink(null);
  }

  async function deleteWall(wallId) {
    if (!confirm('Supprimer ce mur ?')) return;
    await supabase.from('wall_items').delete().eq('wall_id', wallId);
    await supabase.from('walls').delete().eq('id', wallId);
    setWalls(prev => prev.filter(w => w.id !== wallId));
    if (activeWall?.id === wallId) {
      setActiveWall(null);
      setItems([]);
    }
  }

  async function renameWall() {
    if (!activeWall || !wallName.trim()) return;
    await supabase.from('walls').update({ name: wallName.trim(), updated_at: new Date().toISOString() }).eq('id', activeWall.id);
    setWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, name: wallName.trim() } : w));
    setActiveWall(prev => ({ ...prev, name: wallName.trim() }));
    setEditingName(false);
  }

  async function toggleShare() {
    if (!activeWall) return;
    if (activeWall.share_token) {
      // Unshare
      await supabase.from('walls').update({ share_token: null }).eq('id', activeWall.id);
      setActiveWall(prev => ({ ...prev, share_token: null }));
      setWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, share_token: null } : w));
      setShareLink(null);
    } else {
      // Share — generate token
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      await supabase.from('walls').update({ share_token: token }).eq('id', activeWall.id);
      setActiveWall(prev => ({ ...prev, share_token: token }));
      setWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, share_token: token } : w));
      const link = `${window.location.origin}/wall/${token}`;
      setShareLink(link);
    }
  }

  function copyShareLink() {
    const link = `${window.location.origin}/wall/${activeWall.share_token}`;
    navigator.clipboard.writeText(link).then(() => {
      setShareLink('copied');
      setTimeout(() => setShareLink(link), 2000);
    });
  }

  async function deleteSelected() {
    if (!selectedId) return;
    await supabase.from('wall_items').delete().eq('id', selectedId);
    setItems(prev => prev.filter(i => i.id !== selectedId));
    setSelectedId(null);
  }

  // ─── Photo picker ───────────────────────────────────────────

  async function openPhotoPicker() {
    setShowPhotoPicker(true);
    setPickerSelected(new Set());
    setPickerFilter('all');
    // Fetch collections
    const { data: colData } = await supabase
      .from('collections')
      .select('id, name')
      .eq('user_id', userSession.user.id)
      .order('created_at', { ascending: false });
    setCollections(colData || []);
    // Fetch all photos
    const { data: photoData } = await supabase
      .from('photo_analyses')
      .select('id, photo_url, file_name, photo_name')
      .eq('user_id', userSession.user.id)
      .order('created_at', { ascending: false });
    // Fetch collection_photos mappings for filtering
    const { data: cpData } = await supabase
      .from('collection_photos')
      .select('photo_id, collection_id');
    // Build map: photo_id → set of collection_ids
    const photoCollections = {};
    (cpData || []).forEach(cp => {
      if (!photoCollections[cp.photo_id]) photoCollections[cp.photo_id] = new Set();
      photoCollections[cp.photo_id].add(cp.collection_id);
    });
    // Attach collection set to each photo
    const enriched = (photoData || []).map(p => ({
      ...p,
      _collections: photoCollections[p.id] || new Set(),
    }));
    setAllPhotos(enriched);
  }

  function togglePickerPhoto(pid) {
    setPickerSelected(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  }

  async function addPhotosFromPicker() {
    if (pickerSelected.size === 0 || !activeWall) return;
    const existingIds = new Set(items.map(i => i.photo_id));
    const newPhotoIds = [...pickerSelected].filter(pid => !existingIds.has(pid));
    if (newPhotoIds.length === 0) {
      setShowPhotoPicker(false);
      return;
    }

    // Place new photos in a grid, offset from existing items
    const cols = Math.ceil(Math.sqrt(newPhotoIds.length));
    const spacing = DEFAULT_W + 40;
    const startX = 100 + (items.length > 0 ? 50 : (CANVAS_W - cols * spacing) / 2);
    const startY = 100 + (items.length > 0 ? 50 : (CANVAS_H - Math.ceil(newPhotoIds.length / cols) * spacing) / 2);
    let currentZ = maxZ;

    const newRows = newPhotoIds.map((pid, i) => ({
      wall_id: activeWall.id,
      photo_id: pid,
      pos_x: startX + (i % cols) * spacing,
      pos_y: startY + Math.floor(i / cols) * spacing,
      width: DEFAULT_W,
      z_index: ++currentZ,
    }));

    const { data: inserted } = await supabase.from('wall_items').insert(newRows).select();
    if (inserted) {
      setItems(prev => [...prev, ...inserted]);
      setMaxZ(currentZ);
    }
    setShowPhotoPicker(false);
  }

  function getFilteredPickerPhotos() {
    if (pickerFilter === 'all') return allPhotos;
    if (pickerFilter === 'none') return allPhotos.filter(p => p._collections.size === 0);
    return allPhotos.filter(p => p._collections.has(pickerFilter));
  }

  // ─── Photo helpers ───────────────────────────────────────────

  function getPhoto(pid) {
    return photos.find(p => p.id === pid) || allPhotos.find(p => p.id === pid);
  }
  function getAspect(pid) { return aspectRatios[pid] || 0.75; }

  function handleImgLoad(e, pid) {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth > 0) {
      setAspectRatios(prev => {
        if (prev[pid]) return prev;
        return { ...prev, [pid]: naturalHeight / naturalWidth };
      });
    }
  }

  // ─── Pointer interaction engine ──────────────────────────────

  function attachListeners(onMove, onUp) {
    // Remove any stale listeners first
    if (moveHandlerRef.current) window.removeEventListener('pointermove', moveHandlerRef.current);
    if (upHandlerRef.current) window.removeEventListener('pointerup', upHandlerRef.current);
    moveHandlerRef.current = onMove;
    upHandlerRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function detachListeners() {
    if (moveHandlerRef.current) window.removeEventListener('pointermove', moveHandlerRef.current);
    if (upHandlerRef.current) window.removeEventListener('pointerup', upHandlerRef.current);
    moveHandlerRef.current = null;
    upHandlerRef.current = null;
  }

  function startMove(e, itemId) {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const newZ = maxZ + 1;
    setMaxZ(newZ);
    setSelectedId(itemId);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, z_index: newZ } : i));

    const int = {
      type: 'move', itemId,
      startX: e.clientX, startY: e.clientY,
      origPosX: item.pos_x, origPosY: item.pos_y,
      origZ: newZ, zoom,
    };
    interactionRef.current = int;

    attachListeners(
      (ev) => {
        const dx = (ev.clientX - int.startX) / int.zoom;
        const dy = (ev.clientY - int.startY) / int.zoom;
        setItems(prev => prev.map(i =>
          i.id === int.itemId
            ? { ...i, pos_x: int.origPosX + dx, pos_y: int.origPosY + dy }
            : i
        ));
      },
      async (ev) => {
        detachListeners();
        interactionRef.current = null;
        const dx = (ev.clientX - int.startX) / int.zoom;
        const dy = (ev.clientY - int.startY) / int.zoom;
        await supabase.from('wall_items').update({
          pos_x: int.origPosX + dx,
          pos_y: int.origPosY + dy,
          z_index: int.origZ,
        }).eq('id', int.itemId);
      }
    );
  }

  function startResize(e, itemId, handle) {
    e.stopPropagation();
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const aspect = getAspect(item.photo_id);
    const int = {
      type: 'resize', itemId, handle,
      startX: e.clientX, startY: e.clientY,
      origPosX: item.pos_x, origPosY: item.pos_y,
      origWidth: item.width, aspect, zoom,
    };
    interactionRef.current = int;

    function computeResize(ev) {
      const cdx = (ev.clientX - int.startX) / int.zoom;
      let newWidth;
      if (handle === 'se' || handle === 'ne') {
        newWidth = Math.max(MIN_W, int.origWidth + cdx);
      } else {
        newWidth = Math.max(MIN_W, int.origWidth - cdx);
      }
      const heightDelta = (newWidth - int.origWidth) * int.aspect;
      const update = { width: newWidth, pos_x: int.origPosX, pos_y: int.origPosY };
      if (handle === 'nw' || handle === 'sw') {
        update.pos_x = int.origPosX - (newWidth - int.origWidth);
      }
      if (handle === 'nw' || handle === 'ne') {
        update.pos_y = int.origPosY - heightDelta;
      }
      return update;
    }

    attachListeners(
      (ev) => {
        const upd = computeResize(ev);
        setItems(prev => prev.map(i =>
          i.id === int.itemId ? { ...i, ...upd } : i
        ));
      },
      async (ev) => {
        detachListeners();
        interactionRef.current = null;
        const upd = computeResize(ev);
        await supabase.from('wall_items').update(upd).eq('id', int.itemId);
      }
    );
  }

  function startPan(e) {
    // Only pan when clicking on the canvas background itself
    if (e.target !== canvasRef.current) return;
    e.preventDefault();
    setSelectedId(null);

    const int = {
      type: 'pan',
      startX: e.clientX, startY: e.clientY,
      origPanX: pan.x, origPanY: pan.y,
    };
    interactionRef.current = int;

    attachListeners(
      (ev) => {
        setPan({
          x: int.origPanX + (ev.clientX - int.startX),
          y: int.origPanY + (ev.clientY - int.startY),
        });
      },
      () => {
        detachListeners();
        interactionRef.current = null;
      }
    );
  }

  // ─── Render: Wall list (no active wall) ──────────────────────

  if (!activeWall) {
    return (
      <div className="wall-list-view">
        <div className="wall-list-header">
          <h2>🖼 {lang === 'fr' ? 'Mes Murs' : 'My Walls'}</h2>
          <button className="wall-create-btn" onClick={() => openCreateDialog([])}>
            + {lang === 'fr' ? 'Nouveau mur' : 'New Wall'}
          </button>
        </div>
        {walls.length === 0 ? (
          <div className="wall-empty">
            <div className="wall-empty-icon">🖼</div>
            <p>{lang === 'fr'
              ? 'Aucun mur créé. Sélectionnez des photos dans la galerie puis cliquez sur « 📐 Mur » pour en créer un.'
              : 'No walls yet. Select photos in the gallery and click "📐 Wall" to create one.'
            }</p>
          </div>
        ) : (
          <div className="wall-list-grid">
            {walls.map(w => (
              <div key={w.id} className="wall-card" onClick={() => selectWall(w)}>
                <div className="wall-card-preview">🖼</div>
                <div className="wall-card-body">
                  <span className="wall-card-name">{w.name}</span>
                  <span className="wall-card-date">
                    {new Date(w.created_at).toLocaleDateString('fr-FR')}
                    {w.share_token && <span className="wall-shared-badge"> • {lang === 'fr' ? 'Partagé' : 'Shared'}</span>}
                  </span>
                </div>
                <button className="wall-card-delete" onClick={(ev) => { ev.stopPropagation(); deleteWall(w.id); }}>🗑</button>
              </div>
            ))}
          </div>
        )}

        {/* Create wall dialog */}
        {showCreateDialog && (
          <div className="wall-dialog-overlay" onClick={() => { setShowCreateDialog(false); setPendingPhotoIds(null); }}>
            <div className="wall-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>{lang === 'fr' ? 'Nouveau mur' : 'New Wall'}</h3>
              <label className="wall-dialog-label">
                {lang === 'fr' ? 'Nom du mur' : 'Wall name'}
              </label>
              <input
                className="wall-dialog-input"
                value={newWallName}
                onChange={(e) => setNewWallName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmCreateWall()}
                placeholder={lang === 'fr' ? 'Mon mur...' : 'My wall...'}
                autoFocus
              />
              {pendingPhotoIds?.length > 0 && (
                <p className="wall-dialog-hint">
                  {pendingPhotoIds.length} photo{pendingPhotoIds.length > 1 ? 's' : ''} {lang === 'fr' ? 'seront ajoutées' : 'will be added'}
                </p>
              )}
              <div className="wall-dialog-actions">
                <button className="wall-dialog-cancel" onClick={() => { setShowCreateDialog(false); setPendingPhotoIds(null); }}>
                  {lang === 'fr' ? 'Annuler' : 'Cancel'}
                </button>
                <button className="wall-dialog-confirm" onClick={confirmCreateWall}>
                  {lang === 'fr' ? 'Créer' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Active wall canvas ──────────────────────────────

  return (
    <div className="wall-container">
      {/* Toolbar */}
      <div className="wall-toolbar">
        <div className="wall-toolbar-left">
          <button className="wall-back-btn" onClick={() => { setActiveWall(null); setItems([]); }}>
            ← {lang === 'fr' ? 'Murs' : 'Walls'}
          </button>
          {editingName ? (
            <input
              className="wall-name-input"
              value={wallName}
              onChange={(e) => setWallName(e.target.value)}
              onBlur={renameWall}
              onKeyDown={(e) => e.key === 'Enter' && renameWall()}
              autoFocus
            />
          ) : (
            <h3 className="wall-name" onClick={() => setEditingName(true)} title={lang === 'fr' ? 'Cliquer pour renommer' : 'Click to rename'}>
              {wallName}
            </h3>
          )}
        </div>
        <div className="wall-toolbar-center">
          <button className="wall-zoom-btn" onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
          <span className="wall-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="wall-zoom-btn" onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}>−</button>
          <button className="wall-zoom-btn" onClick={() => { setZoom(0.5); setPan({ x: 0, y: 0 }); }} title={lang === 'fr' ? 'Recentrer' : 'Reset view'}>⌂</button>
        </div>
        <div className="wall-toolbar-right">
          {/* Share toggle */}
          <button
            className={`wall-share-btn ${activeWall.share_token ? 'shared' : ''}`}
            onClick={toggleShare}
            title={activeWall.share_token ? (lang === 'fr' ? 'Rendre privé' : 'Make private') : (lang === 'fr' ? 'Partager' : 'Share')}
          >
            {activeWall.share_token ? '🔓' : '🔒'} {activeWall.share_token ? (lang === 'fr' ? 'Partagé' : 'Shared') : (lang === 'fr' ? 'Partager' : 'Share')}
          </button>
          {activeWall.share_token && (
            <button className="wall-copy-link-btn" onClick={copyShareLink}>
              {shareLink === 'copied' ? '✅' : '📎'} {shareLink === 'copied' ? (lang === 'fr' ? 'Copié !' : 'Copied!') : 'Lien'}
            </button>
          )}
          <span className="wall-toolbar-sep">|</span>
          <button className="wall-add-photos-btn" onClick={openPhotoPicker}>
            ➕ {lang === 'fr' ? 'Ajouter' : 'Add'}
          </button>
          <span className="wall-toolbar-sep">|</span>
          {selectedId && (
            <button className="wall-delete-item-btn" onClick={deleteSelected}>
              🗑 {lang === 'fr' ? 'Supprimer photo' : 'Delete photo'}
            </button>
          )}
          <span className="wall-item-count">{items.length} photo{items.length !== 1 ? 's' : ''}</span>
          <span className="wall-toolbar-sep">|</span>
          <button className="wall-delete-wall-btn" onClick={() => deleteWall(activeWall.id)}>
            🗑 {lang === 'fr' ? 'Supprimer le mur' : 'Delete wall'}
          </button>
        </div>
      </div>

      {/* Canvas viewport */}
      <div className="wall-viewport" ref={viewportRef}>
        <div
          className="wall-canvas"
          ref={canvasRef}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          onPointerDown={startPan}
        >
          {items.map(item => {
            const photo = getPhoto(item.photo_id);
            if (!photo) return null;
            const aspect = getAspect(item.photo_id);
            const h = item.width * aspect;
            const isSelected = selectedId === item.id;

            return (
              <div
                key={item.id}
                className={`wall-item ${isSelected ? 'selected' : ''}`}
                style={{
                  left: item.pos_x,
                  top: item.pos_y,
                  width: item.width,
                  height: h,
                  zIndex: item.z_index,
                }}
                onPointerDown={(e) => startMove(e, item.id)}
              >
                <img
                  src={photo.photo_url}
                  alt={photo.photo_name || photo.file_name || ''}
                  draggable={false}
                  onLoad={(e) => handleImgLoad(e, item.photo_id)}
                />
                {isSelected && ['nw', 'ne', 'sw', 'se'].map(corner => (
                  <div
                    key={corner}
                    className={`wall-handle handle-${corner}`}
                    onPointerDown={(e) => startResize(e, item.id, corner)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo picker modal */}
      {showPhotoPicker && (
        <div className="wall-dialog-overlay" onClick={() => setShowPhotoPicker(false)}>
          <div className="wall-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wall-picker-header">
              <h3>{lang === 'fr' ? 'Ajouter des photos' : 'Add Photos'}</h3>
              <button className="wall-picker-close" onClick={() => setShowPhotoPicker(false)}>✕</button>
            </div>
            <div className="wall-picker-filter">
              <select
                value={pickerFilter}
                onChange={(e) => setPickerFilter(e.target.value)}
              >
                <option value="all">{lang === 'fr' ? 'Toutes les photos' : 'All photos'}</option>
                <option value="none">{lang === 'fr' ? 'Sans collection' : 'No collection'}</option>
                {collections.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {pickerSelected.size > 0 && (
                <span className="wall-picker-count">
                  {pickerSelected.size} {lang === 'fr' ? 'sélectionnée(s)' : 'selected'}
                </span>
              )}
            </div>
            <div className="wall-picker-grid">
              {getFilteredPickerPhotos().map(p => {
                const alreadyOnWall = items.some(i => i.photo_id === p.id);
                const isSelected = pickerSelected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`wall-picker-item ${isSelected ? 'selected' : ''} ${alreadyOnWall ? 'on-wall' : ''}`}
                    onClick={() => !alreadyOnWall && togglePickerPhoto(p.id)}
                  >
                    <img src={p.photo_url} alt={p.photo_name || p.file_name} loading="lazy" />
                    {isSelected && <div className="wall-picker-check">✓</div>}
                    {alreadyOnWall && <div className="wall-picker-badge">{lang === 'fr' ? 'Déjà ajoutée' : 'Already added'}</div>}
                    <div className="wall-picker-name">{p.photo_name || p.file_name}</div>
                  </div>
                );
              })}
              {getFilteredPickerPhotos().length === 0 && (
                <p className="wall-picker-empty">{lang === 'fr' ? 'Aucune photo dans cette collection.' : 'No photos in this collection.'}</p>
              )}
            </div>
            <div className="wall-picker-actions">
              <button className="wall-dialog-cancel" onClick={() => setShowPhotoPicker(false)}>
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
              <button
                className="wall-dialog-confirm"
                disabled={pickerSelected.size === 0}
                onClick={addPhotosFromPicker}
              >
                {lang === 'fr' ? `Ajouter ${pickerSelected.size || ''}` : `Add ${pickerSelected.size || ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help hint */}
      <div className="wall-hint">
        {lang === 'fr'
          ? 'Cliquer-glisser pour déplacer • Poignées pour redimensionner • Molette pour zoomer • Glisser le fond pour naviguer • Suppr pour retirer'
          : 'Drag to move • Handles to resize • Scroll to zoom • Drag background to pan • Delete to remove'}
      </div>
    </div>
  );
}
