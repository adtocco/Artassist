-- Migration: Allow photos to be in multiple collections with different analyses
-- A photo can now belong to multiple collections, each with its own analysis

-- Create junction table for photo-collection relationship with specific analysis
CREATE TABLE IF NOT EXISTS public.collection_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE NOT NULL,
    photo_id UUID REFERENCES public.photo_analyses(id) ON DELETE CASCADE NOT NULL,
    analysis TEXT, -- Analysis specific to this collection's analysis_type
    analysis_type TEXT, -- Snapshot of the analysis type used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    
    -- Ensure a photo can only be in a collection once
    UNIQUE(collection_id, photo_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_collection_photos_collection_id ON public.collection_photos(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_photos_photo_id ON public.collection_photos(photo_id);

-- Enable Row Level Security
ALTER TABLE public.collection_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can only access their own collection_photos via the collection ownership
CREATE POLICY "Users can view their collection photos"
ON public.collection_photos
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.collections c 
        WHERE c.id = collection_photos.collection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert into their collections"
ON public.collection_photos
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.collections c 
        WHERE c.id = collection_photos.collection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their collection photos"
ON public.collection_photos
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.collections c 
        WHERE c.id = collection_photos.collection_id 
        AND c.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete from their collections"
ON public.collection_photos
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.collections c 
        WHERE c.id = collection_photos.collection_id 
        AND c.user_id = auth.uid()
    )
);

-- Note: The old collection_id column in photo_analyses can be kept for backward compatibility
-- or removed later. Photos without collection_photos entries are "uncategorized"

COMMENT ON TABLE public.collection_photos IS 'Junction table linking photos to collections with collection-specific analyses';
COMMENT ON COLUMN public.collection_photos.analysis IS 'AI analysis specific to this collection analysis type';
COMMENT ON COLUMN public.collection_photos.analysis_type IS 'Snapshot of the analysis type used when analysis was generated';
