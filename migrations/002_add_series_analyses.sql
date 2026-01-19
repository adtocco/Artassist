-- Migration: Add series_analyses table for saved series recommendations
-- This allows users to save and share their photo series analyses

-- Create series_analyses table
CREATE TABLE IF NOT EXISTS public.series_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    analysis TEXT NOT NULL,
    photo_ids UUID[] NOT NULL,
    instructions TEXT,
    is_public BOOLEAN DEFAULT false,
    share_token TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_series_analyses_user_id ON public.series_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_series_analyses_created_at ON public.series_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_series_analyses_share_token ON public.series_analyses(share_token);
CREATE INDEX IF NOT EXISTS idx_series_analyses_is_public ON public.series_analyses(is_public);

-- Enable Row Level Security
ALTER TABLE public.series_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own series analyses
CREATE POLICY "Users can view their own series analyses"
ON public.series_analyses
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Anyone can view public series analyses (for sharing)
CREATE POLICY "Anyone can view public series analyses"
ON public.series_analyses
FOR SELECT
USING (is_public = true);

-- Policy: Users can insert their own series analyses
CREATE POLICY "Users can insert their own series analyses"
ON public.series_analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own series analyses
CREATE POLICY "Users can update their own series analyses"
ON public.series_analyses
FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own series analyses
CREATE POLICY "Users can delete their own series analyses"
ON public.series_analyses
FOR DELETE
USING (auth.uid() = user_id);

-- Function to generate a unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE public.series_analyses IS 'Stores saved photo series analyses with optional public sharing';
COMMENT ON COLUMN public.series_analyses.share_token IS 'Unique token for public sharing without authentication';
COMMENT ON COLUMN public.series_analyses.photo_ids IS 'Array of photo_analyses IDs included in this series';
