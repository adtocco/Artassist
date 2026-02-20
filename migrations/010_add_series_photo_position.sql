-- Migration: Add position column to series_photos for ordering
ALTER TABLE public.series_photos ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Create index for ordering
CREATE INDEX IF NOT EXISTS idx_series_photos_position ON public.series_photos(series_id, position);
