-- Migration 010: Add is_distributable flag to item_types
-- Allows filtering out non-distributable types (e.g. Chicks) from the
-- Record Distribution form dropdowns.

ALTER TABLE item_types
  ADD COLUMN IF NOT EXISTS is_distributable boolean NOT NULL DEFAULT true;

-- Chicks are procured, not distributed to farms
UPDATE item_types
  SET is_distributable = false
  WHERE LOWER(name) LIKE '%chick%';
