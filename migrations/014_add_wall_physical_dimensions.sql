-- Migration: Add physical dimensions (in cm) to walls
-- Allows proportional display of photo sizes relative to real wall dimensions

ALTER TABLE public.walls
  ADD COLUMN IF NOT EXISTS physical_width_cm INT NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS physical_height_cm INT NOT NULL DEFAULT 220;

COMMENT ON COLUMN public.walls.physical_width_cm IS 'Real wall width in centimeters (e.g. 600 = 6m)';
COMMENT ON COLUMN public.walls.physical_height_cm IS 'Real wall height in centimeters (e.g. 220 = 2.20m)';
