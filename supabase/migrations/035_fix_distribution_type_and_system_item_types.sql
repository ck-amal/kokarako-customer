-- Migration 035: Fix distribution type constraint + protect system item types
--
-- Problem: distributions.type has CHECK (type IN ('feed','medicine','other'))
-- which rejects custom item types like 'theeta'.
-- Fix: drop that constraint so any item type name is accepted.
--
-- Also: add is_system to item_types so Feed + Medicine cannot be deleted or renamed.

-- 1. Drop the check constraint on distributions.type
ALTER TABLE distributions DROP CONSTRAINT IF EXISTS distributions_type_check;

-- 2. Add is_system column to item_types (false by default — existing custom types are unaffected)
ALTER TABLE item_types ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- 3. Mark Feed and Medicine as system types (case-insensitive match)
UPDATE item_types
SET is_system = true
WHERE LOWER(name) IN ('feed', 'medicine');
