import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [message, setMessage] = useState('');
  const [devLoggedIn, setDevLoggedIn] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Dev login bypass
  const handleDevLogin = async () => {
    setLoading(true);
    setMessage('');

    const devEmail = import.meta.env.VITE_DEV_EMAIL;
    const devPass = import.meta.env.VITE_DEV_PASSWORD;
    const isDevEnv = !!import.meta.env.DEV;

    if (isDevEnv && devEmail && devPass) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: devEmail, password: devPass });
        if (error) throw error;
        setMessage('Connecté en mode développeur via Supabase');
        setLoading(false);
        return;
      } catch (err) {
        console.error('Dev Supabase sign-in failed:', err);
        setMessage('Échec connexion dev Supabase — fallback local');
      }
    }

    // Fallback: local bypass (no supabase session)
    setDevLoggedIn(true);
    setMessage('Connecté en mode développeur (bypass auth)');
    setLoading(false);
  };

  const handleDevLogout = () => {
    setDevLoggedIn(false);
    setMessage('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>🎨 ArtAssist</h1>
        <p className="auth-subtitle">
          AI-Powered Artistic Photo Analysis
        </p>

        {!devLoggedIn ? (
          <>
            <form onSubmit={handleAuth} className="auth-form">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
              </button>
            </form>

            {message && <p className="auth-message">{message}</p>}

            <button 
              className="toggle-auth"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={loading}
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>

            <button
              className="dev-auth"
              style={{ marginTop: '1em', background: '#444', color: '#fff' }}
              onClick={handleDevLogin}
              disabled={loading}
            >
              Connexion dev (bypass auth)
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <p className="auth-message">Connecté en mode développeur. Toutes les fonctionnalités sont accessibles.</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="toggle-auth"
                onClick={handleDevLogout}
              >
                Retour au menu
              </button>
              <button
                className="toggle-auth"
                onClick={() => { window.location.reload(); }}
              >
                Reload
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
