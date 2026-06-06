-- Add tracking points to post_logs for multi-platform merged analytics
ALTER TABLE public.post_logs 
ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- Add JSONB column to analytics_snapshots for per-platform metrics
ALTER TABLE public.analytics_snapshots
ADD COLUMN IF NOT EXISTS platform_metrics JSONB DEFAULT '{}'::jsonb;
