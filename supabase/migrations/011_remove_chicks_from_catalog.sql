-- Migration 011: Remove Chicks from item_types catalog.
-- Chick counts are recorded at batch creation, not via procurement catalog.
-- Must delete in order: procurement FKs → items → item_types (no CASCADE on FK).

-- 1. Nullify procurement.item_id for any rows pointing to Chick items
UPDATE procurement
  SET item_id = NULL
  WHERE item_id IN (
    SELECT i.id FROM items i
    JOIN item_types t ON t.id = i.item_type_id
    WHERE LOWER(t.name) LIKE '%chick%'
  );

-- 2. Delete items belonging to the Chicks type
DELETE FROM items
  WHERE item_type_id IN (
    SELECT id FROM item_types WHERE LOWER(name) LIKE '%chick%'
  );

-- 3. Now safe to delete the Chicks item_type
DELETE FROM item_types WHERE LOWER(name) LIKE '%chick%';
