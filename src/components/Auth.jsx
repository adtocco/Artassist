import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info', 'success', 'error'
  const [devLoggedIn, setDevLoggedIn] = useState(false);

  // Check if we're coming back from a password reset link
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    
    if (type === 'recovery') {
      setIsResetPassword(true);
      setMessage('Entrez votre nouveau mot de passe');
      setMessageType('info');
    }
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Vérifiez votre email pour le lien de confirmation !');
        setMessageType('success');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#type=recovery`,
      });
      if (error) throw error;
      setMessage('Un email de réinitialisation a été envoyé ! Vérifiez votre boîte de réception.');
      setMessageType('success');
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (newPassword !== confirmPassword) {
      setMessage('Les mots de passe ne correspondent pas');
      setMessageType('error');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Le mot de passe doit contenir au moins 6 caractères');
      setMessageType('error');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage('Mot de passe mis à jour avec succès ! Vous allez être connecté...');
      setMessageType('success');
      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname);
      setTimeout(() => {
        setIsResetPassword(false);
        window.location.reload();
      }, 2000);
    } catch (error) {
      setMessage(error.message);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setIsForgotPassword(false);
    setIsResetPassword(false);
    setMessage('');
    setEmail('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
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
            {/* Reset Password Form (when coming from email link) */}
            {isResetPassword ? (
              <form onSubmit={handleResetPassword} className="auth-form">
                <input
                  type="password"
                  placeholder="Nouveau mot de passe"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
                <input
                  type="password"
                  placeholder="Confirmer le mot de passe"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            ) : isForgotPassword ? (
              /* Forgot Password Form */
              <form onSubmit={handleForgotPassword} className="auth-form">
                <input
                  type="email"
                  placeholder="Votre email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <button type="submit" disabled={loading}>
                  {loading ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
                </button>
              </form>
            ) : (
              /* Normal Login/Signup Form */
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
            )}

            {message && (
              <p className={`auth-message ${messageType}`}>{message}</p>
            )}

            {/* Navigation buttons */}
            {isResetPassword ? (
              <button 
                className="toggle-auth"
                onClick={backToLogin}
                disabled={loading}
              >
                Retour à la connexion
              </button>
            ) : isForgotPassword ? (
              <button 
                className="toggle-auth"
                onClick={backToLogin}
                disabled={loading}
              >
                Retour à la connexion
              </button>
            ) : (
              <>
                <button 
                  className="toggle-auth"
                  onClick={() => setIsSignUp(!isSignUp)}
                  disabled={loading}
                >
                  {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>

                {!isSignUp && (
                  <button 
                    className="toggle-auth forgot-password"
                    onClick={() => setIsForgotPassword(true)}
                    disabled={loading}
                  >
                    Mot de passe oublié ?
                  </button>
                )}
              </>
            )}

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
