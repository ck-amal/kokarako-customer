# AGENT.md — Poultry Manager Project Memory

> **Session update rule:** At the end of every session, before finishing,
> always update this file with:
> 1. **Completed tasks** — everything that was built or changed
> 2. **New decisions or business rules** — anything decided during the session
> 3. **Current blockers** — anything unresolved, broken, or waiting on input
> 4. **Exact next session task** — one clear sentence describing what to do next
>
> This keeps the project memory accurate across all future sessions.

---

## Project Overview

| Field              | Value |
|--------------------|-------|
| **Project Name**   | Poultry Manager |
| **Purpose**        | Web app to manage a poultry farming business — flocks, procurement, sales, cash collection, expenses, and stock |
| **Hosting**        | Vercel (web app) |
| **Supabase URL**   | https://meebbwdaxszoyarssutm.supabase.co |
| **Repo root**      | `/poultry-manager/` inside the working directory |

---

## Tech Stack

| Layer          | Technology |
|----------------|------------|
| Frontend       | React 19 + Vite |
| Styling        | Tailwind CSS v4 (via `@tailwindcss/vite` plugin — no config file needed) |
| Routing        | React Router DOM v7 |
| Backend / DB   | Supabase (PostgreSQL + Auth + Realtime) |
| Mobile (future)| React Native + Expo |
| Deployment     | Vercel |

---

## Authentication

- Provider: Supabase email + password (`signInWithPassword`)
- Session managed via `useAuth` hook (`src/hooks/useAuth.js`)
- `ProtectedRoute` component redirects unauthenticated users to `/login`
- RLS is **disabled** for now — enable after auth is fully established and policies are defined
- Credentials stored in `.env.local` (gitignored via `*.local`)

---

## Database Tables

All tables have `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` and `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

| Table              | Key Columns | Notes |
|--------------------|-------------|-------|
| `farms`            | name, location, capacity, phone_number (text, nullable) | Base entity — phone_number added in migration 002 |
| `batches`          | farm_id, start_date, chick_count, status (active/sold/closed), sold_at (date), closed_at (date) | 45-day grow-out cycle; sold_at/closed_at set when status changes |
| `vendors`          | name, phone, address | Buyers / traders |
| `item_types`       | name (unique), description | **Catalog** — e.g. Chicks, Feed, Medicine. Added Session 18 |
| `items`            | item_type_id (FK→item_types), name, unit, description, is_active | **Catalog** — e.g. Starter Feed / Bags. Added Session 18 |
| `suppliers`        | name, business_name, phone, address, notes, is_active | **Accounts Payable** — Added Session 19 |
| `supplier_payments`| supplier_id (FK), procurement_id (nullable FK), amount, payment_date, payment_method, reference_number, notes | Payments to suppliers. Added Session 19 |
| `procurement`      | type, item_name, **item_id** (FK→items, nullable), **supplier_id** (FK→suppliers, nullable), quantity, unit, cost, cost_per_unit, date | item_id added Session 18; supplier_id added Session 19 |
| `stock`            | item_name, quantity, unit, reorder_level | Denormalized cache only — source of truth is stock_ledger |
| `stock_ledger`     | item_name, item_type, **item_id** (FK→items, nullable), change_type (in/out), quantity, unit, reference_type, reference_id, date | item_id added Session 18 |
| `farm_expenses`    | farm_id, **batch_id** (nullable FK→batches), distribution_id, **item_id** (FK→items, nullable), item_name, item_type, quantity, unit, cost_per_unit, total_cost, date | item_id added Session 18 |
| `distributions`    | farm_id, batch_id, **item_id** (FK→items, nullable), item_name, type, quantity, unit, date | item_id added Session 18 |
| `sales`            | batch_id, vendor_id, kg_sold, price_per_kg, total_amount (generated), date | total_amount is a generated column |
| `expenses`         | batch_id (optional), category, amount, description, date | Optional batch link for P&L |
| `cash_collection`  | vendor_id, sale_id, amount_paid, date, balance_due, notes | Per-sale partial payment tracking |

### Views

| View                | Purpose |
|---------------------|---------|
| `vendor_balances`   | total_sales − total_collected = outstanding_balance per vendor |
| `batch_summary`     | Per-batch P&L (revenue − procurement − expenses) |
| `low_stock_alerts`  | Items at or below reorder level |

### New Table — `distributions`
Logs feed/medicine/other items sent to a specific farm **and batch**. Created in migration 002; **batch_id added in migration 004**.

| Column    | Type     | Notes |
|-----------|----------|-------|
| farm_id   | UUID FK  | references farms(id) ON DELETE CASCADE |
| **batch_id** | UUID FK | references batches(id) ON DELETE SET NULL — nullable for legacy records |
| stock_id  | UUID FK  | references stock(id) ON DELETE SET NULL |
| item_name | TEXT     | denormalised at insert time |
| type      | TEXT     | CHECK IN ('feed','medicine','other') |
| quantity  | NUMERIC  | > 0 |
| unit      | TEXT     | copied from stock at insert time |
| date      | DATE     | |
| notes     | TEXT     | nullable |

Schema file: `supabase/schema.sql`

---

## Key Business Rules

1. **Batch duration** — A batch is exactly **45 days**. Days remaining = 45 − days elapsed since `start_date`. Goes red ("X days overdue") past day 45.
2. **Stock auto-sync** — Recording a procurement entry automatically adds to `stock` (matched by `item_name`, case-insensitive). `chicks` type is excluded from stock.
3. **Feed distribution** — Distributing feed subtracts from stock via `subtractFromStock()` in `src/lib/stockHelpers.js`. Quantity clamps at 0, never goes negative.
4. **P&L per batch** — Net profit = revenue (sales) − procurement cost − expenses, all linked by `batch_id`.
5. **Cash collection** — Tracks per-sale partial payments. Outstanding = total sale value − sum of payments recorded.
6. **Delete protection** — FK constraints block deleting a farm with batches, a vendor with sales, etc.
7. **No free-text item entry** — All items in procurement and distributions must come from the `items` catalog table. Free-text `item_name` input is removed from all forms (Session 18).
8. **Item catalog** — `item_types` (Chicks, Feed, Medicine) → `items` (Starter Feed/Bags, etc.). Managed at `/settings/catalog` (web). Mobile: view-only via CatalogScreen.
9. **Sold/Closed dates** — `batches.sold_at` and `batches.closed_at` are set automatically when status is changed. Shown in Batches list when filtering by Sold or Closed tab.
10. **Sales validation** — A batch cannot be marked as Sold or Closed unless at least one sale record exists for it.
11. **Supplier accounts payable** — `suppliers` tracks who we owe money to. Outstanding = SUM(procurement.cost WHERE supplier_id) − SUM(supplier_payments.amount WHERE supplier_id). FIFO payment status: oldest procurements considered paid first.
12. **Supplier payment overpay warning** — warn (but allow) if payment amount exceeds outstanding balance.
13. **No free-text supplier in procurement** — supplier field is a FK dropdown, not text (Session 19).

---

## Folder Structure

```
src/
├── components/
│   ├── Navbar.jsx          — top nav with active link highlighting + logout
│   └── ProtectedRoute.jsx  — redirects unauthenticated users to /login
├── hooks/
│   ├── useAuth.js          — Supabase session listener, returns { session, loading }
│   └── useSupabase.js      — re-exports supabase client
├── lib/
│   ├── supabaseClient.js   — Supabase singleton (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
│   └── stockHelpers.js     — addToStock(), subtractFromStock() utilities
└── pages/
    ├── Login.jsx
    ├── Dashboard.jsx       — (placeholder — needs summary stats)
    ├── Farms.jsx
    ├── Batches.jsx
    ├── Procurement.jsx     — uses item catalog (item_types → items cascade dropdowns) + supplier dropdown
    ├── Suppliers.jsx       — /suppliers — accounts payable list + modals
    ├── SupplierDetail.jsx  — /suppliers/:id — 3-tab detail (Purchases/Payments/Ledger)
    ├── CatalogSettings.jsx — /settings/catalog — full CRUD for item_types + items
    ├── Stock.jsx
    ├── Vendors.jsx
    ├── Sales.jsx
    ├── CashCollection.jsx
    └── Expenses.jsx
```

---

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Navigation | Top navbar (horizontal) | Simpler at this stage; sidebar planned for later |
| Tables | Mobile-responsive via horizontal scroll | Clean on desktop, usable on mobile |
| Currency | Indian Rupees (₹), `en-IN` locale formatting | Business operates in India |
| Date format | `dd MMM yyyy` (e.g. 18 Jun 2026) | Readable for Indian users |
| Modals | Inline modals (no separate route) | Fast UX for data entry |
| Stock matching | Case-insensitive `ilike` on `item_name` | Prevents duplicates from minor typos |
| Batch status | One-way: active → sold (no undo) | Prevents accidental data corruption |
| RLS | Disabled for now | Will enable once auth + policies are designed |

---

## Sessions Log

### Session 21 — Advance Growing Fee Payments

**Concept:** Farm owners can receive advance payments before a batch is sold. At batch close, advances are automatically deducted from the calculated growing fee. Advances are cash out immediately (not a liability).

**New Table (migration `008_growing_fee_advances.sql`):**
- `growing_fee_advances`: id, farm_id, batch_id, amount, payment_date, payment_method, reference_number, account_id, notes, created_at

**Updated Tables (migration 008):**
- `growing_fee_ledger`: added `total_advances` (numeric, default 0), `overpaid_amount` (numeric, default 0)
- `batches`: added `total_advances` (numeric, default 0) — running total updated on each advance

**Business rules:**
1. Advances can only be given for an active batch
2. Advance immediately deducts from Cash & Bank (`transactions` insert: `category = 'growing_fee_advance'`, `type = 'out'`)
3. At batch close: `total_advances = SUM(growing_fee_advances.amount WHERE batch_id)`
4. `balance_due = total_fee - total_advances - amount_paid`
5. If `total_advances > total_fee`: status = 'overpaid', store excess in `overpaid_amount`, `balance_due = 0`
6. If `total_advances == total_fee`: status = 'paid'
7. Advances do NOT create any liability entry
8. `growing_fee_ledger.total_advances` is set at batch close time (snapshot)
9. `batches.total_advances` is updated incrementally on each advance record

**P&L treatment:**
- Advances do NOT appear in P&L when given (prepayments)
- At batch close: advance amount appears in P&L as "Growing Fees (advances settled)" under Operating Expenses
- Post-close cash payments appear as "Growing Fees (post-close payments)"
- Both lines add up to total growing fee cost in the period

**Cash & Bank:**
- Advances appear as `category = 'growing_fee_advance'` → label "Growing Fee Advance" (amber badge)
- Added to `CATEGORY_LABELS` and `CATEGORY_STYLES` in AccountsPage.jsx

**New GiveAdvanceModal component** (available in BatchDetail.jsx, FarmDetail.jsx, GrowingFees.jsx):
- Farm name + owner info (pre-filled from context)
- Batch selector (active batches only; shows error if none)
- Account selector (defaults to cash account)
- Amount, date, payment method, reference, notes
- On save: inserts advance → updates batch.total_advances → inserts transaction

**Updated Pages:**
- `BatchDetail.jsx`: Active batch shows "Growing Fee Advance Tracking" section with advances list and "Give Advance" button. Sold batch growing fee section now shows: Gross Fee, Advances Paid (itemized), Post-close Paid, Balance Due (or Overpaid credit in green).
- `FarmDetail.jsx`: Growing Fee summary card in Overview tab shows total active-batch advances + "Give Advance" button. Batches tab Growing Fee column shows "Adv: ₹X" for active batches with advances. "Give Advance" button on each active batch row.
- `GrowingFees.jsx`: New "Active Batch Advances" table at top showing farms with active batches. "Give Advance" button in page header. `GiveAdvanceModal` added.
- `PLReport.jsx`: Two separate growing fee lines: "Growing Fees (advances settled)" and "Growing Fees (post-close payments)". Both counted in Operating Expenses total.
- `AccountsPage.jsx`: `growing_fee_advance` category added with amber badge.

**Migration required:**
Run `supabase/migrations/008_growing_fee_advances.sql` in Supabase SQL Editor.

---

### Session 20 — Growing Fee System

**Concept:** Farm owners are paid per kg of chicken sold, based on the batch FCR. The rate is tiered and configurable. The calculated fee becomes a liability (pending payment) when a batch is marked as sold.

**New Tables (migration `007_growing_fee.sql`):**
- `farms`: added `owner_name`, `owner_phone`, `owner_address`, `owner_notes` columns
- `growing_fee_config`: FCR tier → rate_per_kg mapping. Fields: fcr_from, fcr_to (nullable = last tier), rate_per_kg, description, is_active
- `growing_fee_ledger`: one row per batch. Records owner_name snapshot, FCR, tier description, rate, total_sale_kg, total_fee, status (pending/partial/paid), amount_paid, balance_due
- `growing_fee_payments`: payments recorded against ledger entries. FIFO distribution across pending entries per farm
- `batches`: added `growing_fee_id` (FK→growing_fee_ledger), `growing_fee_per_kg`, `growing_fee_total`

**Default seed tiers (configurable):**
- FCR 0.0–1.0 → ₹18/kg (Exceptional)
- FCR 1.0–1.5 → ₹16/kg (Excellent)
- FCR 1.5–2.0 → ₹14/kg (Good)
- FCR 2.0–2.5 → ₹12/kg (Average)
- FCR 2.5–3.0 → ₹10/kg (Below average)
- FCR 3.0+    → ₹8/kg  (Poor)

**New Pages:**
- `GrowingFeeSettings.jsx` at `/settings/growing-fee` — FCR tier CRUD with tier ladder visual
- `GrowingFees.jsx` at `/growing-fees` — growing fee management, grouped by farm, Record Payment modal with FIFO distribution

**Updated Pages:**
- `FarmDetail.jsx` — FarmEditModal now includes Owner Name, Phone, Address, Notes fields; farm header shows "Managed by: [owner]"
- `Farms.jsx` — Farm cards show owner name below farm name
- `BatchDetail.jsx` — `handleMarkAsSold` now auto-calculates growing fee (Step 3 after FCR); Growing Fee section shown for sold/closed batches; batch query joins `growing_fee_ledger`
- `Sidebar.jsx` — added "Growing Fees" (🌿) and "Fee Config" (🔧) nav items
- `App.jsx` — added `/growing-fees` and `/settings/growing-fee` routes

**Business rules:**
1. Growing fee is calculated automatically when a batch is marked as sold (alongside FCR)
2. Fee = rate_per_kg × total_sale_kg (from the matching FCR tier)
3. Tier match: `fcr_from <= batch.fcr < fcr_to`; last tier has `fcr_to = null` (matches anything ≥ fcr_from)
4. Pending growing fee = liability (not cash out yet)
5. Paid growing fee = actual cash out (recorded via growing_fee_payments)
6. Growing fee is calculated only once per batch (`batch.growing_fee_id` checked before creating ledger entry)
7. Payment distribution: FIFO — oldest ledger entries paid first when recording a farm-level payment
8. Only one growing_fee_ledger entry per batch

**Migration required:**
Run `supabase/migrations/007_growing_fee.sql` in Supabase SQL Editor.

### Session 19 — Supplier Management Module

**Built:**
- `suppliers` table + `supplier_payments` table (see `supabase_supplier_migration.sql` at repo root — run in Supabase SQL Editor)
- Added `supplier_id` FK column to `procurement` table (nullable for backward compat)
- `Suppliers.jsx` (web) — `/suppliers` — list with summary bar (total, outstanding, paid this month), supplier cards with outstanding badge, Add/Edit Supplier modal, Record Payment modal, click to navigate to detail
- `SupplierDetail.jsx` (web) — `/suppliers/:id` — 3 tabs: Purchases (FIFO status badges + filter), Payments, Ledger (debit/credit/running balance)
- `SuppliersScreen.js` (mobile) — same feature set as web Suppliers list
- `SupplierDetailScreen.js` (mobile) — 3 tabs: Purchases, Payments, Ledger; Record Payment modal
- `Procurement.jsx` updated — supplier text field → supplier dropdown with outstanding balance hint
- `ProcurementScreen.js` (mobile) updated — supplier chip picker replaces text input; joined `suppliers(name)` in list query
- `Dashboard.jsx` updated — added Supplier Dues card (6th card); fetches outstanding supplier balance
- `Sidebar.jsx` updated — added Suppliers nav link (🏭)
- `App.jsx` updated — added `/suppliers` and `/suppliers/:id` routes
- Mobile `App.js` updated — registered SuppliersScreen + SupplierDetailScreen in MoreStack
- Mobile `MoreScreen.js` updated — added Suppliers menu item

**Migration required (run once in Supabase):**
```
supabase_supplier_migration.sql
```

**FIFO payment logic:** sort procurements oldest-first; subtract total paid from each cost in sequence — Paid/Partial/Unpaid status assigned.

### Session 18 — Item Catalog System

**Built:**
- `item_types` + `items` tables (see `supabase_catalog_migration.sql` at repo root — run in Supabase SQL Editor)
- Default seed data: 3 types (Chicks, Feed, Medicine) and 8 items
- `CatalogSettings.jsx` — `/settings/catalog` — full CRUD: add/edit/delete types and items, inline forms, deactivate instead of hard-delete if item is used
- `CatalogScreen.js` (mobile) — view-only browse of types + items
- Procurement form (web + mobile) — replaced free-text with item type → item cascade dropdowns; unit auto-filled read-only
- Distribution form (mobile) — replaced stock table item picker with items catalog, added type filter toggle (All / Feed / Medicine)
- Sidebar + App.jsx — added `/settings/catalog` route + nav link
- Mobile MoreScreen + App.js — added Catalog screen under More tab
- `sold_at` / `closed_at` columns added to `batches` — stored on status change, shown in Batches list
- Batches page (web + mobile) — default filter=Active, sort by chicks (desc) or days to harvest; color-coded urgency badges + left borders

**Migration required (run once in Supabase):**
```
supabase_catalog_migration.sql
```

### Session 17 — Farm Stock Tab (Web + Mobile)
**Completed:**
- Created `supabase/migrations/005_farm_stock.sql` — new `farm_stock` table:
  - Columns: `farm_id (FK), item_name, unit, quantity_on_hand, updated_at`
  - UNIQUE constraint on `(farm_id, item_name)` — one row per item per farm
- `src/pages/FarmDetail.jsx` (web):
  - New `'Farm Stock'` tab added (5th tab)
  - `farmStock` state + fetched via `supabase.from('farm_stock').select('*').eq('farm_id', id)`
  - `FarmStockAdjustModal` component — lets user set exact `quantity_on_hand` (physical stocktake)
  - `DistributionModal` save now increments `farm_stock.quantity_on_hand` (select-then-update pattern, inserts new row if first distribution of that item)
  - Farm Stock tab: shows all items at farm, quantity + unit, "⚠ Empty" when 0, "Adjust" button per row, "+ Distribute More" header button
- `src/screens/FarmDetailScreen.js` (mobile):
  - New `'Stock'` tab (5th tab)
  - `farmStock` state + fetched alongside other data in `fetchAll`
  - `FarmStockTab()` function — card list of items, quantity, "Adjust" button
  - `handleAdjustStock()` + `showAdjustStock` modal state + `adjustItem`, `adjustQty`, `savingAdjust` state
  - Adjust modal: bottom sheet with quantity TextInput, green Save button
  - `handleAddDist` now increments `farm_stock` after saving distribution
- `src/screens/DistributeFeedScreen.js` (mobile standalone):
  - Also increments `farm_stock` after saving distribution (same select-then-update pattern)

**Business rules:**
1. `farm_stock.quantity_on_hand` auto-increments each time a distribution is recorded to that farm for that item
2. User can manually set `quantity_on_hand` via "Adjust" (physical stocktake / count)
3. `farm_stock` is per-farm, per-item — not linked to a batch (it's what's physically at the farm)
4. Central warehouse stock (`stock` table) and farm stock (`farm_stock` table) are separate — warehouse stock decrements on distribution, farm stock increments

**Migration to run:**
```sql
CREATE TABLE IF NOT EXISTS farm_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (farm_id, item_name)
);
CREATE INDEX IF NOT EXISTS farm_stock_farm_id_idx ON farm_stock(farm_id);
```

**Current blockers:**
- Migration 005 must be run in Supabase SQL Editor

**Next session task:**
- Run migration 005, test distribution → farm stock auto-increment, test Adjust flow

---

### Session 16 — Distributions Linked to Batches (Core Data Model Change)
> ⚠ **Core architecture decision — all future sessions must respect this.**

**Completed:**
- Created `supabase/migrations/004_batch_distributions.sql`:
  - `ALTER TABLE distributions ADD COLUMN batch_id UUID REFERENCES batches(id) ON DELETE SET NULL`
  - `ALTER TABLE farm_expenses ADD COLUMN batch_id UUID REFERENCES batches(id) ON DELETE SET NULL`
  - Indexes on both columns for fast per-batch queries
- `src/pages/FarmDetail.jsx` (web) — `DistributionModal` redesigned:
  - Fetches active batches for farm on modal open (async, with loading state)
  - 0 active batches → amber warning block, rest of form disabled
  - 1 active batch → green auto-selected display, no user action needed
  - 2+ active batches → dropdown with "Batch started DD MMM YYYY — N chicks" labels
  - Saves `batch_id` to both `distributions` and `farm_expenses` inserts
  - Validation: batch must be selected (or auto-selected) before form submits
  - `distributions` fetch now includes `batches(start_date)` join
  - `batchFeedKg`/`batchMedQty` fixed to key by `batch_id` (was wrongly using `'farm'` — pre-existing bug now fixed)
  - Distributions tab: added "Batch" column showing `Batch DD MMM YYYY` or `—`
- `src/screens/FarmDetailScreen.js` (mobile) — Add Distribution modal updated:
  - Uses existing `batches` state (already fetched); filters to active
  - Auto-selects if 1 active batch; chip picker if multiple; amber warning if none
  - Saves `batch_id` to `distributions` and `farm_expenses`
  - `distributions` fetch includes `batch_id, batches(start_date)` join
  - DistributionsTab rows now show "Batch DD MMM YYYY" under item name (green text)
  - New styles: `distBatchWarn`, `distBatchWarnText`, `distBatchAuto`, `distBatchAutoText`
- `src/screens/DistributeFeedScreen.js` (mobile standalone) — batch cascade added:
  - `useEffect` on `farmId` fetches active batches for selected farm
  - Auto-selects if 1; chip row if multiple; warning if none
  - Farm selection cleared → batch selection cleared
  - Saves `batch_id` to `distributions` and `farm_expenses`

**New business rules (canonical):**
1. **Every new distribution MUST be linked to a specific active batch** (batch_id required in UI)
2. Old distributions without batch_id are displayed as `—` in the Batch column (nullable for backward compat)
3. `batchFeedKg[batchId]` and `batchMedQty[batchId]` in the Batches tab show per-batch supply totals (fixed bug where all were keyed as `'farm'`)
4. Batch P&L should use `farm_expenses WHERE batch_id = ?` for costs; farm P&L still sums all batches
5. Distribution form field order: Batch → Type → Stock Item → Quantity → Date → Notes

**Migration to run:**
```sql
-- Run in Supabase SQL Editor
ALTER TABLE distributions ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;
ALTER TABLE farm_expenses ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS distributions_batch_id_idx ON distributions(batch_id);
CREATE INDEX IF NOT EXISTS farm_expenses_batch_id_idx ON farm_expenses(batch_id);
```

**Current blockers:**
- Migration 004 must be run in Supabase SQL Editor before the batch_id column exists

**Next session task:**
- Run migration 004 in Supabase SQL Editor, then test full distribution flow on web and mobile

---

### Session 15 — Farm Detail Overview Tab Redesign (Web + Mobile)
**Completed:**
- `src/pages/FarmDetail.jsx` (web) — Overview tab fully redesigned:
  - Farm Identity Header updated to earthy/nature theme (🌾 icon, warm white `#fffffe` bg, `#e7e5e0` border, warm gray text)
  - Stats grid (always-visible, above tabs) **removed** — data now lives in the Overview tab sections
  - Tab bar updated to earthy green active style (`#15803d`)
  - **Section 1 — Capacity Status Bar**: animated 16px thick bar (0→actual in 0.8s, easeOut), live chicks / capacity / %, remaining count footer
  - **Section 2 — Batch Overview**: 2×2 grid — Active Batches (green), Total Batches (neutral), Total Mortality (red), Days to Harvest (color-coded by urgency)
  - **Section 3 — Financial Summary**: animated horizontal stacked bar (0.6s) with 4 color segments (chick cost `#fca5a5`, feed `#fdba74`, medicine `#fde047`, profit `#15803d`) + legend + 7-row breakdown table
  - **Section 4 — Recent Activity**: timeline feed with emoji dot icons and sequential fade-up animation (70ms stagger); 8 events from batches/distributions/sales/payments
  - `AnimatedBar` and `StackedBar` helper components added (respect `prefers-reduced-motion`)
  - `cash_collection` now fetched in phase 3 of `fetchAll` (via sale IDs → `cash_collection.sale_id`)
  - Overview tab max-width 900px centered
- `src/screens/FarmDetailScreen.js` (mobile) — Overview tab fully redesigned:
  - Farm Identity Card updated: 🌾 icon in green circle, earthy colors (`#fffffe` bg, `#e7e5e0` border, `#1c1917` text)
  - Scroll bg: `#fafaf5` (warm off-white)
  - Tab bar: `#15803d` active (was `#16a34a`)
  - **Section 1 — Capacity Bar**: `Animated.View` width interpolation, 0.8s animation
  - **Section 2 — Batch Stats**: 2×2 ovGrid with colored backgrounds matching web
  - **Section 3 — Financial Summary**: stacked `Animated.View` bar (0.6s, 150ms delay) + legend + 7-row breakdown
  - **Section 4 — Recent Activity**: static timeline with emoji dots + badge chips
  - `capAnim` and `finAnim` refs in parent component scope (not inside OverviewTab) to survive parent re-renders
  - Animation triggers via `useEffect` on `activeTab` + `loading` changes
  - New styles: `ovCard`, `ovRow`, `ovCapBg`, `ovCapFill`, `ovGrid`, `ovStat`, `ovFinBar`, `ovLegend`, `ovActRow`, etc.

**Color Palette (Farm/Nature Theme):**
| Token | Hex | Usage |
|-------|-----|-------|
| Primary green | `#15803d` | Bars, active tab, profit, active batch |
| Light green bg | `#f0fdf4` | Active batch stat cell |
| Warm white (card) | `#fffffe` | Card backgrounds |
| Off-white (page) | `#fafaf5` | Page/scroll background |
| Near black | `#1c1917` | Headings, primary text |
| Warm gray | `#78716c` | Body text, labels, meta |
| Earthy border | `#e7e5e0` | Card borders, dividers |
| Chick cost | `#fca5a5` | Financial bar segment |
| Feed cost | `#fdba74` | Financial bar segment |
| Medicine | `#fde047` | Financial bar segment |

**Capacity bar color thresholds (overview):**
- 0–25%: `#bbf7d0` (light green = nearly empty)
- 26–50%: `#4ade80` (medium green)
- 51–75%: `#16a34a` (dark green)
- 76–100%: `#166534` (very dark green = near full)

**Animation notes:**
- Capacity bar: `AnimatedBar` component, 0→pct in 800ms cubic-bezier(0.4,0,0.2,1), 40ms initial delay
- Financial bar: `StackedBar` component, 0→pct in 600ms with 60ms stagger between segments
- Activity feed: CSS `@keyframes ovFadeUp` (fade + 8px translateY), 70ms stagger per item
- `prefers-reduced-motion`: checked via `window.matchMedia(...)`, skips animation and sets final value immediately
- Mobile: `Animated.parallel` starts both `capAnim` and `finAnim` when Overview tab becomes active

**`cash_collection` fetch pattern:**
- Phase 3 fetch after sales data: `supabase.from('cash_collection').select('id, amount_paid, date, vendors(name)').in('sale_id', saleIds)`
- Events include type `'payment'` with emoji 💳, purple badge color
- Schema: `id, amount_paid, date, sale_id, vendor_id` — no direct `farm_id`

**Current blockers:**
- None

**Next session task:**
- Push web and mobile changes to GitHub and redeploy Vercel

---

### Session 14 — Farms List Card Redesign (Web + Mobile)
**Completed:**
- `src/pages/Farms.jsx` (web) — redesigned from table view to **card grid layout**:
  - 3 columns desktop / 2 columns tablet / 1 column mobile
  - Each card: green bg+border (#f0fdf4/#16a34a) if has active batch, red bg+border (#fef2f2/#dc2626) if none
  - Card content: farm name + active batch pill · location + phone · live chicks + capacity + progress bar (8px) · total batches + next harvest days
  - Edit/Delete buttons inside card with `e.stopPropagation()` so card click still works
  - Card click navigates to `/farms/:id` via `useNavigate`
  - Hover: `shadow-lg + scale-[1.02]`
  - Empty states: "No farms yet" + Add Farm button / "No farms match your filter" + Clear filters button
- `src/screens/FarmsScreen.js` (mobile) — redesigned farm cards:
  - Same green/red background + border color logic
  - Active batch pill (green/red) · location+phone row · capacity bar (10px tall) · harvest footer
  - Full-width cards, tap navigates to FarmDetail
  - Pull to refresh kept
- Both: Batches filter updated to include **Closed** option (Active/Sold/Closed/All) in FarmDetailScreen and FarmDetail.jsx
- Both: Default sort = live chick count descending; ties (no active batch) sorted alphabetically

**Rules (PERMANENT):**
- Farm card background: `hasActive → #f0fdf4 border #16a34a` | `!hasActive → #fef2f2 border #dc2626`
- Capacity bar color thresholds: 0–60% → green (#16a34a), 61–85% → amber (#f59e0b), 86–100%+ → red (#dc2626)
- Sort order: liveChicks desc, then name asc for farms with 0 live chicks
- `liveChicks` = sum of `(chick_count - mortality_count)` for active batches only
- `nextHarvestDays` = `min(45 - daysElapsed(start_date))` across active batches per farm

**New decisions:**
- Web Farms page is now a card grid (no longer a table)
- Fetch `batches` with `chick_count, mortality_count, start_date, status` on Farms list page (was just count before)

**Current blockers:**
- None

**Next session task:**
- Push web and mobile changes to GitHub and redeploy Vercel

---

### Session 11 — Farm Detail Tabbed Layout (Web + Mobile)
**Completed:**
- `src/pages/FarmDetail.jsx` (web) — redesigned from single-scroll to **tabbed layout**:
  - Farm identity card (name, location, phone, capacity) + Edit button — always visible above tabs
  - Stats grid (6 cards, always visible): Chicks Alive, Remaining Capacity, Active Batches, Total Batches, Total Mortality, Days to Next Harvest
  - **Overview tab** (default): Financial summary cards (Revenue, Expenses, Gross Profit, Margin) + Recent Activity feed (last 5 events from batches/distributions/sales)
  - **Batches tab**: Full table with chick count, days remaining, status, feed kg, medicine qty, revenue; "Start New Batch" button
  - **Distributions tab**: Table with type filter (All/Feed/Medicine), cost column from farm_expenses, total cost footer; "Record Distribution" button
  - **Sales tab**: Table with all sales, total revenue footer; "Record Sale" button
  - All modals (FarmEditModal, NewBatchModal, EditBatchModal, DistributionModal, SaleModal) kept exactly as-is
- `src/screens/FarmDetailScreen.js` (mobile) — redesigned from single-scroll to **tabbed layout**:
  - Farm identity card always visible: name, phone (tap-to-call), location, capacity bar showing alive/remaining
  - Horizontal tab bar (4 tabs): Overview, Batches, Distributions, Sales
  - **Overview tab**: 8 stat cards in 2-column grid (Chicks Alive, Remaining Capacity, Active Batches, Total Batches, Revenue, Expenses, Gross Profit, Margin) + Days to Next Harvest full-width card
  - **Batches tab**: Batch cards with status, days, revenue; green FAB bottom-right → Add Batch modal
  - **Distributions tab**: Filter toggle (All/Feed/Medicine) + distribution rows with cost; green FAB → Record Distribution modal (writes distributions + stock_ledger + farm_expenses)
  - **Sales tab**: Sale rows with vendor/kg/price/total, total footer; green FAB → Record Sale modal
  - All 4 modals: Add Batch, Edit Batch, Add Distribution, Add Sale

**Batches tab filters (added in Session 12) + DatePicker component (added in Session 13):**

### Session 13 — Native Date Picker Component (Mobile)
**Completed:**
- Installed `@react-native-community/datetimepicker` (SDK 54 compatible) via `expo install`
- Created `src/components/DatePicker.js` — reusable component with:
  - iOS: spinner inside a bottom-sheet Modal (transparent overlay, green Done button; tapping overlay dismisses without saving)
  - Android: native date dialog directly (no Modal wrapper)
  - Exports `toISO(date)` helper → YYYY-MM-DD string using local time (not UTC)
  - Exports `parseDate(str)` helper → local-time Date object from YYYY-MM-DD string
  - Props: `value` (Date|null), `onChange(Date)`, `label`, `placeholder`, `minimumDate`, `maximumDate`, `containerStyle`
- Replaced ALL date TextInputs across the entire mobile app:
  - `DistributeFeedScreen.js` — `date` field
  - `BatchesScreen.js` — `bStartDate` in Add Batch modal
  - `SalesScreen.js` — `sDate` in Add Sale modal
  - `PaymentsScreen.js` — `pDate` in Record Payment modal
  - `ProcurementScreen.js` — `pDate` in Add Procurement modal
  - `RecordSaleScreen.js` — `date` field
  - `RecordPaymentScreen.js` — `date` field
  - `FarmDetailScreen.js` — `bStartDate` (Add Batch), `dDate` (Add Distribution), `sSaleDate` (Add Sale), `batchDateFrom`/`batchDateTo` (Date Range filter sheet)

**Rule (PERMANENT):**
> All future date inputs in the mobile app MUST use `<DatePicker>` from `src/components/DatePicker.js`.
> Never use `TextInput` for date entry in the mobile app.
> State is stored as YYYY-MM-DD string. Convert with: `value={date ? new Date(date + 'T12:00:00') : null}` and `onChange={d => setDate(toISO(d))}`.

**New decisions:**
- Using `'T12:00:00'` when constructing Date from string to avoid UTC midnight ± 1 day timezone issue
- `toISO()` uses `getFullYear/getMonth/getDate` (local time) not `toISOString().slice(0,10)` (UTC)

**Current blockers:**
- None

**Next session task:**
- Push mobile changes to GitHub

---

**Batches tab filters (added in Session 12):**
- Default filter: **Active** (not All) — page opens showing only active batches
- Web: segmented button group (Active / Sold / All) + date range inputs (from/to) + text search (by date or ID) + results count + "Clear filters" link (only when non-default)
- Mobile: horizontal scrollable chip row (Active / Sold / All / 📅 Date Range) + Date Range chip opens a bottom sheet with two date TextInputs + Apply/Clear buttons + results count row
- Empty state when Active selected with no results: friendly message "No active batches for this farm" + "Start New Batch" button (both web and mobile)

**New decisions:**
- Tab bar active state uses green border (not amber) on both web and mobile — green = selected/active
- Stats grid is ABOVE the tabs (always visible) on web; the identity card is always visible on mobile
- FABs (floating action buttons) replace header "+" buttons on Batches/Distributions/Sales tabs on mobile
- "Overview" is the default tab on both web and mobile
- Batches tab defaults to "Active" filter (not "All") so farm managers see the most relevant data first

**Current blockers:**
- None

**Next session task:**
- Push web and mobile changes to GitHub and redeploy Vercel

---

### Session 10 — Mobile App Sync (stock_ledger + FarmDetail + HomeScreen upgrades)
**Completed:**
- `FarmsScreen.js` — added `phone_number` fetch, filter toggle (All / Active Batch / No Active Batch), tap-to-call via `Linking.openURL('tel:...')`, tappable cards navigating to `FarmDetail`, chevron `›` on each card
- `FarmDetailScreen.js` (new) — farm profile card with tap-to-call, 2×2 active batch stat grid (alive, day elapsed, days remaining, start date), distribution history table (last 10) with type pills, sales history table (last 10) with vendor, P&L card (revenue, chick cost proportional, feed/medicine from `farm_expenses`, gross profit, margin %)
- `DistributeFeedScreen.js` — rewritten to compute live balance from `stock_ledger` (not `stock.quantity`); shows "Available: X unit" badge; warns if quantity exceeds balance; on save: inserts `distributions` → `stock_ledger` OUT → updates `stock` cache → calculates weighted-avg cost from `procurement` → inserts `farm_expenses`
- `StockScreen.js` — fully rewritten as read-only ledger view; computes balance per item from `stock_ledger`; each card shows balance, status, total in/out, reorder level; "View History" bottom-sheet Modal (FlatList) with IN/OUT badges, date, quantity, source label
- `HomeScreen.js` — "Money Owed" card now tappable (navigates to Payments) when balance > 0; "Low Stock Items" card tappable (navigates to Stock tab) when count > 0; added "Active Batches" list section showing each active batch with farm name, alive count, day number, days remaining tag — rows highlighted red when ≤5 days remaining or overdue
- `App.js` — registered `FarmDetailScreen` in `MoreStack` navigator

**New decisions:**
- Active batch urgency threshold: ≤5 days remaining = red highlight on HomeScreen batch list
- Batch list sorted by `remaining` ascending (most urgent first)
- "Money Owed" card only tappable when `totalOutstanding > 0` (no nav for zero balance)
- "Low Stock Items" card only tappable when `lowStockCount > 0`
- Cross-tab navigation from HomeStack: `navigation.navigate('MoreTab', { screen: 'Payments' })` and `navigation.navigate('StockTab')`

**Current blockers:**
- Migration 003 (`stock_ledger` + `farm_expenses` tables) must be run in Supabase SQL Editor if not already done before DistributeFeed and Stock screens work correctly
- Migration 002 (`distributions` table + `phone_number` on farms) must be run before FarmDetail works

**Next session task:**
- Test mobile app end-to-end on device (run `npx expo start --lan`), verify ledger balance flows, then push mobile app changes to GitHub

---

### Session 9 — Stock Ledger Architecture (CORE CHANGE)
> ⚠ **Core architecture decision — all future sessions must respect this.**

**Completed:**
- `supabase/migrations/003_stock_ledger.sql`:
  - `cost_per_unit NUMERIC` column added to `procurement`
  - `stock_ledger` table created — records every stock movement ever
  - `farm_expenses` table created — auto-populated on every distribution
- `src/lib/stockLedger.js` — helper functions: `ledgerIn()`, `ledgerOut()`, `getChickBalance()`, `getAverageCostPerUnit()`
- `Procurement.jsx` — on save: writes `stock_ledger` IN entry for all types (including chicks); still writes to `stock` table for backward compat (dashboard/low_stock_alerts)
- `Batches.jsx` — on batch creation: writes `stock_ledger` OUT for chick count; warns user if chick balance would go negative (but allows save)
- `FarmDetail.jsx` DistributionModal — on save: writes `stock_ledger` OUT + calculates weighted-avg cost from procurement + inserts `farm_expenses` row automatically
- `FarmDetail.jsx` P&L — feed/medicine costs now come from `farm_expenses` table (not from procurement linked to batches)
- `Stock.jsx` — **fully rewritten as read-only live view**: computes balance per item from `stock_ledger` (sum IN - sum OUT), shows total in/out/balance/status table; "View History" button opens a right-side drawer with full ledger for that item; no manual entry modals remain

**New business rules (canonical):**
1. Stock is NEVER entered manually — it moves only via: Procurement → IN, Batch created → chicks OUT, Distribution → OUT
2. `stock_ledger` is the source of truth for all stock levels
3. `stock` table kept as a denormalized cache (dual-written) for backward compat with `low_stock_alerts` view and dashboard
4. `farm_expenses` is auto-populated on every distribution — feed/medicine cost uses weighted-average procurement price at time of distribution
5. Chick stock: procurement of type=chicks creates a ledger IN; batch creation creates a ledger OUT equal to chick_count
6. Farm P&L uses `farm_expenses` for feed/medicine cost — NOT procurement records

**Current blockers:**
- Migration 003 must be run in Supabase SQL Editor before new stock flow works

**Next session task:**
- Push to GitHub (git push) to redeploy on Vercel, then run migration 003 and validate full end-to-end flow

---

### Session 8 — Farms Module Deep Build
**Completed:**
- `supabase/migrations/002_farm_enhancements.sql` — adds `phone_number TEXT` to `farms`; creates `distributions` table (farm_id, stock_id, item_name, type, quantity, unit, date, notes)
- `Farms.jsx` updated:
  - `phone_number` field added to Add/Edit modal and shown in table
  - Farm name is now a clickable link to `/farms/:id`
  - Filter bar: text search by name, status filter (All / Has Active Batch / No Active Batch), location dropdown (unique values from DB)
  - "View" action button added to each row
- `FarmDetail.jsx` created at `/farms/:id`:
  - **Farm profile card** — name, location, capacity, phone; Edit button opens inline modal
  - **Active batch quick stats** — Chicks Alive, Days Elapsed, Days Remaining/Overdue, Harvest Date (shown only when a batch is active)
  - **Batches table** — start date, chick count, status pill, days left/overdue, feed kg, medicine qty (from procurement linked to batch), revenue; "Start New Batch" button pre-fills farm_id
  - **Distribution history** — table of all distributions to this farm (date, type pill, item, quantity, notes); "Record Distribution" modal selects stock item, validates against available qty, inserts into `distributions` AND deducts from `stock`
  - **Sales table** — date, vendor, kg sold, price/kg, total; "Record Sale" modal pre-fills active batch, select vendor; shows empty state if no active batch
  - **P&L card** — Revenue, Chick Cost (proportional: farm_chicks/total_all_chicks × total_chick_procurement_cost), Feed Cost, Medicine Cost (both from procurement linked to this farm's batch_ids), Gross Profit, Profit Margin %
- `App.jsx` updated — added `/farms/:id` route + `FarmDetail` import

**New decisions:**
- Distributions are farm-level (not batch-level) — simpler UX; date-based context is sufficient
- Feed/medicine costs in farm P&L come from procurement records linked to this farm's batch_ids (not from distributions), because procurement captures actual purchase price
- Chick cost is proportional share: `(this_farm_chick_count / all_batches_chick_count) × total_chick_procurement_cost`
- `distributions.item_name` is denormalised at insert time so the history stays accurate even if stock items are renamed/deleted

**Current blockers:**
- Migration 002 must be run manually in Supabase SQL Editor before farm detail page works

**Next session task:**
- Deploy updated code to Vercel (git push) and verify farm detail page end-to-end with real data

---

### Session 1 — Project Setup & Auth
**Completed:**
- Vite + React project scaffolded (`poultry-manager/`)
- Tailwind CSS v4 installed and configured via `@tailwindcss/vite` plugin
- Supabase JS client installed and configured (`.env.local`)
- Folder structure created: `pages/`, `components/`, `hooks/`, `lib/`
- Login page with email/password auth
- `useAuth` hook + `ProtectedRoute` component
- React Router setup with `/login` → `/dashboard` redirect flow
- Navbar with logout button

### Session 6 — React Native Mobile App (Expo)
**Completed:**
- New Expo app scaffolded at `../poultry-manager-mobile/` (sibling to web app)
- Installed: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`
- `src/lib/supabase.js` — Supabase client using `AsyncStorage` for session persistence on device
- `src/hooks/useAuth.js` — same session listener pattern as web app
- `.env` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `LoginScreen.js` — email + password, amber brand, keyboard-avoiding view, Alert on error
- `HomeScreen.js` — 2×2 card grid: Active Batches, Revenue this month, Money Owed, Low Stock Count; pull-to-refresh; logout with confirmation Alert
- `App.js` — NavigationContainer + NativeStack, session-based routing (Login vs Home), loading spinner
- Auth flow: session detected → Home; no session → Login; logout clears session → back to Login

**New decisions:**
- Expo SDK 54 (downgraded from 56 to match Expo Go on device) — no file-based routing, using React Navigation instead for simplicity
- `EXPO_PUBLIC_` prefix for env vars — required by Expo to expose vars to the JS bundle
- Cards use `width: '47.5%'` for 2-column flex-wrap grid (no FlatList needed at 4 items)
- Currency display rounds to 0 decimal places on mobile for compactness (₹1,23,456 not ₹1,23,456.00)

**Current blockers:**
- None

**Next session task:**
- Session 7 — 3 quick-action screens (Record Sale, Distribute Feed, Record Payment) + home screen buttons

---

### Session 7 — Mobile Quick-Action Screens
**Completed:**
- `src/screens/RecordSaleScreen.js` — horizontal chip pickers for batch (active only) and vendor; auto-calculates total amount; saves to `sales` table; empty states if no active batches or no vendors
- `src/screens/DistributeFeedScreen.js` — loads `stock` table filtered to items with 'feed' in name (falls back to all items); shows available quantity badge; live remaining-after-distribution preview (turns red if depleted); deducts from `stock` table via direct update (clamps at 0)
- `src/screens/RecordPaymentScreen.js` — loads `vendor_balances` view filtered to `outstanding_balance > 0`; per-sale chip selector showing individual unpaid balances; "fully cleared" indicator when payment covers the sale; saves to `cash_collection` table
- `App.js` updated — registered `RecordSale`, `DistributeFeed`, `RecordPayment` screens in the authenticated NativeStack
- `HomeScreen.js` updated — added "Quick Actions" section below stat cards: 3 large colored buttons (amber/green/blue) each with icon, title, subtitle, and › arrow; tapping navigates to the respective screen

**New decisions:**
- DistributeFeed only updates stock quantity directly (no separate distribution log table) — keeps it simple at this stage
- Feed stock filter: `item_name.toLowerCase().includes('feed')` — falls back to showing all stock items if none match
- Quick action buttons use full-width rows (not grid) for large tap targets on mobile
- Each action screen has its own back button (← Back) returning to Home via `navigation.goBack()`

**Current blockers:**
- None

**Next session task:**
- Session 8 — Add Batches list screen to mobile app: show all active batches with farm name, chick count, and days remaining; tap a batch to see its sales and procurement linked to it

---

### Session 5 — Sidebar Navigation & Mobile Responsiveness
**Completed:**
- `Navbar.jsx` replaced with `Sidebar.jsx` — exports `DesktopSidebar` and `MobileHeader`
- `DesktopSidebar`: fixed left sidebar (w-56), visible on lg+ screens, sticky/full-height, brand logo, all 9 nav links with emoji icons, active link highlighted in amber, logout button at bottom
- `MobileHeader`: top bar with hamburger button, slide-in drawer from left, backdrop overlay, auto-close on route change, body scroll lock when open
- `AppLayout` in `App.jsx` updated to flex layout: sidebar + main content column
- All 9 page tables wrapped in `<div className="overflow-x-auto">` with `min-w-[Npx]` on `<table>` — horizontal scroll on small screens
- Pages covered: Farms, Batches, Vendors, Sales, Dashboard, Procurement, Expenses, CashCollection, BatchReport (3 detail tables)

**New decisions:**
- Sidebar width: 56 (224px) — fits all nav labels without truncation
- Mobile breakpoint: `lg` (1024px) — sidebar hidden below this, hamburger shown
- `Navbar.jsx` is now unused — safe to delete in a future cleanup session

**Current blockers:**
- None

**Next session task:**
- Session 6 — Reports page at `/reports` with monthly P&L trend (revenue vs expenses per month), batch comparison table, and top-level KPIs

---

### Session 4 — Batch Report
**Completed:**
- SQL migration `supabase/migrations/001_add_mortality.sql` — adds `mortality_count INTEGER DEFAULT 0` to `batches`
- `SoldModal` in `Batches.jsx` updated to optionally capture mortality count on close-out; shows live survival rate preview
- "View Report" link added to all sold/closed batch rows in the Batches table
- `/batches/:id/report` route and `BatchReport.jsx` page built
- Batch summary pills: chicks placed, mortality, survival rate (color-coded), kg sold
- Full P&L table: revenue → chick cost → feed → medicine → other procurement → expenses → total cost → net profit/loss
- Profit margin % shown in a colored footer strip (green = profitable, red = loss)
- Horizontal bar chart: Revenue vs Total Cost vs Net Profit (CSS only, no chart library)
- Cost breakdown list with color dots and % of total cost per category
- Sales detail table, Procurement detail table, Expenses detail table — all scoped to the batch
- Empty state when no data is linked to the batch

**New decisions:**
- Bar chart built with pure CSS (no Recharts/Chart.js dependency) — sufficient for this use case
- Procurement/expenses must have `batch_id` set at entry time to appear in the report; unlinked records are excluded
- `mortality_count` migration must be run manually in Supabase SQL Editor before "Mark as Sold" works fully

**Current blockers:**
- `mortality_count` column requires manual migration run: execute `supabase/migrations/001_add_mortality.sql` in Supabase SQL Editor

**Next session task:**
- Session 5 — Reports page at `/reports` with monthly P&L trend, revenue vs expenses per month chart, and batch comparison table

---

### Session 3 — Dashboard
**Completed:**
- Full `/dashboard` page built — replaces the placeholder
- 5 summary stat cards: Active Batches, Total Chicks Alive, Revenue this month, Outstanding Payments, Low Stock Alerts
- Cards are clickable links to their respective pages
- Outstanding Payments card turns red when balance > 0; Low Stock card turns amber when alerts exist
- Active batches table with progress bar (% of 45-day cycle), days remaining pill (orange ≤5, red if overdue)
- Recent transactions feed — merges latest 5 sales + expenses sorted by date, color-coded green/red
- Dashboard is now the default landing page after login (`/dashboard`)
- All data fetched in a single `Promise.all` for fast load

**New decisions:**
- Dashboard fetches from `vendor_balances` and `low_stock_alerts` views — confirms these views must exist in Supabase before dashboard works
- Recent transactions show max 5 combined (sales + expenses), sorted by date descending

**Current blockers:**
- None

**Next session task:**
- Session 4 — Batch detail page at `/batches/:id` showing per-batch P&L (revenue, procurement cost, expenses, net profit), feed usage log, linked sales, and a close-out form (final weight, mortality count, FCR)

---

### Session 2 — Core Pages
**Completed:**
- `/farms` — list, create, edit, delete farms; shows active batch count per farm
- `/batches` — list all batches; new batch form (farm, chick count, start date); days remaining calculation; "Mark as Sold" confirmation; filter by status
- `/procurement` — list purchases; new purchase form with auto-calculated total cost; type-filter pills; monthly spend summary bar; auto-syncs to stock on save
- `/stock` — card grid with color-coded status (ok/warning/low/empty); progress bar; Add/Use modals with live previews; alert banners for low/empty items; search; auto-created by procurement
- `/vendors` — list, add, edit, delete vendors; shows total purchases per vendor
- `/sales` — record sales (batch + vendor + kg + price); auto-calculated total; monthly revenue card
- `/cash-collection` — per-vendor outstanding balances; record payment modal (per-sale, with balance preview); payment history drawer; summary cards (total sales / collected / outstanding)
- `/expenses` — list by date; add expense (category, amount, description, date, optional batch link); monthly breakdown by category; filter pills

**New decisions:**
- `vendor_balances` Supabase view used for cash collection aggregation
- `batch_summary` and `low_stock_alerts` views created in schema but not yet surfaced in UI

---

## Pending Sessions

| Session | Goal |
|---------|------|
| **3**  | Dashboard — summary stats: active batches, total revenue this month, outstanding balance, low stock alerts, recent activity feed |
| **4**  | Batch detail page — per-batch P&L, feed usage, expenses breakdown, sales linked to batch |
| **5**  | Reports page — monthly P&L, revenue vs expenses chart, procurement cost breakdown |
| **6**  | Mobile responsiveness audit — ensure all pages work well on small screens |
| **7**  | RLS setup — enable Row Level Security with auth-based policies |
| **8**  | User management — invite team members, role-based access (admin / viewer) |
| **9**  | Notifications / alerts — low stock email or in-app alerts |
| **10** | React Native + Expo mobile app — mirror core pages (batches, stock, cash collection) |
| **11** | Batch close-out workflow — final weight, mortality count, FCR calculation |
| **12** | Supplier management — track procurement suppliers separately with history |
| **13** | PDF reports — exportable batch P&L, monthly summary |
| **14** | Vercel deployment — production build, env vars, custom domain |
| **15** | Polish & QA — empty states, error boundaries, loading skeletons, accessibility |

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://meebbwdaxszoyarssutm.supabase.co
VITE_SUPABASE_ANON_KEY=<see .env.local — never commit>
```

---

## Commands

```bash
# Dev server
cd poultry-manager
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```
