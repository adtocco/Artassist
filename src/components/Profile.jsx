import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_PROMPTS, PROMPT_PRESETS } from '../lib/openai';
import './Profile.css';

// Helper to detect which preset matches a saved prompt (or 'custom')
function detectActivePreset(promptValue, presets, lang) {
  if (!promptValue) return presets[0].id; // default = first preset
  for (const preset of presets) {
    if (promptValue.trim() === (preset.prompt[lang] || preset.prompt.fr).trim()) {
      return preset.id;
    }
  }
  return 'custom';
}

export default function Profile({ user, lang = 'fr', onSettingsUpdate }) {
  const [settings, setSettings] = useState({
    analysis_detail_level: 'balanced',
    analysis_tone: 'professional',
    focus_areas: [],
    language_preference: 'fr',
    prompt_photo_analysis: '',
    prompt_collection_analysis: '',
    prompt_series_analysis: ''
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('general');

  // Track which preset is active per prompt type
  const [activePresets, setActivePresets] = useState({
    photo: 'artistic',
    collection: 'curator',
    series: 'coherence'
  });

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

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const loaded = {
          analysis_detail_level: data.analysis_detail_level || 'balanced',
          analysis_tone: data.analysis_tone || 'professional',
          focus_areas: data.focus_areas || [],
          language_preference: data.language_preference || 'fr',
          prompt_photo_analysis: data.prompt_photo_analysis || '',
          prompt_collection_analysis: data.prompt_collection_analysis || '',
          prompt_series_analysis: data.prompt_series_analysis || ''
        };
        setSettings(loaded);

        // Detect active presets from saved values
        setActivePresets({
          photo: detectActivePreset(loaded.prompt_photo_analysis, PROMPT_PRESETS.photo, lang),
          collection: detectActivePreset(loaded.prompt_collection_analysis, PROMPT_PRESETS.collection, lang),
          series: detectActivePreset(loaded.prompt_series_analysis, PROMPT_PRESETS.series, lang)
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
          prompt_photo_analysis: settings.prompt_photo_analysis || null,
          prompt_collection_analysis: settings.prompt_collection_analysis || null,
          prompt_series_analysis: settings.prompt_series_analysis || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      alert(lang === 'fr' ? 'Profil sauvegardé avec succès !' : 'Profile saved successfully!');
      onSettingsUpdate?.(settings);
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

  const selectPreset = (type, presetId) => {
    const settingsField = `prompt_${type}_analysis`;
    setActivePresets({ ...activePresets, [type]: presetId });

    if (presetId === 'custom') {
      // Keep current value as base for custom editing — if empty, use first preset
      if (!settings[settingsField]) {
        const defaultPreset = PROMPT_PRESETS[type][0];
        setSettings({ ...settings, [settingsField]: defaultPreset.prompt[lang] || defaultPreset.prompt.fr });
      }
    } else {
      const preset = PROMPT_PRESETS[type].find(p => p.id === presetId);
      if (preset) {
        setSettings({ ...settings, [settingsField]: preset.prompt[lang] || preset.prompt.fr });
      }
    }
  };

  const renderPromptSelector = (type, titleIcon, titleFr, titleEn, descFr, descEn) => {
    const settingsField = `prompt_${type}_analysis`;
    const presets = PROMPT_PRESETS[type];
    const activePreset = activePresets[type];

    return (
      <div className="prompt-block">
        <div className="prompt-block-header">
          <h3>{titleIcon} {lang === 'fr' ? titleFr : titleEn}</h3>
        </div>
        <p className="prompt-description">
          {lang === 'fr' ? descFr : descEn}
        </p>

        <div className="prompt-presets">
          {presets.map(preset => (
            <label
              key={preset.id}
              className={`prompt-preset-option ${activePreset === preset.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name={`preset_${type}`}
                checked={activePreset === preset.id}
                onChange={() => selectPreset(type, preset.id)}
              />
              <div className="preset-content">
                <span className="preset-title">{lang === 'fr' ? preset.labelFr : preset.labelEn}</span>
                <span className="preset-desc">{lang === 'fr' ? preset.descFr : preset.descEn}</span>
              </div>
            </label>
          ))}

          {/* Custom option */}
          <label
            className={`prompt-preset-option custom-option ${activePreset === 'custom' ? 'active' : ''}`}
          >
            <input
              type="radio"
              name={`preset_${type}`}
              checked={activePreset === 'custom'}
              onChange={() => selectPreset(type, 'custom')}
            />
            <div className="preset-content">
              <span className="preset-title">✏️ {lang === 'fr' ? 'Personnalisé' : 'Custom'}</span>
              <span className="preset-desc">{lang === 'fr' ? 'Rédigez votre propre prompt d\'analyse' : 'Write your own analysis prompt'}</span>
            </div>
          </label>
        </div>

        {/* Custom textarea — shown when custom is selected */}
        {activePreset === 'custom' && (
          <div className="prompt-custom-editor">
            <textarea
              className="prompt-textarea"
              value={settings[settingsField]}
              onChange={(e) => setSettings({ ...settings, [settingsField]: e.target.value })}
              placeholder={lang === 'fr' ? 'Écrivez votre prompt personnalisé ici...' : 'Write your custom prompt here...'}
              rows={10}
            />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          {lang === 'fr' ? 'Chargement...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h2>👤 {lang === 'fr' ? 'Mon Profil' : 'My Profile'}</h2>
        <p className="profile-email">{user.email}</p>
      </div>

      {/* Section navigation */}
      <div className="profile-nav">
        <button
          className={`profile-nav-btn ${activeSection === 'general' ? 'active' : ''}`}
          onClick={() => setActiveSection('general')}
        >
          ⚙️ {lang === 'fr' ? 'Paramètres généraux' : 'General Settings'}
        </button>
        <button
          className={`profile-nav-btn ${activeSection === 'prompts' ? 'active' : ''}`}
          onClick={() => setActiveSection('prompts')}
        >
          ✏️ {lang === 'fr' ? 'Prompts d\'analyse' : 'Analysis Prompts'}
        </button>
      </div>

      {/* General Settings Section */}
      {activeSection === 'general' && (
        <div className="profile-section">
          <div className="settings-block">
            <h3>{lang === 'fr' ? 'Niveau de détail' : 'Detail Level'}</h3>
            <p className="settings-description">
              {lang === 'fr'
                ? 'Contrôlez la longueur et la profondeur des analyses'
                : 'Control the length and depth of analyses'}
            </p>
            <div className="settings-options">
              {[
                { value: 'concise', iconFr: '📝 Concis', iconEn: '📝 Concise', descFr: 'Analyses courtes et directes', descEn: 'Short and direct analyses' },
                { value: 'balanced', iconFr: '⚖️ Équilibré', iconEn: '⚖️ Balanced', descFr: 'Bon compromis détail/concision', descEn: 'Good balance of detail and brevity' },
                { value: 'detailed', iconFr: '📚 Détaillé', iconEn: '📚 Detailed', descFr: 'Analyses approfondies et complètes', descEn: 'In-depth and comprehensive analyses' }
              ].map(opt => (
                <label key={opt.value} className={`settings-option ${settings.analysis_detail_level === opt.value ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="detail_level"
                    value={opt.value}
                    checked={settings.analysis_detail_level === opt.value}
                    onChange={(e) => setSettings({ ...settings, analysis_detail_level: e.target.value })}
                  />
                  <div className="option-content">
                    <span className="option-title">{lang === 'fr' ? opt.iconFr : opt.iconEn}</span>
                    <span className="option-desc">{lang === 'fr' ? opt.descFr : opt.descEn}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="settings-block">
            <h3>{lang === 'fr' ? 'Ton des analyses' : 'Analysis Tone'}</h3>
            <p className="settings-description">
              {lang === 'fr'
                ? 'Ajustez le style de communication de l\'analyse'
                : 'Adjust the communication style of analyses'}
            </p>
            <div className="settings-options">
              {[
                { value: 'professional', iconFr: '💼 Professionnel', iconEn: '💼 Professional', descFr: 'Formel et expert', descEn: 'Formal and expert' },
                { value: 'friendly', iconFr: '😊 Amical', iconEn: '😊 Friendly', descFr: 'Accessible et encourageant', descEn: 'Accessible and encouraging' },
                { value: 'technical', iconFr: '🔧 Technique', iconEn: '🔧 Technical', descFr: 'Termes techniques précis', descEn: 'Precise technical terms' }
              ].map(opt => (
                <label key={opt.value} className={`settings-option ${settings.analysis_tone === opt.value ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="tone"
                    value={opt.value}
                    checked={settings.analysis_tone === opt.value}
                    onChange={(e) => setSettings({ ...settings, analysis_tone: e.target.value })}
                  />
                  <div className="option-content">
                    <span className="option-title">{lang === 'fr' ? opt.iconFr : opt.iconEn}</span>
                    <span className="option-desc">{lang === 'fr' ? opt.descFr : opt.descEn}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="settings-block">
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
        </div>
      )}

      {/* Prompts Section */}
      {activeSection === 'prompts' && (
        <div className="profile-section">
          <p className="prompts-intro">
            {lang === 'fr'
              ? 'Choisissez un style d\'analyse prédéfini ou créez votre propre prompt personnalisé pour chaque type d\'analyse.'
              : 'Choose a predefined analysis style or create your own custom prompt for each analysis type.'}
          </p>

          {renderPromptSelector('photo', '📸',
            'Analyse de photo individuelle', 'Individual Photo Analysis',
            'Ce prompt définit comment l\'IA analyse chaque photo individuellement.',
            'This prompt defines how the AI analyzes each individual photo.'
          )}

          {renderPromptSelector('collection', '📂',
            'Analyse de collection', 'Collection Analysis',
            'Ce prompt est utilisé quand vous cliquez « Analyser la collection » pour obtenir des recommandations de séries.',
            'This prompt is used when you click "Analyze Collection" to get series recommendations.'
          )}

          {renderPromptSelector('series', '📋',
            'Analyse de série', 'Series Analysis',
            'Ce prompt est utilisé pour analyser une série de photos que vous avez créée dans une collection.',
            'This prompt is used to analyze a photo series you created within a collection.'
          )}
        </div>
      )}

      {/* Save button - always visible */}
      <div className="profile-actions">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="save-profile-btn"
        >
          {saving
            ? (lang === 'fr' ? '💾 Sauvegarde...' : '💾 Saving...')
            : (lang === 'fr' ? '💾 Sauvegarder le profil' : '💾 Save Profile')}
        </button>
      </div>
    </div>
  );
}
