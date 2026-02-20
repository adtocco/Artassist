import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import './SharedWall.css';

export default function SharedWall({ shareToken }) {
  const viewportRef = useRef(null);

  const [wall, setWall] = useState(null);
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.5);
  const [aspectRatios, setAspectRatios] = useState({});

  // Panning refs
  const panRef = useRef(null);

  useEffect(() => {
    loadSharedWall();
  }, [shareToken]);

  // Wheel zoom
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function onWheel(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(z => Math.min(3, Math.max(0.1, +(z + delta).toFixed(2))));
    }
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [wall]);

  async function loadSharedWall() {
    setLoading(true);
    try {
      // Fetch wall by share_token
      const { data: wallData, error: wErr } = await supabase
        .from('walls')
        .select('*')
        .eq('share_token', shareToken)
        .single();

      if (wErr || !wallData) {
        setError('Mur introuvable ou non partagé.');
        setLoading(false);
        return;
      }
      setWall(wallData);

      // Fetch items
      const { data: itemsData } = await supabase
        .from('wall_items')
        .select('*')
        .eq('wall_id', wallData.id)
        .order('z_index');
      setItems(itemsData || []);

      // Fetch photos referenced by items
      const photoIds = [...new Set((itemsData || []).map(i => i.photo_id))];
      if (photoIds.length > 0) {
        const { data: photosData } = await supabase
          .from('photo_analyses')
          .select('id, photo_url, file_name, photo_name')
          .in('id', photoIds);
        const map = {};
        (photosData || []).forEach(p => { map[p.id] = p; });
        setPhotos(map);
      }
    } catch (err) {
      setError('Erreur lors du chargement.');
    }
    setLoading(false);
  }

  function handleImgLoad(e, pid) {
    const { naturalWidth, naturalHeight } = e.target;
    if (naturalWidth > 0) {
      setAspectRatios(prev => prev[pid] ? prev : { ...prev, [pid]: naturalHeight / naturalWidth });
    }
  }

  function startPan(e) {
    if (e.target.closest('.shared-wall-item')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const origX = pan.x, origY = pan.y;

    function onMove(ev) {
      setPan({ x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (loading) {
    return (
      <div className="shared-wall-loading">
        <div className="spinner"></div>
        <p>Chargement du mur...</p>
      </div>
    );
  }

  if (error || !wall) {
    return (
      <div className="shared-wall-error">
        <h2>🖼</h2>
        <p>{error || 'Mur introuvable.'}</p>
      </div>
    );
  }

  return (
    <div className="shared-wall">
      <header className="shared-wall-header">
        <h2>🖼 {wall.name}</h2>
        <div className="shared-wall-zoom">
          <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}>+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}>−</button>
          <button onClick={() => { setZoom(0.5); setPan({ x: 0, y: 0 }); }}>⌂</button>
        </div>
      </header>

      <div className="shared-wall-viewport" ref={viewportRef}>
        <div
          className="shared-wall-canvas"
          style={{
            width: wall.canvas_width || 3000,
            height: wall.canvas_height || 2000,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            backgroundColor: wall.background_color || '#f5f5f5',
          }}
          onPointerDown={startPan}
        >
          {items.map(item => {
            const photo = photos[item.photo_id];
            if (!photo) return null;
            const aspect = aspectRatios[item.photo_id] || 0.75;
            const h = item.width * aspect;

            return (
              <div
                key={item.id}
                className="shared-wall-item"
                style={{
                  left: item.pos_x,
                  top: item.pos_y,
                  width: item.width,
                  height: h,
                  zIndex: item.z_index,
                }}
              >
                <img
                  src={photo.photo_url}
                  alt={photo.photo_name || photo.file_name || ''}
                  draggable={false}
                  onLoad={(e) => handleImgLoad(e, item.photo_id)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <footer className="shared-wall-footer">
        <span>🎨 ArtAssist — {items.length} photo{items.length !== 1 ? 's' : ''}</span>
      </footer>
    </div>
  );
}
