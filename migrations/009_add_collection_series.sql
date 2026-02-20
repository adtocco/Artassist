-- Migration: Add collection_series table for grouping photos into series within a collection
-- A series is a named subset of photos within a collection that can be analyzed together

-- Create collection_series table
CREATE TABLE IF NOT EXISTS public.collection_series (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    analysis TEXT, -- Series analysis result
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create junction table for series-photos relationship
CREATE TABLE IF NOT EXISTS public.series_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    series_id UUID REFERENCES public.collection_series(id) ON DELETE CASCADE NOT NULL,
    photo_id UUID REFERENCES public.photo_analyses(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    
    -- A photo can only be in a series once
    UNIQUE(series_id, photo_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_collection_series_collection_id ON public.collection_series(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_series_user_id ON public.collection_series(user_id);
CREATE INDEX IF NOT EXISTS idx_series_photos_series_id ON public.series_photos(series_id);
CREATE INDEX IF NOT EXISTS idx_series_photos_photo_id ON public.series_photos(photo_id);

-- Enable Row Level Security
ALTER TABLE public.collection_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collection_series
CREATE POLICY "Users can view their own series"
ON public.collection_series FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own series"
ON public.collection_series FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own series"
ON public.collection_series FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own series"
ON public.collection_series FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for series_photos (via collection_series ownership)
CREATE POLICY "Users can view their series photos"
ON public.series_photos FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.collection_series cs
        WHERE cs.id = series_photos.series_id
        AND cs.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert into their series"
ON public.series_photos FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.collection_series cs
        WHERE cs.id = series_photos.series_id
        AND cs.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete from their series"
ON public.series_photos FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.collection_series cs
        WHERE cs.id = series_photos.series_id
        AND cs.user_id = auth.uid()
    )
);

COMMENT ON TABLE public.collection_series IS 'Named series of photos within a collection';
COMMENT ON TABLE public.series_photos IS 'Junction table linking photos to series';
