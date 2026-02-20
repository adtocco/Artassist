-- Migration: Add analysis column to collections table
-- This persists collection analysis results so they survive navigation

ALTER TABLE public.collections
ADD COLUMN IF NOT EXISTS analysis TEXT;

COMMENT ON COLUMN public.collections.analysis IS 'Persisted collection analysis result (JSON or markdown) from AI analysis';
