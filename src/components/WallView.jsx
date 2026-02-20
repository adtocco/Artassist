import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { analyzeWall, PROMPT_PRESETS } from '../lib/openai';
import './WallView.css';

const PX_PER_CM = 5;
const DEFAULT_W = 300;
const MIN_W = 60;

export default function WallView({ photos, initialPhotoIds, userSession, lang = 'fr', userSettings, onClearInitial }) {
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
  const [newWallWidthM, setNewWallWidthM] = useState('6');
  const [newWallHeightM, setNewWallHeightM] = useState('2.2');
  const [pendingPhotoIds, setPendingPhotoIds] = useState(null);
  // Settings dialog
  const [showSettings, setShowSettings] = useState(false);
  const [settingsWidthM, setSettingsWidthM] = useState('');
  const [settingsHeightM, setSettingsHeightM] = useState('');
  const [settingsBg, setSettingsBg] = useState('#ffffff');
  const [showDims, setShowDims] = useState(true);
  const [showPerson, setShowPerson] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wallContainerRef = useRef(null);
  // Share
  const [shareLink, setShareLink] = useState(null);
  // Photo picker modal
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [allPhotos, setAllPhotos] = useState([]);
  const [collections, setCollections] = useState([]);
  const [pickerFilter, setPickerFilter] = useState('all');
  const [pickerSelected, setPickerSelected] = useState(new Set());
  // Wall analysis
  const [analyzingWall, setAnalyzingWall] = useState(false);
  const [wallAnalysisResult, setWallAnalysisResult] = useState(null);
  const [showWallAnalysis, setShowWallAnalysis] = useState(false);
  const [showWallAnalysisOptions, setShowWallAnalysisOptions] = useState(false);
  const [wallAnalysisPreset, setWallAnalysisPreset] = useState('curator');
  const [wallAnalysisDetailLevel, setWallAnalysisDetailLevel] = useState('balanced');
  const [wallAnalysisTone, setWallAnalysisTone] = useState('professional');
  const [wallAnalysisCustomPrompt, setWallAnalysisCustomPrompt] = useState('');
  const [wallAnalysisInstructions, setWallAnalysisInstructions] = useState('');

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

  // Fullscreen change listener
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  // Center canvas in viewport when wall changes
  useLayoutEffect(() => {
    if (!activeWall) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const cW = (activeWall.physical_width_cm || 600) * PX_PER_CM;
    const cH = (activeWall.physical_height_cm || 220) * PX_PER_CM;
    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    // Total room dimensions (canvas + side walls + ceiling + floor)
    const roomW = cW + cW * 0.12 * 2; // left + right walls
    const roomH = cH * 0.25 + cH + cH * 0.35; // ceiling + canvas + floor
    // Fit entire room in viewport with margin
    const z = Math.min(vpW * 0.9 / roomW, vpH * 0.9 / roomH, 1);
    // Center the room in the viewport
    const px = (vpW - roomW * z) / 2;
    const py = (vpH - roomH * z) / 2;
    setPan({ x: px, y: py });
    setZoom(+(z.toFixed(2)));
  }, [activeWall?.id]);

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
    setSelectedId(null);

    // Fetch photo data for all items not already in photos prop
    if (data?.length) {
      const knownIds = new Set(photos.map(p => p.id));
      const missingIds = [...new Set(data.map(i => i.photo_id).filter(id => !knownIds.has(id)))];
      if (missingIds.length > 0) {
        const { data: fetched } = await supabase
          .from('photo_analyses')
          .select('id, photo_url, file_name, photo_name')
          .in('id', missingIds);
        if (fetched?.length) {
          setAllPhotos(prev => {
            const existing = new Set(prev.map(p => p.id));
            const newPhotos = fetched.filter(p => !existing.has(p.id));
            return newPhotos.length ? [...prev, ...newPhotos] : prev;
          });
        }
      }
    }
  }

  function openCreateDialog(photoIds = []) {
    setPendingPhotoIds(photoIds);
    setNewWallName(`Mur du ${new Date().toLocaleDateString('fr-FR')}`);
    setNewWallWidthM('6');
    setNewWallHeightM('2.2');
    setShowCreateDialog(true);
  }

  async function confirmCreateWall() {
    const name = newWallName.trim() || `Mur du ${new Date().toLocaleDateString('fr-FR')}`;
    const physW = Math.max(50, Math.round(parseFloat(newWallWidthM) * 100) || 600);
    const physH = Math.max(50, Math.round(parseFloat(newWallHeightM) * 100) || 220);
    const cW = physW * PX_PER_CM;
    const cH = physH * PX_PER_CM;
    const photoIds = pendingPhotoIds || [];
    setShowCreateDialog(false);
    setPendingPhotoIds(null);
    setNewWallName('');

    const { data: wall, error } = await supabase
      .from('walls')
      .insert({ user_id: userSession.user.id, name, physical_width_cm: physW, physical_height_cm: physH, background_color: '#ffffff' })
      .select()
      .single();
    if (error || !wall) return;

    let newItems = [];
    if (photoIds.length > 0) {
      const cols = Math.ceil(Math.sqrt(photoIds.length));
      const spacing = DEFAULT_W + 40;
      const startX = (cW - cols * spacing) / 2;
      const startY = (cH - Math.ceil(photoIds.length / cols) * spacing) / 2;
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

  async function updateItemFrame(itemId, color, widthCm) {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, frame_color: color, frame_width_cm: widthCm } : i
    ));
    await supabase.from('wall_items').update({
      frame_color: color,
      frame_width_cm: widthCm,
    }).eq('id', itemId);
  }

  async function updateItemMat(itemId, matColor, matWidthCm) {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, mat_color: matColor, mat_width_cm: matWidthCm } : i
    ));
    await supabase.from('wall_items').update({
      mat_color: matColor,
      mat_width_cm: matWidthCm,
    }).eq('id', itemId);
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
    const startX = 100 + (items.length > 0 ? 50 : (canvasW - cols * spacing) / 2);
    const startY = 100 + (items.length > 0 ? 50 : (canvasH - Math.ceil(newPhotoIds.length / cols) * spacing) / 2);
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

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      wallContainerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  // ─── Wall analysis ───────────────────────────────────────────────

  function openWallAnalysisOptions() {
    const presets = PROMPT_PRESETS.wall;
    const savedPrompt = userSettings?.prompt_wall_analysis || '';
    let detectedPreset = presets[0].id;
    if (savedPrompt) {
      const match = presets.find(p => (p.prompt[lang] || p.prompt.fr).trim() === savedPrompt.trim());
      detectedPreset = match ? match.id : 'custom';
    }
    setWallAnalysisPreset(detectedPreset);
    setWallAnalysisDetailLevel(userSettings?.analysis_detail_level || 'balanced');
    setWallAnalysisTone(userSettings?.analysis_tone || 'professional');
    setWallAnalysisCustomPrompt(savedPrompt);
    setWallAnalysisInstructions('');
    setShowWallAnalysisOptions(true);
  }

  async function runWallAnalysis() {
    setShowWallAnalysisOptions(false);
    if (items.length === 0) return;

    const presets = PROMPT_PRESETS.wall;
    let promptValue = '';
    if (wallAnalysisPreset === 'custom') {
      promptValue = wallAnalysisCustomPrompt;
    } else {
      const preset = presets.find(p => p.id === wallAnalysisPreset);
      if (preset) promptValue = preset.prompt[lang] || preset.prompt.fr;
    }

    const overriddenSettings = {
      ...userSettings,
      prompt_wall_analysis: promptValue || '',
      analysis_detail_level: wallAnalysisDetailLevel || 'balanced',
      analysis_tone: wallAnalysisTone || 'professional',
    };

    const cpp = getCmPerPixel();
    const wallItems = items.map(item => {
      const photo = getPhoto(item.photo_id);
      const aspect = getAspect(item.photo_id);
      const wPx = item.width;
      const hPx = wPx * aspect;
      return {
        photoName: photo?.photo_name || photo?.file_name || 'Sans titre',
        fileName: photo?.file_name || '',
        widthCm: +(wPx * cpp).toFixed(1),
        heightCm: +(hPx * cpp).toFixed(1),
        xCm: +(item.pos_x * cpp).toFixed(1),
        yCm: +(item.pos_y * cpp).toFixed(1),
        frameColor: item.frame_color || null,
        frameWidthCm: item.frame_width_cm || 0,
        matColor: item.mat_color || null,
        matWidthCm: item.mat_width_cm || 0,
        analysis: photo?.analysis || '',
      };
    });

    const wallData = {
      wallName: activeWall.name,
      wallWidthCm: activeWall.physical_width_cm || 600,
      wallHeightCm: activeWall.physical_height_cm || 220,
      backgroundColor: activeWall.background_color || '#ffffff',
      items: wallItems,
    };

    setAnalyzingWall(true);
    try {
      const result = await analyzeWall(wallData, lang, wallAnalysisInstructions, overriddenSettings);
      setWallAnalysisResult(result);
      setShowWallAnalysis(true);
    } catch (err) {
      console.error('Error analyzing wall:', err);
      alert(lang === 'fr' ? 'Erreur lors de l\'analyse : ' + err.message : 'Error analyzing: ' + err.message);
    } finally {
      setAnalyzingWall(false);
    }
  }

  // Simple markdown to HTML renderer
  function renderMarkdown(md) {
    if (!md) return '';
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/<\/ul>\s*<ul>/g, '')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  // ─── Wall settings ──────────────────────────────────────────

  function openSettings() {
    if (!activeWall) return;
    setSettingsWidthM(((activeWall.physical_width_cm || 600) / 100).toString());
    setSettingsHeightM(((activeWall.physical_height_cm || 220) / 100).toString());
    setSettingsBg(activeWall.background_color || '#ffffff');
    setShowSettings(true);
  }

  async function saveSettings() {
    if (!activeWall) return;
    const physW = Math.max(50, Math.round(parseFloat(settingsWidthM) * 100) || 600);
    const physH = Math.max(50, Math.round(parseFloat(settingsHeightM) * 100) || 220);
    const bg = settingsBg || '#ffffff';
    const updates = { physical_width_cm: physW, physical_height_cm: physH, background_color: bg, updated_at: new Date().toISOString() };
    await supabase.from('walls').update(updates).eq('id', activeWall.id);
    const updatedWall = { ...activeWall, ...updates };
    setActiveWall(updatedWall);
    setWalls(prev => prev.map(w => w.id === activeWall.id ? updatedWall : w));
    setShowSettings(false);
  }

  // ─── Photo helpers ───────────────────────────────────────────

  function getPhoto(pid) {
    return photos.find(p => p.id === pid) || allPhotos.find(p => p.id === pid);
  }
  function getAspect(pid) { return aspectRatios[pid] || 0.75; }

  // Canvas dimensions derived from wall physical size
  const canvasW = (activeWall?.physical_width_cm || 600) * PX_PER_CM;
  const canvasH = (activeWall?.physical_height_cm || 220) * PX_PER_CM;

  // Scale: how many cm per canvas pixel
  function getCmPerPixel() {
    return 1 / PX_PER_CM;
  }

  // Format cm → human readable (e.g. "1.20 m" or "45 cm")
  function formatDim(cm) {
    if (cm >= 100) return `${(cm / 100).toFixed(2)} m`;
    return `${Math.round(cm)} cm`;
  }

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
              <label className="wall-dialog-label">
                {lang === 'fr' ? 'Dimensions du mur' : 'Wall dimensions'}
              </label>
              <div className="wall-dialog-dims">
                <div className="wall-dim-field">
                  <input
                    className="wall-dialog-input wall-dim-input"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="20"
                    value={newWallWidthM}
                    onChange={(e) => setNewWallWidthM(e.target.value)}
                  />
                  <span className="wall-dim-unit">m {lang === 'fr' ? 'largeur' : 'width'}</span>
                </div>
                <span className="wall-dim-x">×</span>
                <div className="wall-dim-field">
                  <input
                    className="wall-dialog-input wall-dim-input"
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="10"
                    value={newWallHeightM}
                    onChange={(e) => setNewWallHeightM(e.target.value)}
                  />
                  <span className="wall-dim-unit">m {lang === 'fr' ? 'hauteur' : 'height'}</span>
                </div>
              </div>
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
    <div className={`wall-container ${isFullscreen ? 'wall-fullscreen' : ''}`} ref={wallContainerRef}>
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
          <button className="wall-physical-dims" onClick={openSettings} title={lang === 'fr' ? 'Modifier les paramètres du mur' : 'Edit wall settings'}>
            ⚙️ {((activeWall.physical_width_cm || 600) / 100).toFixed(1)}m × {((activeWall.physical_height_cm || 220) / 100).toFixed(1)}m
          </button>
        </div>
        <div className="wall-toolbar-center">
          <button className="wall-zoom-btn" onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
          <span className="wall-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="wall-zoom-btn" onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}>−</button>
          <button className="wall-zoom-btn" onClick={() => { setZoom(0.5); setPan({ x: 0, y: 0 }); }} title={lang === 'fr' ? 'Recentrer' : 'Reset view'}>⌂</button>
          <button className="wall-fullscreen-btn" onClick={toggleFullscreen} title={lang === 'fr' ? 'Plein écran' : 'Fullscreen'}>
            {isFullscreen ? '✕' : '⛶'}
          </button>
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
          <button
            className={`wall-toggle-dims-btn ${showDims ? 'active' : ''}`}
            onClick={() => setShowDims(d => !d)}
            title={lang === 'fr' ? 'Afficher/masquer les dimensions' : 'Show/hide dimensions'}
          >
            📏 {lang === 'fr' ? 'Dims' : 'Dims'}
          </button>
          <button
            className={`wall-toggle-person-btn ${showPerson ? 'active' : ''}`}
            onClick={() => setShowPerson(p => !p)}
            title={lang === 'fr' ? 'Afficher/masquer le personnage repère' : 'Show/hide reference person'}
          >
            🧍 {lang === 'fr' ? 'Repère' : 'Scale'}
          </button>
          <button className="wall-add-photos-btn" onClick={openPhotoPicker}>
            ➕ {lang === 'fr' ? 'Ajouter' : 'Add'}
          </button>
          <button
            className="wall-analyze-btn"
            onClick={openWallAnalysisOptions}
            disabled={analyzingWall || items.length === 0}
            title={lang === 'fr' ? 'Analyser la disposition du mur' : 'Analyze wall layout'}
          >
            {analyzingWall
              ? (lang === 'fr' ? '⏳ Analyse...' : '⏳ Analyzing...')
              : (lang === 'fr' ? '🎯 Analyser' : '🎯 Analyze')}
          </button>
          <span className="wall-item-count">{items.length} photo{items.length !== 1 ? 's' : ''}</span>
          <span className="wall-toolbar-sep">|</span>
          <button className="wall-delete-wall-btn" onClick={() => deleteWall(activeWall.id)}>
            🗑 {lang === 'fr' ? 'Supprimer le mur' : 'Delete wall'}
          </button>
        </div>
      </div>

      {/* Secondary toolbar — selected photo actions */}
      {selectedId && (() => {
        const selItem = items.find(i => i.id === selectedId);
        const selPhoto = selItem ? getPhoto(selItem.photo_id) : null;
        const selAspect = selItem ? getAspect(selItem.photo_id) : 1;
        const cpp = getCmPerPixel();
        return (
          <div className="wall-toolbar wall-toolbar-secondary">
            <div className="wall-toolbar-secondary-left">
              <span className="wall-selected-label">📷 {selPhoto?.photo_name || selPhoto?.file_name || (lang === 'fr' ? 'Photo sélectionnée' : 'Selected photo')}</span>
              {selItem && (
                <span className="wall-selected-dims">
                  {formatDim(selItem.width * cpp)} × {formatDim(selItem.width * selAspect * cpp)}
                </span>
              )}
            </div>
            <div className="wall-toolbar-frame">
              <span className="wall-frame-label">🖼 {lang === 'fr' ? 'Cadre' : 'Frame'}</span>
              <input
                type="color"
                className="wall-frame-color-input"
                value={selItem.frame_color || '#3a2a1a'}
                onChange={(e) => updateItemFrame(selItem.id, e.target.value, selItem.frame_width_cm ?? 0)}
                title={lang === 'fr' ? 'Couleur du cadre' : 'Frame color'}
              />
              <div className="wall-frame-thickness">
                <input
                  type="number"
                  className="wall-frame-thickness-input"
                  min="0"
                  max="15"
                  step="0.5"
                  value={selItem.frame_width_cm ?? 0}
                  onChange={(e) => updateItemFrame(selItem.id, selItem.frame_color || '#3a2a1a', parseFloat(e.target.value) || 0)}
                  title={lang === 'fr' ? 'Épaisseur en cm' : 'Thickness in cm'}
                />
                <span className="wall-frame-unit">cm</span>
              </div>
              {(selItem.frame_width_cm > 0) && (
                <button
                  className="wall-frame-remove-btn"
                  onClick={() => updateItemFrame(selItem.id, null, 0)}
                  title={lang === 'fr' ? 'Retirer le cadre' : 'Remove frame'}
                >✕</button>
              )}
            </div>
            {(selItem.frame_width_cm > 0) && (
              <div className="wall-toolbar-mat">
                <span className="wall-mat-label">{lang === 'fr' ? 'Passe-partout' : 'Mat'}</span>
                <input
                  type="color"
                  className="wall-frame-color-input"
                  value={selItem.mat_color || '#ffffff'}
                  onChange={(e) => updateItemMat(selItem.id, e.target.value, selItem.mat_width_cm ?? 0)}
                  title={lang === 'fr' ? 'Couleur du passe-partout' : 'Mat color'}
                />
                <div className="wall-frame-thickness">
                  <input
                    type="number"
                    className="wall-frame-thickness-input"
                    min="0"
                    max="10"
                    step="0.5"
                    value={selItem.mat_width_cm ?? 0}
                    onChange={(e) => updateItemMat(selItem.id, selItem.mat_color || '#ffffff', parseFloat(e.target.value) || 0)}
                    title={lang === 'fr' ? 'Largeur en cm' : 'Width in cm'}
                  />
                  <span className="wall-frame-unit">cm</span>
                </div>
                {(selItem.mat_width_cm > 0) && (
                  <button
                    className="wall-frame-remove-btn"
                    onClick={() => updateItemMat(selItem.id, '#ffffff', 0)}
                    title={lang === 'fr' ? 'Retirer le passe-partout' : 'Remove mat'}
                  >✕</button>
                )}
              </div>
            )}
            <div className="wall-toolbar-secondary-right">
              <button className="wall-delete-item-btn" onClick={deleteSelected}>
                🗑 {lang === 'fr' ? 'Supprimer photo' : 'Delete photo'}
              </button>
              <button className="wall-deselect-btn" onClick={() => setSelectedId(null)}>
                ✕ {lang === 'fr' ? 'Désélectionner' : 'Deselect'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Canvas viewport */}
      <div className="wall-viewport" ref={viewportRef}>
        <div className="wall-room" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          <div className="wall-room-ceiling" style={{ width: canvasW, height: canvasH * 0.25 }}></div>
          <div className="wall-room-middle">
            <div className="wall-room-left" style={{ width: canvasW * 0.12, height: canvasH }}></div>
            <div
              className="wall-canvas"
              ref={canvasRef}
              style={{
                width: canvasW,
                height: canvasH,
                backgroundColor: activeWall.background_color || '#ffffff',
              }}
              onPointerDown={startPan}
            >
          {items.map(item => {
            const photo = getPhoto(item.photo_id);
            if (!photo) return null;
            const aspect = getAspect(item.photo_id);
            const h = item.width * aspect;
            const isSelected = selectedId === item.id;
            const cpp = getCmPerPixel();
            const physW = item.width * cpp;
            const physH = h * cpp;

            // Calculate extra pixels added by mat (border) and frame (outline)
            const matPx = (item.frame_width_cm > 0 && item.mat_width_cm > 0) ? item.mat_width_cm * PX_PER_CM : 0;
            const framePx = (item.frame_width_cm > 0 && item.mat_width_cm > 0) ? item.frame_width_cm * PX_PER_CM
              : (item.frame_width_cm > 0) ? item.frame_width_cm * PX_PER_CM : 0;
            // Total extra on each side: mat is border (adds to box), frame is outline when mat present (doesn't add to box)
            // When no mat: frame is border (adds to box)
            const borderExtra = matPx > 0 ? matPx : (item.frame_width_cm > 0 ? framePx : 0);
            const totalExtraTop = borderExtra; // border adds on top
            const totalExtraBottom = borderExtra; // border adds on bottom

            const distTop = (item.pos_y - totalExtraTop) * cpp;
            const distBottom = (canvasH - item.pos_y - h - totalExtraBottom) * cpp;
            const rulerTopHeight = item.pos_y - totalExtraTop;
            const rulerBottomHeight = canvasH - item.pos_y - h - totalExtraBottom;

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
                  ...(item.frame_width_cm > 0 && item.mat_width_cm > 0 ? {
                    // Mat as border (outside photo, preserves proportions)
                    borderWidth: item.mat_width_cm * PX_PER_CM,
                    borderStyle: 'solid',
                    borderColor: item.mat_color || '#ffffff',
                    // Frame as outline (wraps around the mat)
                    outline: `${item.frame_width_cm * PX_PER_CM}px solid ${item.frame_color || '#3a2a1a'}`,
                    borderRadius: 1,
                  } : item.frame_width_cm > 0 ? {
                    borderWidth: item.frame_width_cm * PX_PER_CM,
                    borderStyle: 'solid',
                    borderColor: item.frame_color || '#3a2a1a',
                    borderRadius: 1,
                  } : {}),
                }}
                onPointerDown={(e) => startMove(e, item.id)}
              >
                <img
                  src={photo.photo_url}
                  alt={photo.photo_name || photo.file_name || ''}
                  draggable={false}
                  onLoad={(e) => handleImgLoad(e, item.photo_id)}
                />
                {showDims && (
                  <>
                    <div className="wall-item-dims">
                      {formatDim(physW)} × {formatDim(physH)}
                    </div>
                    {/* Ruler: top of wall → top of frame/mat */}
                    {rulerTopHeight > 5 && (
                      <div className="wall-ruler wall-ruler-top" style={{ height: rulerTopHeight, bottom: '100%', left: '50%' }}>
                        <div className="wall-ruler-line"></div>
                        <div className="wall-ruler-tick wall-ruler-tick-start"></div>
                        <div className="wall-ruler-tick wall-ruler-tick-end"></div>
                        <span className="wall-ruler-label">{formatDim(distTop)}</span>
                      </div>
                    )}
                    {/* Ruler: bottom of frame/mat → bottom of wall */}
                    {rulerBottomHeight > 5 && (
                      <div className="wall-ruler wall-ruler-bottom" style={{ height: rulerBottomHeight, top: '100%', left: '50%' }}>
                        <div className="wall-ruler-line"></div>
                        <div className="wall-ruler-tick wall-ruler-tick-start"></div>
                        <div className="wall-ruler-tick wall-ruler-tick-end"></div>
                        <span className="wall-ruler-label">{formatDim(distBottom)}</span>
                      </div>
                    )}
                  </>
                )}
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
            <div className="wall-room-right" style={{ width: canvasW * 0.12, height: canvasH }}></div>
          </div>
          <div className="wall-room-floor" style={{ width: canvasW, height: canvasH * 0.35 }}>
            {showPerson && (() => {
              const personHeightCm = 175;
              const personH = personHeightCm * PX_PER_CM;
              const personW = personH * 0.32;
              return (
                <div className="wall-person" style={{ width: personW, height: personH, top: -personH, right: canvasW * 0.06 }}>
                  <svg viewBox="0 0 120 375" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                    {/* Head */}
                    <circle cx="60" cy="28" r="24" fill="#555" opacity="0.55" />
                    {/* Neck */}
                    <rect x="52" y="52" width="16" height="14" rx="4" fill="#555" opacity="0.55" />
                    {/* Torso */}
                    <path d="M30 66 Q60 60 90 66 L85 190 Q60 195 35 190 Z" fill="#555" opacity="0.50" />
                    {/* Left arm */}
                    <path d="M30 70 Q18 130 22 185 L30 185 Q34 132 40 76 Z" fill="#555" opacity="0.45" />
                    {/* Right arm */}
                    <path d="M90 70 Q102 130 98 185 L90 185 Q86 132 80 76 Z" fill="#555" opacity="0.45" />
                    {/* Left leg */}
                    <path d="M38 188 Q34 280 30 365 L48 365 Q48 280 50 188 Z" fill="#555" opacity="0.50" />
                    {/* Right leg */}
                    <path d="M70 188 Q72 280 72 365 L90 365 Q86 280 82 188 Z" fill="#555" opacity="0.50" />
                  </svg>
                  <div className="wall-person-label">1,75 m</div>
                </div>
              );
            })()}
          </div>
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

      {/* Settings modal */}
      {showSettings && (
        <div className="wall-dialog-overlay" onClick={() => setShowSettings(false)}>
          <div className="wall-dialog wall-settings-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{lang === 'fr' ? 'Paramètres du mur' : 'Wall Settings'}</h3>
            <label className="wall-dialog-label">
              {lang === 'fr' ? 'Dimensions du mur' : 'Wall dimensions'}
            </label>
            <div className="wall-dialog-dims">
              <div className="wall-dim-field">
                <input
                  className="wall-dialog-input wall-dim-input"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="20"
                  value={settingsWidthM}
                  onChange={(e) => setSettingsWidthM(e.target.value)}
                />
                <span className="wall-dim-unit">m {lang === 'fr' ? 'largeur' : 'width'}</span>
              </div>
              <span className="wall-dim-x">×</span>
              <div className="wall-dim-field">
                <input
                  className="wall-dialog-input wall-dim-input"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10"
                  value={settingsHeightM}
                  onChange={(e) => setSettingsHeightM(e.target.value)}
                />
                <span className="wall-dim-unit">m {lang === 'fr' ? 'hauteur' : 'height'}</span>
              </div>
            </div>
            <label className="wall-dialog-label">
              {lang === 'fr' ? 'Couleur de fond' : 'Background color'}
            </label>
            <div className="wall-settings-color">
              <input
                type="color"
                value={settingsBg}
                onChange={(e) => setSettingsBg(e.target.value)}
                className="wall-color-input"
              />
              <span className="wall-color-value">{settingsBg}</span>
            </div>
            <div className="wall-dialog-actions">
              <button className="wall-dialog-cancel" onClick={() => setShowSettings(false)}>
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
              <button className="wall-dialog-confirm" onClick={saveSettings}>
                {lang === 'fr' ? 'Enregistrer' : 'Save'}
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

      {/* Wall analysis result panel */}
      {showWallAnalysis && wallAnalysisResult && (
        <div className="wall-analysis-overlay" onClick={() => setShowWallAnalysis(false)}>
          <div className="wall-analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wall-analysis-header">
              <h3>🎯 {lang === 'fr' ? 'Analyse du mur' : 'Wall Analysis'} — {activeWall?.name}</h3>
              <button className="modal-close" onClick={() => setShowWallAnalysis(false)}>×</button>
            </div>
            <div className="wall-analysis-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(wallAnalysisResult) }} />
            <div className="wall-analysis-footer">
              <button className="wall-analysis-close-btn" onClick={() => setShowWallAnalysis(false)}>
                {lang === 'fr' ? 'Fermer' : 'Close'}
              </button>
              <button className="wall-analysis-redo-btn" onClick={openWallAnalysisOptions}>
                🔄 {lang === 'fr' ? 'Ré-analyser' : 'Re-analyze'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wall analysis options modal */}
      {showWallAnalysisOptions && (
        <div className="wall-analysis-overlay" onClick={() => setShowWallAnalysisOptions(false)}>
          <div className="wall-analysis-options-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wall-analysis-options-header">
              <h2>🎯 {lang === 'fr' ? `Options d'analyse du mur (${items.length} photos)` : `Wall Analysis Options (${items.length} photos)`}</h2>
              <button className="modal-close" onClick={() => setShowWallAnalysisOptions(false)}>×</button>
            </div>

            <div className="wall-analysis-options-body">
              {/* Preset selector */}
              <div className="analysis-options-section">
                <h3>📂 {lang === 'fr' ? 'Style d\'analyse' : 'Analysis Style'}</h3>
                <div className="analysis-options-presets">
                  {PROMPT_PRESETS.wall.map(preset => (
                    <label
                      key={preset.id}
                      className={`analysis-option-preset ${wallAnalysisPreset === preset.id ? 'active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="wall_analysis_preset"
                        checked={wallAnalysisPreset === preset.id}
                        onChange={() => {
                          setWallAnalysisPreset(preset.id);
                          setWallAnalysisCustomPrompt(preset.prompt[lang] || preset.prompt.fr);
                        }}
                      />
                      <div className="analysis-option-content">
                        <span className="analysis-option-title">{lang === 'fr' ? preset.labelFr : preset.labelEn}</span>
                        <span className="analysis-option-desc">{lang === 'fr' ? preset.descFr : preset.descEn}</span>
                      </div>
                    </label>
                  ))}
                  <label className={`analysis-option-preset custom-option ${wallAnalysisPreset === 'custom' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="wall_analysis_preset"
                      checked={wallAnalysisPreset === 'custom'}
                      onChange={() => setWallAnalysisPreset('custom')}
                    />
                    <div className="analysis-option-content">
                      <span className="analysis-option-title">✏️ {lang === 'fr' ? 'Personnalisé' : 'Custom'}</span>
                      <span className="analysis-option-desc">{lang === 'fr' ? 'Rédigez votre propre prompt' : 'Write your own prompt'}</span>
                    </div>
                  </label>
                </div>

                {wallAnalysisPreset === 'custom' && (
                  <textarea
                    className="analysis-options-textarea"
                    value={wallAnalysisCustomPrompt}
                    onChange={(e) => setWallAnalysisCustomPrompt(e.target.value)}
                    placeholder={lang === 'fr' ? 'Votre prompt personnalisé...' : 'Your custom prompt...'}
                    rows={5}
                  />
                )}
              </div>

              {/* Detail level + Tone */}
              <div className="analysis-options-row">
                <div className="analysis-options-section analysis-options-half">
                  <h3>{lang === 'fr' ? 'Niveau de détail' : 'Detail Level'}</h3>
                  <div className="analysis-options-chips">
                    {[
                      { value: 'concise', label: '📝', fr: 'Concis', en: 'Concise' },
                      { value: 'balanced', label: '⚖️', fr: 'Équilibré', en: 'Balanced' },
                      { value: 'detailed', label: '📚', fr: 'Détaillé', en: 'Detailed' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        className={`analysis-chip ${wallAnalysisDetailLevel === opt.value ? 'active' : ''}`}
                        onClick={() => setWallAnalysisDetailLevel(opt.value)}
                      >
                        {opt.label} {lang === 'fr' ? opt.fr : opt.en}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="analysis-options-section analysis-options-half">
                  <h3>{lang === 'fr' ? 'Ton' : 'Tone'}</h3>
                  <div className="analysis-options-chips">
                    {[
                      { value: 'professional', label: '💼', fr: 'Professionnel', en: 'Professional' },
                      { value: 'friendly', label: '😊', fr: 'Amical', en: 'Friendly' },
                      { value: 'technical', label: '🔧', fr: 'Technique', en: 'Technical' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        className={`analysis-chip ${wallAnalysisTone === opt.value ? 'active' : ''}`}
                        onClick={() => setWallAnalysisTone(opt.value)}
                      >
                        {opt.label} {lang === 'fr' ? opt.fr : opt.en}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="analysis-options-section">
                <h3>{lang === 'fr' ? 'Instructions supplémentaires' : 'Additional instructions'}</h3>
                <textarea
                  className="analysis-options-textarea small"
                  value={wallAnalysisInstructions}
                  onChange={(e) => setWallAnalysisInstructions(e.target.value)}
                  placeholder={lang === 'fr' ? 'Ex: je prépare une exposition sur le thème de la nature, évaluer si la disposition raconte une histoire...' : 'E.g. I\'m preparing a nature-themed exhibition, evaluate if the layout tells a story...'}
                  rows={3}
                />
              </div>
            </div>

            <div className="wall-analysis-options-footer">
              <button className="analysis-options-cancel" onClick={() => setShowWallAnalysisOptions(false)}>
                {lang === 'fr' ? 'Annuler' : 'Cancel'}
              </button>
              <button
                className="analysis-options-run"
                onClick={runWallAnalysis}
                disabled={items.length === 0}
              >
                🎯 {lang === 'fr' ? `Analyser le mur (${items.length} photos)` : `Analyze wall (${items.length} photos)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
