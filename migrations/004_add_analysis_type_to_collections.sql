-- Migration: Add analysis_type to collections
-- Collections now define what type of analysis should be performed on their photos

-- Add analysis_type column to collections
ALTER TABLE public.collections 
ADD COLUMN IF NOT EXISTS analysis_type TEXT DEFAULT 'general';

-- Common analysis types:
-- 'general' - General art analysis
-- 'series' - Series/sequence analysis
-- 'technique' - Technical analysis (brushwork, materials, etc.)
-- 'composition' - Composition and visual structure
-- 'color' - Color palette and harmony analysis
-- 'style' - Artistic style and influences
-- 'custom' - Custom analysis with user-defined instructions

-- Add analysis_instructions column for custom analysis prompts
ALTER TABLE public.collections 
ADD COLUMN IF NOT EXISTS analysis_instructions TEXT;

-- Add comment explaining the columns
COMMENT ON COLUMN public.collections.analysis_type IS 'Type of analysis to perform on photos in this collection';
COMMENT ON COLUMN public.collections.analysis_instructions IS 'Custom instructions for analysis when analysis_type is custom';
