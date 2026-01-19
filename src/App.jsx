import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import PhotoUpload from './components/PhotoUpload';
import PhotoGallery from './components/PhotoGallery';
import SavedSeries from './components/SavedSeries';
import SharedSeries from './components/SharedSeries';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lang, setLang] = useState('fr');
  const [activeTab, setActiveTab] = useState('gallery');

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handlePhotoAnalyzed = () => {
    // Trigger gallery refresh
    setRefreshTrigger(prev => prev + 1);
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
          <>
            <PhotoUpload onPhotoAnalyzed={handlePhotoAnalyzed} lang={lang} />
            <PhotoGallery refreshTrigger={refreshTrigger} lang={lang} />
          </>
        ) : (
          <SavedSeries lang={lang} />
        )}
      </main>

      <footer className="app-footer">
        <p>AI-Powered Artistic Photo Analysis with GPT-4</p>
      </footer>
    </div>
  );
}

export default App;
