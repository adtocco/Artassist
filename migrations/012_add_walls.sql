-- Migration: Add walls and wall_items tables for the "Mur" feature
-- Allows free-form positioning and resizing of photos on a virtual wall

CREATE TABLE IF NOT EXISTS public.walls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Nouveau mur',
  canvas_width INT NOT NULL DEFAULT 3000,
  canvas_height INT NOT NULL DEFAULT 2000,
  background_color TEXT NOT NULL DEFAULT '#f5f5f5',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wall_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wall_id UUID NOT NULL REFERENCES public.walls(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES public.photo_analyses(id) ON DELETE CASCADE,
  pos_x FLOAT NOT NULL DEFAULT 0,
  pos_y FLOAT NOT NULL DEFAULT 0,
  width FLOAT NOT NULL DEFAULT 300,
  z_index INT NOT NULL DEFAULT 0,
  rotation FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.walls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wall_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY walls_user_policy ON public.walls
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY wall_items_user_policy ON public.wall_items
  FOR ALL USING (
    wall_id IN (SELECT id FROM public.walls WHERE user_id = auth.uid())
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_walls_user_id ON public.walls(user_id);
CREATE INDEX IF NOT EXISTS idx_wall_items_wall_id ON public.wall_items(wall_id);

COMMENT ON TABLE public.walls IS 'Virtual walls for free-form photo arrangement';
COMMENT ON TABLE public.wall_items IS 'Individual photo placements on a wall';
