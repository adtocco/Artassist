import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './UserSettings.css';

export default function UserSettings({ user, lang = 'fr', onClose, onSettingsUpdate }) {
  const [settings, setSettings] = useState({
    analysis_detail_level: 'balanced', // concise, balanced, detailed
    analysis_tone: 'professional', // professional, friendly, technical
    focus_areas: [], // composition, lighting, colors, emotion, technique
    language_preference: 'fr'
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setSettings({
          analysis_detail_level: data.analysis_detail_level || 'balanced',
          analysis_tone: data.analysis_tone || 'professional',
          focus_areas: data.focus_areas || [],
          language_preference: data.language_preference || 'fr'
        });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          analysis_detail_level: settings.analysis_detail_level,
          analysis_tone: settings.analysis_tone,
          focus_areas: settings.focus_areas,
          language_preference: settings.language_preference,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      alert(lang === 'fr' ? 'Paramètres sauvegardés avec succès !' : 'Settings saved successfully!');
      onSettingsUpdate?.(settings);
      onClose();
    } catch (err) {
      console.error('Error saving settings:', err);
      alert(lang === 'fr' ? 'Erreur lors de la sauvegarde' : 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleFocusArea = (area) => {
    const newFocusAreas = settings.focus_areas.includes(area)
      ? settings.focus_areas.filter(a => a !== area)
      : [...settings.focus_areas, area];
    setSettings({ ...settings, focus_areas: newFocusAreas });
  };

  if (loading) {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-loading">
            {lang === 'fr' ? 'Chargement...' : 'Loading...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="settings-close" onClick={onClose}>×</button>
        
        <h2>⚙️ {lang === 'fr' ? 'Paramètres des analyses' : 'Analysis Settings'}</h2>
        
        <div className="settings-section">
          <h3>{lang === 'fr' ? 'Niveau de détail' : 'Detail Level'}</h3>
          <p className="settings-description">
            {lang === 'fr' 
              ? 'Contrôlez la longueur et la profondeur des analyses' 
              : 'Control the length and depth of analyses'}
          </p>
          <div className="settings-options">
            <label className={`settings-option ${settings.analysis_detail_level === 'concise' ? 'active' : ''}`}>
              <input
                type="radio"
                name="detail_level"
                value="concise"
                checked={settings.analysis_detail_level === 'concise'}
                onChange={(e) => setSettings({ ...settings, analysis_detail_level: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '📝 Concis' : '📝 Concise'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Analyses courtes et directes' : 'Short and direct analyses'}
                </span>
              </div>
            </label>
            <label className={`settings-option ${settings.analysis_detail_level === 'balanced' ? 'active' : ''}`}>
              <input
                type="radio"
                name="detail_level"
                value="balanced"
                checked={settings.analysis_detail_level === 'balanced'}
                onChange={(e) => setSettings({ ...settings, analysis_detail_level: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '⚖️ Équilibré' : '⚖️ Balanced'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Bon compromis détail/concision' : 'Good balance of detail and brevity'}
                </span>
              </div>
            </label>
            <label className={`settings-option ${settings.analysis_detail_level === 'detailed' ? 'active' : ''}`}>
              <input
                type="radio"
                name="detail_level"
                value="detailed"
                checked={settings.analysis_detail_level === 'detailed'}
                onChange={(e) => setSettings({ ...settings, analysis_detail_level: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '📚 Détaillé' : '📚 Detailed'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Analyses approfondies et complètes' : 'In-depth and comprehensive analyses'}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>{lang === 'fr' ? 'Ton des analyses' : 'Analysis Tone'}</h3>
          <p className="settings-description">
            {lang === 'fr' 
              ? 'Ajustez le style de communication de l\'analyse' 
              : 'Adjust the communication style of analyses'}
          </p>
          <div className="settings-options">
            <label className={`settings-option ${settings.analysis_tone === 'professional' ? 'active' : ''}`}>
              <input
                type="radio"
                name="tone"
                value="professional"
                checked={settings.analysis_tone === 'professional'}
                onChange={(e) => setSettings({ ...settings, analysis_tone: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '💼 Professionnel' : '💼 Professional'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Formel et expert' : 'Formal and expert'}
                </span>
              </div>
            </label>
            <label className={`settings-option ${settings.analysis_tone === 'friendly' ? 'active' : ''}`}>
              <input
                type="radio"
                name="tone"
                value="friendly"
                checked={settings.analysis_tone === 'friendly'}
                onChange={(e) => setSettings({ ...settings, analysis_tone: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '😊 Amical' : '😊 Friendly'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Accessible et encourageant' : 'Accessible and encouraging'}
                </span>
              </div>
            </label>
            <label className={`settings-option ${settings.analysis_tone === 'technical' ? 'active' : ''}`}>
              <input
                type="radio"
                name="tone"
                value="technical"
                checked={settings.analysis_tone === 'technical'}
                onChange={(e) => setSettings({ ...settings, analysis_tone: e.target.value })}
              />
              <div className="option-content">
                <span className="option-title">
                  {lang === 'fr' ? '🔧 Technique' : '🔧 Technical'}
                </span>
                <span className="option-desc">
                  {lang === 'fr' ? 'Termes techniques précis' : 'Precise technical terms'}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h3>{lang === 'fr' ? 'Domaines d\'intérêt prioritaires' : 'Priority Focus Areas'}</h3>
          <p className="settings-description">
            {lang === 'fr' 
              ? 'Sélectionnez les aspects sur lesquels vous souhaitez des analyses plus approfondies' 
              : 'Select aspects you want more in-depth analysis on'}
          </p>
          <div className="focus-areas">
            {[
              { value: 'composition', labelFr: '🎯 Composition', labelEn: '🎯 Composition' },
              { value: 'lighting', labelFr: '💡 Éclairage', labelEn: '💡 Lighting' },
              { value: 'colors', labelFr: '🎨 Couleurs', labelEn: '🎨 Colors' },
              { value: 'emotion', labelFr: '💫 Émotion', labelEn: '💫 Emotion' },
              { value: 'technique', labelFr: '⚙️ Technique', labelEn: '⚙️ Technique' }
            ].map((area) => (
              <label key={area.value} className={`focus-area ${settings.focus_areas.includes(area.value) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={settings.focus_areas.includes(area.value)}
                  onChange={() => toggleFocusArea(area.value)}
                />
                <span>{lang === 'fr' ? area.labelFr : area.labelEn}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="settings-actions">
          <button 
            onClick={saveSettings} 
            disabled={saving}
            className="save-settings-btn"
          >
            {saving 
              ? (lang === 'fr' ? '💾 Sauvegarde...' : '💾 Saving...') 
              : (lang === 'fr' ? '💾 Sauvegarder' : '💾 Save Settings')}
          </button>
          <button onClick={onClose} className="cancel-settings-btn">
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
