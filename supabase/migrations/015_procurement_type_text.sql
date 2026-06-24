-- Change procurement.type from the rigid ENUM to plain TEXT.
--
-- The procurement_type enum only allows ('chicks','feed','medicine','equipment','other').
-- Any item_type added to the catalog (e.g. 'vaccine') breaks procurement saves with:
--   "invalid input value for enum procurement_type: vaccine"
--
-- TEXT is the correct type here: item_types is the source of truth for valid types,
-- not a DB enum. Existing data is preserved — ALTER TYPE preserves all current values.
--
-- The idx_procurement_type index is recreated automatically on TEXT after the ALTER.

ALTER TABLE procurement
  ALTER COLUMN type TYPE TEXT;

DROP TYPE IF EXISTS procurement_type;
