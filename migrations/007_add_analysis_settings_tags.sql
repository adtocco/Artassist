-- Migration pour ajouter les paramètres d'analyse dans photo_analyses
-- À exécuter dans Supabase SQL Editor

-- Ajouter les colonnes pour stocker les paramètres d'analyse utilisés
ALTER TABLE public.photo_analyses
ADD COLUMN IF NOT EXISTS analysis_detail_level TEXT CHECK (analysis_detail_level IN ('concise', 'balanced', 'detailed')),
ADD COLUMN IF NOT EXISTS analysis_tone TEXT CHECK (analysis_tone IN ('professional', 'friendly', 'technical')),
ADD COLUMN IF NOT EXISTS analysis_focus_areas TEXT[] DEFAULT '{}';

-- Créer des index pour améliorer les requêtes par paramètres
CREATE INDEX IF NOT EXISTS idx_photo_analyses_detail_level ON public.photo_analyses(analysis_detail_level);
CREATE INDEX IF NOT EXISTS idx_photo_analyses_tone ON public.photo_analyses(analysis_tone);

-- Ajouter aussi dans collection_photos pour les analyses spécifiques aux collections
ALTER TABLE public.collection_photos
ADD COLUMN IF NOT EXISTS analysis_detail_level TEXT CHECK (analysis_detail_level IN ('concise', 'balanced', 'detailed')),
ADD COLUMN IF NOT EXISTS analysis_tone TEXT CHECK (analysis_tone IN ('professional', 'friendly', 'technical')),
ADD COLUMN IF NOT EXISTS analysis_focus_areas TEXT[] DEFAULT '{}';
