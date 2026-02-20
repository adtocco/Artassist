-- Migration: Add missing UPDATE policy for photo_analyses
-- Without this, all .update() calls from the frontend fail silently (RLS blocks them)

-- 1. Add UPDATE policy for photo_analyses (was missing from original schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'photo_analyses' AND policyname = 'Users can update their own photo analyses'
  ) THEN
    CREATE POLICY "Users can update their own photo analyses"
    ON public.photo_analyses
    FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Drop NOT NULL constraint on analysis column (photos can be uploaded without analysis)
ALTER TABLE public.photo_analyses ALTER COLUMN analysis DROP NOT NULL;

-- 3. Relax prompt_type CHECK constraint to allow custom preset IDs
ALTER TABLE public.photo_analyses DROP CONSTRAINT IF EXISTS photo_analyses_prompt_type_check;
-- No replacement constraint needed — prompt_type is now free text

