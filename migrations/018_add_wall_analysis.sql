-- Migration: Add analysis column to walls table
-- This persists wall analysis results so they survive navigation

ALTER TABLE public.walls
ADD COLUMN IF NOT EXISTS analysis TEXT;

COMMENT ON COLUMN public.walls.analysis IS 'Persisted wall analysis result (markdown) from AI analysis';
