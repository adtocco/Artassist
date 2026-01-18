-- Migration: make `analysis` nullable and add `updated_at` timestamp
-- Run this in Supabase SQL editor or via psql connected to your database.

BEGIN;

-- 1) Allow `analysis` to be NULL so UI can re-queue without clearing the field
ALTER TABLE public.photo_analyses
  ALTER COLUMN analysis DROP NOT NULL;

-- 2) Add an `updated_at` column if it doesn't exist (helpful for audit/ordering)
ALTER TABLE public.photo_analyses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMIT;

-- Note: review permissions and run in a safe maintenance window if necessary.
