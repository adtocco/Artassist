-- Migration: add analysis queue columns to photo_analyses
ALTER TABLE photo_analyses
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS analysis_finished_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS processor TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;
