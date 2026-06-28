-- ============================================================================
-- STARTER SEED DATA — Item Catalog · Growing-Fee (FCR) Config · Procurement
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL Editor on the TARGET project (khbuypzugydxvejjcoam).
-- Safe to run more than once (idempotent):
--   • item_types / items / suppliers → inserted only if missing
--   • growing_fee_config             → seeded only if the org has none
--   • procurement (+stock +ledger)   → seeded only if the org has no purchases
-- ============================================================================

DO $$
DECLARE
  -- ▼▼▼ CHANGE to your organisation's name (Settings → Organization) ▼▼▼
  v_org_name TEXT := 'AMAL7034POULTRY';
  -- ▲▲▲

  v_org      UUID;
  v_supplier UUID;
  v_item_id  UUID;
  v_proc_id  UUID;
  v_date     DATE;
  r          RECORD;
BEGIN
  SELECT id INTO v_org FROM organizations WHERE name = v_org_name;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization "%" not found — set v_org_name to your org name.', v_org_name;
  END IF;

  -- ── 1. ITEM TYPES ─────────────────────────────────────────────────────────
  INSERT INTO item_types (organization_id, name, description, is_distributable) VALUES
    (v_org, 'Feed',       'Broiler feed (phases)',           true),
    (v_org, 'Medicine',   'Antibiotics & medicines',         true),
    (v_org, 'Vaccine',    'Poultry vaccines',                true),
    (v_org, 'Supplement', 'Vitamins, electrolytes, tonics',  true)
  ON CONFLICT (organization_id, name) DO NOTHING;

  -- ── 2. ITEMS (resolve type by name; insert only those not already present) ─
  INSERT INTO items (organization_id, item_type_id, name, unit)
  SELECT v_org, it.id, x.name, x.unit
  FROM (VALUES
    ('Feed',       'Pre-Starter Crumble',                 'kg'),
    ('Feed',       'Starter Feed',                        'kg'),
    ('Feed',       'Grower Feed',                         'kg'),
    ('Feed',       'Finisher Feed',                       'kg'),
    ('Medicine',   'Amoxicillin',                         'g'),
    ('Medicine',   'Enrofloxacin',                        'ml'),
    ('Medicine',   'Doxycycline',                         'g'),
    ('Medicine',   'Tylosin',                             'g'),
    ('Medicine',   'Coccidiostat',                        'g'),
    ('Vaccine',    'Newcastle (ND) Vaccine',              'dose'),
    ('Vaccine',    'Infectious Bronchitis (IB) Vaccine',  'dose'),
    ('Vaccine',    'Gumboro (IBD) Vaccine',               'dose'),
    ('Vaccine',    'ND + IB Combo Vaccine',               'dose'),
    ('Supplement', 'Multivitamin',                        'ml'),
    ('Supplement', 'Electrolyte Powder',                  'g'),
    ('Supplement', 'Probiotic',                           'g'),
    ('Supplement', 'Liver Tonic',                         'ml'),
    ('Supplement', 'Calcium Supplement',                  'g')
  ) AS x(type_name, name, unit)
  JOIN item_types it ON it.organization_id = v_org AND it.name = x.type_name
  WHERE NOT EXISTS (
    SELECT 1 FROM items i
    WHERE i.organization_id = v_org AND i.item_type_id = it.id AND i.name = x.name
  );

  -- ── 3. GROWING-FEE CONFIG (FCR tiers) — only if none set yet ───────────────
  -- Lower FCR (more feed-efficient) earns a HIGHER rate per kg.
  -- Tiers are contiguous: [from, to). The last tier has to = NULL (no upper cap).
  IF NOT EXISTS (SELECT 1 FROM growing_fee_config WHERE organization_id = v_org) THEN
    INSERT INTO growing_fee_config (organization_id, fcr_from, fcr_to, rate_per_kg, description) VALUES
      (v_org, 0,   1.5,  9.0, 'Excellent — FCR up to 1.5'),
      (v_org, 1.5, 1.7,  8.0, 'Good — FCR 1.5 to 1.7'),
      (v_org, 1.7, 1.9,  7.0, 'Average — FCR 1.7 to 1.9'),
      (v_org, 1.9, 2.1,  6.0, 'Below average — FCR 1.9 to 2.1'),
      (v_org, 2.1, NULL, 5.0, 'Poor — FCR above 2.1');
  END IF;

  -- ── 4. SUPPLIER (for procurement linkage) ──────────────────────────────────
  INSERT INTO suppliers (organization_id, name, business_name, phone)
  SELECT v_org, 'Sample Supplier', 'Sample Feeds & Supplies Pvt Ltd', '9000000000'
  WHERE NOT EXISTS (
    SELECT 1 FROM suppliers WHERE organization_id = v_org AND name = 'Sample Supplier'
  );
  SELECT id INTO v_supplier FROM suppliers WHERE organization_id = v_org AND name = 'Sample Supplier';

  -- ── 5. PROCUREMENT + STOCK + LEDGER — only if the org has no purchases ──────
  IF NOT EXISTS (SELECT 1 FROM procurement WHERE organization_id = v_org) THEN
    FOR r IN
      SELECT * FROM (VALUES
        ('feed',       'Starter Feed',            'kg',    500, 32.00,  3),
        ('feed',       'Grower Feed',             'kg',    800, 30.00,  6),
        ('feed',       'Finisher Feed',           'kg',    600, 29.00,  9),
        ('medicine',   'Amoxicillin',             'g',     500,  4.50, 10),
        ('vaccine',    'Newcastle (ND) Vaccine',  'dose', 2000,  0.80, 12),
        ('supplement', 'Multivitamin',            'ml',   1000,  1.20, 14)
      ) AS x(type_lower, item_name, unit, qty, cpu, days_ago)
    LOOP
      -- date within the CURRENT month, never in the future
      v_date := GREATEST(date_trunc('month', CURRENT_DATE)::date, CURRENT_DATE - r.days_ago);

      SELECT id INTO v_item_id FROM items
        WHERE organization_id = v_org AND name = r.item_name LIMIT 1;

      INSERT INTO procurement
        (organization_id, item_id, supplier_id, type, item_name, quantity, unit, cost, cost_per_unit, date, notes)
      VALUES
        (v_org, v_item_id, v_supplier, r.type_lower, r.item_name, r.qty, r.unit,
         ROUND(r.qty * r.cpu, 2), r.cpu, v_date, 'Seed data')
      RETURNING id INTO v_proc_id;

      -- keep central stock in sync (upsert by org + item_name)
      INSERT INTO stock (organization_id, item_name, quantity, unit)
      VALUES (v_org, r.item_name, r.qty, r.unit)
      ON CONFLICT (organization_id, item_name)
      DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity;

      -- ledger IN entry (drives cost / FCR calculations)
      INSERT INTO stock_ledger
        (organization_id, item_id, item_name, item_type, change_type, quantity, unit, reference_type, reference_id, date)
      VALUES
        (v_org, v_item_id, r.item_name, r.type_lower, 'in', r.qty, r.unit, 'procurement', v_proc_id, v_date);
    END LOOP;
  END IF;

  RAISE NOTICE 'Seed complete for org "%" (%).', v_org_name, v_org;
END $$;

-- Optional verification — run separately after the block above:
-- WITH o AS (SELECT id FROM organizations WHERE name = 'AMAL7034POULTRY')
-- SELECT 'item_types'  AS tbl, count(*) FROM item_types        WHERE organization_id = (SELECT id FROM o)
-- UNION ALL SELECT 'items',         count(*) FROM items        WHERE organization_id = (SELECT id FROM o)
-- UNION ALL SELECT 'fee_config',    count(*) FROM growing_fee_config WHERE organization_id = (SELECT id FROM o)
-- UNION ALL SELECT 'procurement',   count(*) FROM procurement  WHERE organization_id = (SELECT id FROM o)
-- UNION ALL SELECT 'stock',         count(*) FROM stock        WHERE organization_id = (SELECT id FROM o);
