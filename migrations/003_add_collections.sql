-- Migration: Add collections table for organizing photos
-- Users can create multiple collections to organize their photos

-- Create collections table
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_photo_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Add collection_id to photo_analyses (optional - null means no collection)
ALTER TABLE public.photo_analyses 
ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON public.collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collections_created_at ON public.collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_analyses_collection_id ON public.photo_analyses(collection_id);

-- Enable Row Level Security
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- Policies for collections
CREATE POLICY "Users can view their own collections"
ON public.collections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collections"
ON public.collections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections"
ON public.collections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections"
ON public.collections
FOR DELETE
USING (auth.uid() = user_id);

-- Add foreign key constraint for cover_photo_id after photo_analyses exists
ALTER TABLE public.collections
ADD CONSTRAINT fk_cover_photo
FOREIGN KEY (cover_photo_id) 
REFERENCES public.photo_analyses(id) 
ON DELETE SET NULL;

-- Comments
COMMENT ON TABLE public.collections IS 'User-created collections for organizing photos';
COMMENT ON COLUMN public.collections.cover_photo_id IS 'Optional cover photo for the collection thumbnail';
COMMENT ON COLUMN public.photo_analyses.collection_id IS 'Optional collection this photo belongs to';
