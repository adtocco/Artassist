-- ArtAssist Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true);

-- Create photo_analyses table
CREATE TABLE IF NOT EXISTS public.photo_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    photo_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    analysis TEXT NOT NULL,
    prompt_type TEXT NOT NULL CHECK (prompt_type IN ('artist', 'gallery', 'socialMedia')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_photo_analyses_user_id ON public.photo_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_analyses_created_at ON public.photo_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_analyses_prompt_type ON public.photo_analyses(prompt_type);

-- Enable Row Level Security
ALTER TABLE public.photo_analyses ENABLE ROW LEVEL SECURITY;

-- Create policies for photo_analyses
-- Policy: Users can view their own analyses
CREATE POLICY "Users can view their own photo analyses"
ON public.photo_analyses
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own analyses
CREATE POLICY "Users can insert their own photo analyses"
ON public.photo_analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own analyses
CREATE POLICY "Users can delete their own photo analyses"
ON public.photo_analyses
FOR DELETE
USING (auth.uid() = user_id);

-- Storage policies for photos bucket
-- Policy: Anyone can view photos (since bucket is public)
CREATE POLICY "Public photos are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'photos');

-- Policy: Authenticated users can upload photos
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'photos' AND
    auth.role() = 'authenticated'
);

-- Policy: Users can delete their own photos
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
);
