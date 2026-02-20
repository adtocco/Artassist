-- Migration: Add mat/passe-partout fields to wall_items
-- Adds a configurable white space (mat) between the frame and the photo
ALTER TABLE wall_items ADD COLUMN IF NOT EXISTS mat_width_cm REAL DEFAULT 0;
ALTER TABLE wall_items ADD COLUMN IF NOT EXISTS mat_color TEXT DEFAULT '#ffffff';

COMMENT ON COLUMN wall_items.mat_width_cm IS 'Width of the mat/passe-partout in centimeters';
COMMENT ON COLUMN wall_items.mat_color IS 'Color of the mat/passe-partout (default white)';
