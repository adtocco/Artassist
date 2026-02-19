import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import PhotoUpload from './components/PhotoUpload';
import PhotoGallery from './components/PhotoGallery';
import SavedSeries from './components/SavedSeries';
import SharedSeries from './components/SharedSeries';
import Collections from './components/Collections';
import UserSettings from './components/UserSettings';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [collectionsRefreshTrigger, setCollectionsRefreshTrigger] = useState(0);
  const [lang, setLang] = useState('fr');
  const [activeTab, setActiveTab] = useState('gallery');
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [collections, setCollections] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [userSettings, setUserSettings] = useState(null);

  // Check if we're on a share URL
  const path = window.location.pathname;
  const shareMatch = path.match(/^\/share\/([a-f0-9]+)$/);
  const shareToken = shareMatch ? shareMatch[1] : null;

  // If share URL, show public view without auth
  if (shareToken) {
    return <SharedSeries shareToken={shareToken} />;
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch collections and user settings when session is available
  useEffect(() => {
    if (session) {
      fetchCollections();
      loadUserSettings();
    }
  }, [session]);

  const fetchCollections = async () => {
    try {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (!error) {
        setCollections(data || []);
      }
    } catch (err) {
      console.error('Error fetching collections:', err);
    }
  };

  const loadUserSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user settings:', error);
        return;
      }

      if (data) {
        setUserSettings({
          analysis_detail_level: data.analysis_detail_level || 'balanced',
          analysis_tone: data.analysis_tone || 'professional',
          focus_areas: data.focus_areas || [],
          language_preference: data.language_preference || 'fr'
        });
      }
    } catch (err) {
      console.error('Error loading user settings:', err);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handlePhotoAnalyzed = () => {
    // Trigger gallery refresh
    setRefreshTrigger(prev => prev + 1);
  };

  const handleCollectionChange = (collection) => {
    setSelectedCollection(collection);
  };

  const handleSettingsUpdate = (newSettings) => {
    setUserSettings(newSettings);
    // Force refresh to apply new settings
    setRefreshTrigger(prev => prev + 1);
    fetchCollections(); // Refresh collections count
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🎨 ArtAssist</h1>
          <div className="header-actions">
            <span className="user-email">{session.user.email}</span>
            <button 
              onClick={() => setShowSettings(true)}
              className="settings-button"
              title={lang === 'fr' ? 'Paramètres' : 'Settings'}
            >
              ⚙️
            </button>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label="Select analysis language"
              className="language-select"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>

            <button onClick={handleSignOut} className="sign-out-button">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <nav className="app-nav">
        <button 
          className={`nav-tab ${activeTab === 'gallery' ? 'active' : ''}`}
          onClick={() => setActiveTab('gallery')}
        >
          📸 {lang === 'fr' ? 'Mes Photos' : 'My Photos'}
        </button>
        <button 
          className={`nav-tab ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          📁 {lang === 'fr' ? 'Séries Sauvegardées' : 'Saved Series'}
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'gallery' ? (
          <div className="gallery-layout">
            <aside className="sidebar">
              <Collections 
                lang={lang} 
                onSelectCollection={handleCollectionChange}
                onRefresh={() => setRefreshTrigger(prev => prev + 1)}
                refreshTrigger={collectionsRefreshTrigger}
                userSettings={userSettings}
              />
            </aside>
            <div className="main-content">
              <PhotoUpload 
                onPhotoAnalyzed={handlePhotoAnalyzed} 
                lang={lang}
                selectedCollection={selectedCollection}
                userSettings={userSettings}
              />
              <PhotoGallery 
                refreshTrigger={refreshTrigger} 
                lang={lang}
                selectedCollection={selectedCollection}
                collections={collections}
                userSettings={userSettings}
                onPhotosChanged={() => setCollectionsRefreshTrigger(prev => prev + 1)}
              />
            </div>
          </div>
        ) : (
          <SavedSeries lang={lang} />
        )}
      </main>

      {showSettings && (
        <UserSettings
          user={session.user}
          lang={lang}
          onClose={() => setShowSettings(false)}
          onSettingsUpdate={handleSettingsUpdate}
        />
      )}

      <footer className="app-footer">
        <p>AI-Powered Artistic Photo Analysis with GPT-4</p>
      </footer>
    </div>
  );
}

export default App;
