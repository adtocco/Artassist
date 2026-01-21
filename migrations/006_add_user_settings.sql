-- Migration pour ajouter la table user_settings
-- À exécuter dans Supabase SQL Editor

-- Créer la table user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    analysis_detail_level TEXT NOT NULL DEFAULT 'balanced' CHECK (analysis_detail_level IN ('concise', 'balanced', 'detailed')),
    analysis_tone TEXT NOT NULL DEFAULT 'professional' CHECK (analysis_tone IN ('professional', 'friendly', 'technical')),
    focus_areas TEXT[] DEFAULT '{}',
    language_preference TEXT NOT NULL DEFAULT 'fr' CHECK (language_preference IN ('fr', 'en')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Créer un index sur user_id pour une meilleure performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);

-- Activer Row Level Security
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres paramètres
CREATE POLICY "Users can view their own settings"
ON public.user_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent insérer leurs propres paramètres
CREATE POLICY "Users can insert their own settings"
ON public.user_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent modifier leurs propres paramètres
CREATE POLICY "Users can update their own settings"
ON public.user_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres paramètres
CREATE POLICY "Users can delete their own settings"
ON public.user_settings
FOR DELETE
USING (auth.uid() = user_id);
