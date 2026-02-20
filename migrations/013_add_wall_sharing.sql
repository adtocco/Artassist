-- Migration: Add share_token to walls for public sharing

ALTER TABLE public.walls
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Public read policy: anyone can view shared walls by token
CREATE POLICY walls_public_read_policy ON public.walls
  FOR SELECT USING (share_token IS NOT NULL);

-- Public read for wall_items of shared walls
CREATE POLICY wall_items_public_read_policy ON public.wall_items
  FOR SELECT USING (
    wall_id IN (SELECT id FROM public.walls WHERE share_token IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_walls_share_token ON public.walls(share_token) WHERE share_token IS NOT NULL;

COMMENT ON COLUMN public.walls.share_token IS 'Unique token for public sharing. NULL = private.';
