-- Add updated_at column to photo_analyses
ALTER TABLE public.photo_analyses
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

-- Initialize updated_at to created_at for existing rows
UPDATE public.photo_analyses SET updated_at = created_at WHERE updated_at IS NULL;

-- Create a trigger to auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_photo_analyses_updated_at ON public.photo_analyses;

CREATE TRIGGER update_photo_analyses_updated_at
    BEFORE UPDATE ON public.photo_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Also add updated_at to collection_photos for collection-specific analysis dates
ALTER TABLE public.collection_photos
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

UPDATE public.collection_photos SET updated_at = created_at WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS update_collection_photos_updated_at ON public.collection_photos;

CREATE TRIGGER update_collection_photos_updated_at
    BEFORE UPDATE ON public.collection_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
