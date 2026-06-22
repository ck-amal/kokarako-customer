-- ============================================================
--  Poultry Manager — Full Database Schema
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- ────────────────────────────────────────────────────────────
--  1. FARMS
-- ────────────────────────────────────────────────────────────
CREATE TABLE farms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  location    TEXT,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
--  2. BATCHES
-- ────────────────────────────────────────────────────────────
CREATE TYPE batch_status AS ENUM ('active', 'sold', 'closed');

CREATE TABLE batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE RESTRICT,
  start_date  DATE NOT NULL,
  chick_count INTEGER NOT NULL CHECK (chick_count > 0),
  status      batch_status NOT NULL DEFAULT 'active',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batches_farm_id ON batches(farm_id);
CREATE INDEX idx_batches_status  ON batches(status);

-- ────────────────────────────────────────────────────────────
--  3. VENDORS
--  (defined before sales / cash_collection that reference it)
-- ────────────────────────────────────────────────────────────
CREATE TABLE vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
--  4. PROCUREMENT
-- ────────────────────────────────────────────────────────────
CREATE TYPE procurement_type AS ENUM ('chicks', 'feed', 'medicine', 'equipment', 'other');

CREATE TABLE procurement (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID REFERENCES batches(id) ON DELETE SET NULL,  -- optional link to a batch
  type        procurement_type NOT NULL,
  item_name   TEXT NOT NULL,
  quantity    NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit        TEXT NOT NULL,                -- kg, bags, litres, units …
  cost        NUMERIC(12, 2) NOT NULL CHECK (cost >= 0),
  supplier    TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_procurement_batch_id ON procurement(batch_id);
CREATE INDEX idx_procurement_type     ON procurement(type);
CREATE INDEX idx_procurement_date     ON procurement(date);

-- ────────────────────────────────────────────────────────────
--  5. STOCK
-- ────────────────────────────────────────────────────────────
CREATE TABLE stock (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name      TEXT NOT NULL UNIQUE,
  quantity       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit           TEXT NOT NULL,
  reorder_level  NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
--  6. SALES
-- ────────────────────────────────────────────────────────────
CREATE TABLE sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  vendor_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  kg_sold       NUMERIC(10, 2) NOT NULL CHECK (kg_sold > 0),
  price_per_kg  NUMERIC(10, 2) NOT NULL CHECK (price_per_kg > 0),
  total_amount  NUMERIC(12, 2) GENERATED ALWAYS AS (kg_sold * price_per_kg) STORED,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_batch_id  ON sales(batch_id);
CREATE INDEX idx_sales_vendor_id ON sales(vendor_id);
CREATE INDEX idx_sales_date      ON sales(date);

-- ────────────────────────────────────────────────────────────
--  7. EXPENSES
-- ────────────────────────────────────────────────────────────
CREATE TABLE expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID REFERENCES batches(id) ON DELETE SET NULL,  -- optional
  category    TEXT NOT NULL,   -- labour, electricity, transport, veterinary …
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_batch_id ON expenses(batch_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date     ON expenses(date);

-- ────────────────────────────────────────────────────────────
--  8. CASH COLLECTION
-- ────────────────────────────────────────────────────────────
CREATE TABLE cash_collection (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  sale_id      UUID NOT NULL REFERENCES sales(id)   ON DELETE RESTRICT,
  amount_paid  NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  balance_due  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_collection_vendor_id ON cash_collection(vendor_id);
CREATE INDEX idx_cash_collection_sale_id   ON cash_collection(sale_id);
CREATE INDEX idx_cash_collection_date      ON cash_collection(date);

-- ============================================================
--  VIEWS (optional but useful for the app)
-- ============================================================

-- Outstanding balance per vendor (total sold − total collected)
CREATE VIEW vendor_balances AS
SELECT
  v.id          AS vendor_id,
  v.name        AS vendor_name,
  COALESCE(s.total_sales,     0) AS total_sales,
  COALESCE(cc.total_collected, 0) AS total_collected,
  COALESCE(s.total_sales,     0)
    - COALESCE(cc.total_collected, 0) AS outstanding_balance
FROM vendors v
LEFT JOIN (
  SELECT vendor_id, SUM(total_amount) AS total_sales
  FROM sales
  GROUP BY vendor_id
) s ON s.vendor_id = v.id
LEFT JOIN (
  SELECT vendor_id, SUM(amount_paid) AS total_collected
  FROM cash_collection
  GROUP BY vendor_id
) cc ON cc.vendor_id = v.id;

-- Batch P&L summary
CREATE VIEW batch_summary AS
SELECT
  b.id               AS batch_id,
  f.name             AS farm_name,
  b.start_date,
  b.chick_count,
  b.status,
  COALESCE(SUM(p.cost),         0) AS total_procurement_cost,
  COALESCE(SUM(e.amount),       0) AS total_expenses,
  COALESCE(SUM(s.total_amount), 0) AS total_revenue,
  COALESCE(SUM(s.total_amount), 0)
    - COALESCE(SUM(p.cost), 0)
    - COALESCE(SUM(e.amount), 0)   AS net_profit
FROM batches     b
JOIN farms       f  ON f.id = b.id
LEFT JOIN procurement p ON p.batch_id = b.id
LEFT JOIN expenses    e ON e.batch_id = b.id
LEFT JOIN sales       s ON s.batch_id = b.id
GROUP BY b.id, f.name, b.start_date, b.chick_count, b.status;

-- Stock items below reorder level
CREATE VIEW low_stock_alerts AS
SELECT id, item_name, quantity, reorder_level, unit
FROM stock
WHERE quantity <= reorder_level;

-- ============================================================
--  ROW LEVEL SECURITY (enable after adding auth)
--  Uncomment these lines once you set up Supabase Auth users.
-- ============================================================
-- ALTER TABLE farms            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE batches          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE procurement      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales            ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cash_collection  ENABLE ROW LEVEL SECURITY;
