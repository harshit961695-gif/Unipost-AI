-- Add platform-specific post IDs to the posts table
-- These fields store the external platform post IDs returned when publishing
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS facebook_post_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_media_id TEXT,
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_posts_facebook_post_id ON public.posts(facebook_post_id);
CREATE INDEX IF NOT EXISTS idx_posts_instagram_media_id ON public.posts(instagram_media_id);
CREATE INDEX IF NOT EXISTS idx_posts_youtube_video_id ON public.posts(youtube_video_id);
