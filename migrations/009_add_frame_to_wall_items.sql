-- Add frame customization fields to wall_items
ALTER TABLE wall_items ADD COLUMN IF NOT EXISTS frame_color TEXT DEFAULT NULL;
ALTER TABLE wall_items ADD COLUMN IF NOT EXISTS frame_width_cm REAL DEFAULT 0;
