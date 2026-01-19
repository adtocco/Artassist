import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import PhotoUpload from './components/PhotoUpload';
import PhotoGallery from './components/PhotoGallery';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lang, setLang] = useState('fr');

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

      <main className="app-main">
        <PhotoUpload onPhotoAnalyzed={handlePhotoAnalyzed} lang={lang} />
        <PhotoGallery refreshTrigger={refreshTrigger} lang={lang} />
      </main>

      <footer className="app-footer">
        <p>AI-Powered Artistic Photo Analysis with GPT-4</p>
      </footer>
    </div>
  );
}

export default App;
