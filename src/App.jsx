import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import PhotoUpload from './components/PhotoUpload';
import PhotoGallery from './components/PhotoGallery';
import AnalysisQueue from './components/AnalysisQueue';
import './App.css';
import { supabase } from './lib/supabase';
import { analyzePhoto } from './lib/openai';

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

  // Background processor: claim and process pending analyses for this user
  useEffect(() => {
    if (!session) return;
    let mounted = true;
    const processorId = `client-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    const processOne = async () => {
      try {
        // get one pending item
        const { data: pendingItems } = await supabase
          .from('photo_analyses')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);

        if (!pendingItems || pendingItems.length === 0) return;
        const item = pendingItems[0];

        // Try to claim it
        const { data: claimed, error: claimErr } = await supabase
          .from('photo_analyses')
          .update({ status: 'processing', processor: processorId, analysis_started_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'pending')
          .select()
          .single();

        if (claimErr || !claimed) return; // someone else claimed

        // Create signed URL and analyze
        const { data: signedData } = await supabase.storage.from('photos').createSignedUrl(item.storage_path, 300);
        const urlToAnalyze = signedData?.signedUrl || item.photo_url;

        const analysis = await analyzePhoto(urlToAnalyze, item.prompt_type, lang);

        // update result
        await supabase.from('photo_analyses').update({ status: 'done', analysis, analysis_finished_at: new Date().toISOString(), processor: processorId }).eq('id', item.id);
      } catch (err) {
        console.error('Background processing error', err);
        // mark item as error if possible
        try {
          if (err && err.id) {
            await supabase.from('photo_analyses').update({ status: 'error', error_message: err.message }).eq('id', err.id);
          }
        } catch (e) {}
      }
    };

    const iv = setInterval(() => {
      if (!mounted) return;
      processOne();
    }, 8000);

    // initial kick
    processOne();

    return () => { mounted = false; clearInterval(iv); };
  }, [session, lang]);

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
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', width: '100%' }}>
          <div style={{ flex: 2 }}>
            <PhotoUpload onPhotoAnalyzed={handlePhotoAnalyzed} lang={lang} />
            <PhotoGallery refreshTrigger={refreshTrigger} lang={lang} />
          </div>
          <div style={{ flex: 1 }}>
            <AnalysisQueue lang={lang} />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>AI-Powered Artistic Photo Analysis with GPT-4</p>
      </footer>
    </div>
  );
}

export default App;
