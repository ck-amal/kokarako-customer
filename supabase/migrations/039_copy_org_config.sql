-- Migration 039: Copy item config + fee config from one org to another
--
-- Source org: 03b8f245-c070-4301-9505-0c2f62cfa2ae
-- Target org: 653ff503-ab18-4f06-97f8-5afc87ef2950
--
-- Copies:
--   1. item_types  (skips by name if already exists in target)
--   2. items       (skips by name+type if already exists in target)
--   3. growing_fee_config (replaces target config entirely)
--
-- Safe to run multiple times — uses INSERT ... WHERE NOT EXISTS for items.

DO $$
DECLARE
  src_org uuid := '03b8f245-c070-4301-9505-0c2f62cfa2ae';
  dst_org uuid := '653ff503-ab18-4f06-97f8-5afc87ef2950';
  r       RECORD;
  new_id  uuid;
BEGIN

  -- ── Step 1: Map / copy item_types ────────────────────────────────────────────

  CREATE TEMP TABLE _type_map (src_id uuid PRIMARY KEY, dst_id uuid NOT NULL)
    ON COMMIT DROP;

  FOR r IN
    SELECT * FROM item_types WHERE organization_id = src_org ORDER BY created_at
  LOOP
    -- Check if a type with the same name already exists in the target org
    SELECT id INTO new_id
    FROM item_types
    WHERE organization_id = dst_org AND LOWER(name) = LOWER(r.name)
    LIMIT 1;

    IF new_id IS NULL THEN
      INSERT INTO item_types (organization_id, name, description, is_distributable, is_system)
      VALUES (dst_org, r.name, r.description, r.is_distributable, r.is_system)
      RETURNING id INTO new_id;
    END IF;

    INSERT INTO _type_map (src_id, dst_id) VALUES (r.id, new_id);
  END LOOP;

  -- ── Step 2: Copy items ────────────────────────────────────────────────────────

  FOR r IN
    SELECT i.*, m.dst_id AS dst_type_id
    FROM items i
    JOIN _type_map m ON m.src_id = i.item_type_id
    WHERE i.organization_id = src_org
    ORDER BY i.created_at
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM items
      WHERE organization_id = dst_org
        AND item_type_id = r.dst_type_id
        AND LOWER(name) = LOWER(r.name)
    ) THEN
      INSERT INTO items (
        organization_id, item_type_id,
        name, unit, description, is_active,
        kg_per_unit, ml_per_unit
      ) VALUES (
        dst_org, r.dst_type_id,
        r.name, r.unit, r.description, r.is_active,
        r.kg_per_unit, r.ml_per_unit
      );
    END IF;
  END LOOP;

  -- ── Step 3: Replace growing_fee_config for target org ────────────────────────

  DELETE FROM growing_fee_config WHERE organization_id = dst_org;

  INSERT INTO growing_fee_config (
    organization_id, fcr_from, fcr_to, rate_per_kg, description, is_active
  )
  SELECT
    dst_org, fcr_from, fcr_to, rate_per_kg, description, is_active
  FROM growing_fee_config
  WHERE organization_id = src_org
  ORDER BY fcr_from;

END $$;
