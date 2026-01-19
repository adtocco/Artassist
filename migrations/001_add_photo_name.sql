-- Migration: Add photo_name column to photo_analyses table
-- This column stores the AI-generated name (1-3 words) for each photo

ALTER TABLE public.photo_analyses 
ADD COLUMN IF NOT EXISTS photo_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.photo_analyses.photo_name IS 'AI-generated poetic name (1-3 words) that captures the essence of the photograph';
