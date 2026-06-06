-- ============================================================
-- RLS Policy Fixes for Analytics Cron (service_role support)
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Drop the existing INSERT policy on analytics_snapshots
DROP POLICY IF EXISTS "Users can insert own analytics snapshots" ON public.analytics_snapshots;

-- 2. Create new INSERT policy allowing BOTH authenticated users AND service_role
CREATE POLICY "Users and service_role can insert analytics snapshots"
ON public.analytics_snapshots
FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- 3. Add UPDATE policy on analytics_snapshots for service_role
DROP POLICY IF EXISTS "Users and service_role can update analytics snapshots" ON public.analytics_snapshots;
CREATE POLICY "Users and service_role can update analytics snapshots"
ON public.analytics_snapshots
FOR UPDATE
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 4. Add UPDATE policy on post_logs for service_role
DROP POLICY IF EXISTS "Users and service_role can update post logs" ON public.post_logs;
CREATE POLICY "Users and service_role can update post logs"
ON public.post_logs
FOR UPDATE
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 5. Also ensure INSERT on post_logs allows service_role
DROP POLICY IF EXISTS "Users can insert their own post logs" ON public.post_logs;
CREATE POLICY "Users and service_role can insert post logs"
ON public.post_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- 6. Ensure SELECT on analytics_snapshots allows service_role too
DROP POLICY IF EXISTS "Users can view own analytics snapshots" ON public.analytics_snapshots;
CREATE POLICY "Users and service_role can view analytics snapshots"
ON public.analytics_snapshots
FOR SELECT
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 7. Ensure SELECT on post_logs allows service_role
DROP POLICY IF EXISTS "Users can view their own post logs" ON public.post_logs;
CREATE POLICY "Users and service_role can view post logs"
ON public.post_logs
FOR SELECT
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- 8. Add platform column to analytics_snapshots if missing (Prisma schema has it but Supabase may not)
ALTER TABLE public.analytics_snapshots
ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'aggregated';
