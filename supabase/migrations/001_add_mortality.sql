-- Add mortality_count to batches table
-- Run in Supabase SQL Editor

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS mortality_count INTEGER NOT NULL DEFAULT 0 CHECK (mortality_count >= 0);
