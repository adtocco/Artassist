-- Migration: Add custom prompts columns to user_settings
-- Store per-user customizable prompts for photo, collection, and series analyses

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS prompt_photo_analysis TEXT,
  ADD COLUMN IF NOT EXISTS prompt_collection_analysis TEXT,
  ADD COLUMN IF NOT EXISTS prompt_series_analysis TEXT;

COMMENT ON COLUMN public.user_settings.prompt_photo_analysis IS 'Custom system prompt for individual photo analysis';
COMMENT ON COLUMN public.user_settings.prompt_collection_analysis IS 'Custom system prompt for collection-level analysis';
COMMENT ON COLUMN public.user_settings.prompt_series_analysis IS 'Custom system prompt for series analysis';
