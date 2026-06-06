-- Add page_id and instagram_business_id columns to connected_accounts
-- These were previously only stored inside the metadata JSONB column.
-- Adding them as top-level columns for faster queries and consistency.
-- The application code now reads from metadata JSONB as primary source
-- with fallback to these columns when they exist.

ALTER TABLE connected_accounts 
ADD COLUMN IF NOT EXISTS page_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_business_id TEXT;

-- Backfill from existing metadata JSONB for any existing records
UPDATE connected_accounts 
SET page_id = metadata->>'page_id'
WHERE page_id IS NULL 
AND metadata->>'page_id' IS NOT NULL;

UPDATE connected_accounts 
SET instagram_business_id = metadata->>'instagram_business_id'
WHERE instagram_business_id IS NULL 
AND metadata->>'instagram_business_id' IS NOT NULL;
