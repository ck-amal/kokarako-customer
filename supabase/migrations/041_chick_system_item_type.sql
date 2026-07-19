-- Migration 041: Add Chick as a third system item type + backfill all orgs
--
-- Rules:
--   - Chick, Feed, Medicine are system types (is_system = true) — name cannot be changed or deleted
--   - Chick has exactly ONE item: "Chicks" (unit = birds) — no more items allowed under it
--   - Feed + Medicine can have unlimited sub-items
--   - All three are auto-seeded for every new org

-- 1. Update seed_system_item_types to include all three types
CREATE OR REPLACE FUNCTION seed_system_item_types(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chick_type_id uuid;
BEGIN
  -- ── Feed ────────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM item_types WHERE organization_id = p_org_id AND LOWER(name) = 'feed'
  ) THEN
    INSERT INTO item_types (organization_id, name, description, is_distributable, is_system)
    VALUES (p_org_id, 'Feed', 'Animal feed for daily distribution', true, true);
  ELSE
    UPDATE item_types SET is_system = true
    WHERE organization_id = p_org_id AND LOWER(name) = 'feed';
  END IF;

  -- ── Medicine ────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM item_types WHERE organization_id = p_org_id AND LOWER(name) = 'medicine'
  ) THEN
    INSERT INTO item_types (organization_id, name, description, is_distributable, is_system)
    VALUES (p_org_id, 'Medicine', 'Medicines and health supplements', true, true);
  ELSE
    UPDATE item_types SET is_system = true
    WHERE organization_id = p_org_id AND LOWER(name) = 'medicine';
  END IF;

  -- ── Chick ───────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM item_types WHERE organization_id = p_org_id AND LOWER(name) = 'chick'
  ) THEN
    INSERT INTO item_types (organization_id, name, description, is_system)
    VALUES (p_org_id, 'Chick', 'Day-old chicks placed in batches', true)
    RETURNING id INTO v_chick_type_id;
  ELSE
    UPDATE item_types SET is_system = true
    WHERE organization_id = p_org_id AND LOWER(name) = 'chick';
    SELECT id INTO v_chick_type_id
    FROM item_types WHERE organization_id = p_org_id AND LOWER(name) = 'chick' LIMIT 1;
  END IF;

  -- Ensure single "Chicks" item under Chick type
  IF v_chick_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM items WHERE item_type_id = v_chick_type_id AND LOWER(name) = 'chicks'
  ) THEN
    INSERT INTO items (organization_id, item_type_id, name, unit, description, is_active)
    VALUES (p_org_id, v_chick_type_id, 'Chicks', 'birds', 'Day-old chicks', true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_system_item_types(uuid) TO authenticated;

-- 2. Backfill ALL existing orgs with all three system types
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM organizations LOOP
    PERFORM seed_system_item_types(r.id);
  END LOOP;
END $$;

-- 3. Mark any existing Chick / Feed / Medicine types as system (safety net)
UPDATE item_types SET is_system = true
WHERE LOWER(name) IN ('chick', 'feed', 'medicine');
