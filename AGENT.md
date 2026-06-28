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
| **Hosting**        | Vercel (web app) + separate Vercel project for admin panel |
| **Supabase URL**   | https://meebbwdaxszoyarssutm.supabase.co |
| **Supabase Project Ref** | `meebbwdaxszoyarssutm` (region: ap-south-1 Mumbai) |
| **Repo root**      | `/poultry-manager/` — main app; `/admin-panel/` — super admin panel (sibling folder) |
| **Supabase MCP**   | Connected as `supabase-poultry` in Claude Code — direct DB access via psql |

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

## Authentication & Multi-Org

- Provider: Supabase email + password (`signInWithPassword`)
- Session + org context managed via `AuthContext` (`src/contexts/AuthContext.jsx`) — replaces old `src/hooks/useAuth.js`
- `AuthProvider` wraps the entire app in `main.jsx`
- `useAuth()` returns: `user`, `organization`, `userRole`, `loading`, role booleans (`isOwner`, `isManager`, etc.), permission booleans, `signOut`, `selectOrganization`, `refreshOrg`
- `ProtectedRoute` guards protected routes: no user → `/login`, no org → `/setup`, role check optional
- **Multi-org flow:** 0 orgs → `/setup`; 1 org → auto-select; 2+ orgs → `/select-org` (sessionStorage tracks choice)
- RLS is **enabled** via migration `017_multi_org.sql` — policies enforce org-level data isolation at DB level
- App code also adds `.eq('organization_id', organization?.id)` to every query (defense in depth)
- Credentials stored in `.env.local` (gitignored via `*.local`)

### Roles & Permissions

| Role | canEdit | canDelete | canViewFinancials | canRecordOperations | canManageUsers |
|------|---------|-----------|-------------------|--------------------|----|
| `owner` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `manager` | ✅ | ❌ | ✅ | ✅ | ❌ |
| `farm_supervisor` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `accountant` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `viewer` | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Database Tables

All tables have `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` and `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

| Table              | Key Columns | Notes |
|--------------------|-------------|-------|
| `farms`            | name, location, capacity, phone_number (text, nullable) | Base entity — phone_number added in migration 002 |
| `batches`          | farm_id, start_date, chick_count, status (active/sold/closed), sold_at (date), closed_at (date) | 45-day grow-out cycle; sold_at/closed_at set when status changes |
| `vendors`          | name, phone, address | Buyers / traders |
| `item_types`       | name (unique), description, **is_distributable** (bool, default true) | **Catalog** — e.g. Chicks, Feed, Medicine. Added Session 18; `is_distributable` added migration 010 — Chicks = false |
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
| `stock_returns`    | farm_id, batch_id, distribution_id, item_name, item_type, quantity, unit, return_to_stock (bool), date, reason, notes | Return events for feed/medicine taken back from farms. Added migration 016 |
| `farm_expense_returns` | stock_return_id, distribution_id, farm_id, batch_id, item_name, item_type, quantity, unit, cost_per_unit, total_cost, date | Cost credit offsetting `farm_expenses`. Net cost = SUM(farm_expenses) − SUM(farm_expense_returns). Added migration 016 |
| `organizations`    | name, business_name, phone, address, subscription_plan, is_active, plan, service_status, service_status_reason, max_farms, max_users, notes, plan_changed_at, plan_changed_by | Top-level tenant. Added migration 017; plan/service columns added migration 022 |
| `organization_users` | organization_id (FK), user_id (FK auth.users), role (TEXT CHECK), is_active (bool) | Junction table — one row per user per org. `role` ∈ owner/manager/farm_supervisor/accountant/viewer. Added migration 017 |
| `invitations`      | organization_id (FK), email, role, token (unique hex), message, invited_by (FK auth.users), expires_at, accepted_at | Pending invite tokens. 7-day expiry. Accepted when `accepted_at` IS NOT NULL. Added migration 017 |
| `super_admins`     | user_id (FK auth.users), name, email, is_active | App-owner admin accounts. No signup — inserted manually. RLS: user can only read own row. |
| `plan_limits`      | plan (PK), max_farms, max_users, max_batches_per_month, features (jsonb) | free/basic/pro/enterprise limits config |
| `admin_activity_log` | admin_user_id, action, organization_id, details (jsonb) | Audit trail of all super admin actions |

> **All 23 existing tables** also have `organization_id UUID NOT NULL REFERENCES organizations(id)` added in migration 017. Row Level Security is enabled on all tables with policies that enforce org-level isolation.

### Plans

| Plan | Max Farms | Max Users | Reports | API |
|------|-----------|-----------|---------|-----|
| free | 2 | 3 | ❌ | ❌ |
| basic | 5 | 5 | ✅ | ❌ |
| pro | 20 | 15 | ✅ | ✅ |
| enterprise | unlimited | unlimited | ✅ | ✅ |

### Service Status
- `active` — normal access
- `suspended` — all org users blocked at login with message screen
- `cancelled` — permanent; data retained 30 days

### Admin SECURITY DEFINER Functions
| Function | Purpose |
|----------|---------|
| `admin_get_organizations()` | Returns all orgs with user/farm/batch/chick stats — bypasses RLS |
| `admin_get_org_users(p_org_id)` | Returns users + auth.users metadata for an org |
| `admin_update_plan(p_org_id, p_plan, p_reason)` | Updates plan + logs to admin_activity_log |
| `admin_update_service_status(p_org_id, p_status, p_reason)` | Updates service status + logs |
| `admin_update_notes(p_org_id, p_notes)` | Updates admin notes on org |
| `create_organization(p_name, p_user_id, ...)` | Bootstrap function — creates org + owner row, bypasses RLS |

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
8. **Item catalog** — `item_types` (Feed, Medicine, etc.) → `items` (Starter Feed/Bags, etc.). Managed at `/settings/catalog` (web). Mobile: view-only via CatalogScreen. **Chicks are NOT in the catalog** — chick counts are recorded at batch creation only (migration 011 removed Chicks from item_types).
9. **Sold/Closed dates** — `batches.sold_at` and `batches.closed_at` are set automatically when status is changed. Shown in Batches list when filtering by Sold or Closed tab.
10. **Sales validation** — A batch cannot be marked as Sold or Closed unless at least one sale record exists for it.
11. **Supplier accounts payable** — `suppliers` tracks who we owe money to. Outstanding = SUM(procurement.cost WHERE supplier_id) − SUM(supplier_payments.amount WHERE supplier_id). FIFO payment status: oldest procurements considered paid first.
12. **Supplier payment overpay warning** — warn (but allow) if payment amount exceeds outstanding balance.
13. **No free-text supplier in procurement** — supplier field is a FK dropdown, not text (Session 19).
14. **Distribution form item filter** — Type dropdown comes from `item_types WHERE is_distributable = true`. Item dropdown comes from `items WHERE item_type_id = selectedTypeId AND is_active = true`. Chicks (`is_distributable = false`) are never shown in the Type dropdown. Item selection resets when Type changes.
15. **Currency formatting** — ALL currency values must use `formatCurrency()` from `src/utils/format.js`. All intermediate calculated values must use `roundCurrency()` before display or storage. FCR always uses `formatFCR()`. Never use raw `toLocaleString()` or `toFixed()` directly for currency.
16. **Stock quantity in distribution form** — item quantity shown by matching `item_name` (case-insensitive) against the `stock` table. If no stock entry exists, the item is still selectable but shows "not in stock". The `stock_id` in the distributions insert is nullable.
17. **Advances source of truth** — `growing_fee_advances` table is the ONLY source of truth for all advances ever paid (active and closed batches). `growing_fee_ledger.total_advances` is a snapshot made at batch close — do NOT use it for total advance summaries. Always query `growing_fee_advances` directly.
18. **Active batch advances are NOT liabilities** — advances are cash already paid out. They are not outstanding liabilities. Only `growing_fee_ledger.balance_due` WHERE status IN ('pending', 'partial') represents liabilities (closed batches only).
19. **Growing Fees page summary layout** — 4 cards + 1 info row: (1) Total Gross Fees (from ledger.total_fee), (2) Total Advances (SUM growing_fee_advances.amount — all time), (3) Post-close Paid (SUM ledger.amount_paid), (4) Outstanding (SUM ledger.balance_due WHERE status != paid). Info row shows active-batch advances separately with explanatory text.
20. **Growing fee is an ACCRUAL expense** — recognized at batch close (sold_at date), NOT at payment date. P&L queries `growing_fee_ledger.total_fee` filtered by `batches.sold_at` in the period. Even if fee is unpaid/pending, it appears in P&L for the period the batch closed.
21. **P&L vs Balance Sheet distinction**: P&L shows `total_fee` (full accrual cost). Balance sheet liabilities show `balance_due` (what is still owed after advances + payments). These are different numbers and both correct.
22. **P&L growing fee query** — two-step: (1) fetch `batches.id WHERE status='sold' AND sold_at IN period`, (2) fetch `growing_fee_ledger WHERE batch_id IN those IDs`, sum `total_fee`. Do NOT query `transactions` table for growing fee costs in P&L.
23. **Farm P&L includes growing fees** — `totalCost` in FarmDetail overview = chickCost + feedCost + medicineCost + growingFeeCost (from `growingFeeLedger.reduce(total_fee)`). Financial bar includes purple segment for growing fees.
24. **BatchDetail growing fee** — already included via `batch.growing_fee_total` in expense totals. Active batches show "Pending — calculated at batch close" messaging.
25. **Weighted-average cost must be rounded at division** — `getAverageCostPerUnit()` (and inline equivalents) must return `roundCurrency(totalCost / totalQty)`, not raw division. Irrational numbers compound on multiplication.
26. **Total cost must be rounded at multiplication** — `total_cost` stored in `farm_expenses` must always be `roundCurrency(qty * avgCpu)` — never `qty * avgCpu` raw. Same for `cost_per_unit`. DB must never store floating-point artifacts.
27. **DB cleanup migration** — `supabase/migrations/012_round_farm_expenses.sql` backfills existing rows with unrounded values. Run once in Supabase SQL Editor if farm_expenses rows exist from before this fix.
28. **Procurement cost MUST be batch-scoped** — `getAverageCostPerUnit(itemName, { batchId, startDate })` scopes procurement lookup to: (1) `batch_id = batchId` first, (2) `date >= startDate` (batch start_date) second, (3) global last resort. NEVER call it without `startDate` from a distribution context. Cross-batch averages produce wrong P&L numbers.
29. **Chick cost is a direct sum, not proportional** — query `procurement WHERE type='chicks' AND batch_id IN (farmBatchIds)`. Never compute `(farmChicks / allFarmsChicks) * allFarmsCost`. That proportional formula breaks completely when farms pay different prices for chicks.
30. **Batch before procurement (insert order)** — in NewBatchModal and any future batch creation logic: always insert the `batches` record first to obtain the `id`, then insert `procurement` with `batch_id = batch.id`. Inserting procurement before batch leaves `batch_id = NULL` on the procurement record forever.
31. **Feed procurement lacks batch_id** — Procurement.jsx currently has no batch selector. Feed/medicine procurement records have `batch_id = NULL`. The date-range fallback in `getAverageCostPerUnit` handles this. If Procurement.jsx ever adds batch selection, batch_id-scoped lookup will activate automatically.
32. **Every division that produces currency must be rounded** — `cost / qty`, `rate * kg`, `price * count` — all must be `roundCurrency(...)` before being stored to DB or used in further multiplication. Applies to: Procurement.jsx cpu, ProcurementScreen.js costPerUnit, BatchDetail.jsx growing fee totalFee.
33. **Growing fee ledger fields must all be rounded** — `total_fee`, `total_advances`, `balance_due`, `amount_paid`, `overpaid_amount` in `growing_fee_ledger` must be `roundCurrency()` before insert/update. FIFO payment distribution loops must round `applied`, `remaining`, `newAmountPaid`, `newBalanceDue` at each step.
34. **Mobile `formatCurrency` must always have `maximumFractionDigits: 2`** — every local `formatCurrency`/`fmt` function in mobile screens must include both `minimumFractionDigits: 2` AND `maximumFractionDigits: 2`. Missing `maximumFractionDigits` causes 3+ decimal places to display when stored values have floating point artifacts.
35. **Dashboard computed values must be rounded** — `cashAndBank`, `stockValue`, `totalAssets`, `totalLiabilities`, `netWorth` in Dashboard.jsx are computed on the fly and must be wrapped in `roundCurrency()` to prevent display of accumulated floating point errors.
36. **`procurement.type` is TEXT, not ENUM** — migration 015 dropped the `procurement_type` enum. The column is now plain TEXT. Any `item_type.name.toLowerCase()` value is valid. Never add a DB enum for item types — `item_types` table is the sole source of truth.
37. **Stock Return tables** — `stock_returns` logs each return event; `farm_expense_returns` is the cost-credit table that offsets `farm_expenses`. `distributions.returned_quantity` is a denormalised sum updated at each return save.
38. **Net feed/medicine cost** — `feedCost` and `medCost` throughout the app must deduct `farm_expense_returns` credits. Net = SUM(farm_expenses WHERE item_type=feed) − SUM(farm_expense_returns WHERE item_type=feed). Always compute net before display or P&L.
39. **`StockReturnModal` is a shared component** — located at `src/components/StockReturnModal.jsx`. Never duplicate it. Used in FarmDetail.jsx and BatchDetail.jsx.
40. **Return-to-stock vs waste** — `return_to_stock = true` (condition=usable) inserts a `stock_ledger IN` entry and updates the `stock` table. `return_to_stock = false` (waste) only removes cost via `farm_expense_returns`; no stock is added back.
41. **Post-close return prompt** — `handleMarkAsSold` in BatchDetail.jsx sets `postCloseModal = true` after batch is closed. Dialog gives user option to go to farm page to record returns via the Return buttons in the distributions list.
42. **Multi-tenancy via organization_id** — Every DB table has `organization_id UUID NOT NULL FK → organizations`. ALL Supabase queries must include `.eq('organization_id', organization?.id)`. RLS enforces isolation at DB level; app-level filter is defense in depth. Never skip either.
43. **useAuth() is AuthContext, not the old hook** — Always import `useAuth` from `'../contexts/AuthContext'` (or `'../../contexts/AuthContext'`). The old `src/hooks/useAuth.js` returns only `{ session, loading }` and is superseded. New code must never import from the old hook.
44. **Permission gates pattern** — Use `const { canEdit, canDelete, canRecordOperations, canViewFinancials } = useAuth()`. Wrap buttons: `{canEdit && <button>...}`. Financial sections: `{canViewFinancials && <div>...}`. Page-level redirects for restricted pages: `if (!canViewFinancials) return <Navigate to="/dashboard" replace />` (placed after all hooks).
45. **Invitation flow** — Invitations are created in the `invitations` table (token = 16-char hex, 7-day expiry). The invite link is `/invite/:token`. `accepted_at` is set when accepted. Accepting inserts a new `organization_users` row and calls `refreshOrg()` from AuthContext.
46. **Owner guard on destructive org actions** — Before deactivating a member or changing their role to non-owner, TeamSettings.jsx checks that at least one other active owner exists. Prevents org lockout.
47. **lib utility functions take organizationId as parameter** — `addToStock`, `subtractFromStock`, `ledgerIn`, `ledgerOut`, `getChickBalance`, `getAverageCostPerUnit` all accept `organizationId` (positional or in options object). Callers pass `organization?.id` from `useAuth()`. Never use `useAuth()` inside lib files.
48. **Sidebar nav is role-filtered** — `ALL_NAV` in Sidebar.jsx has `roles` field (null = all roles, array = allowed roles). `useFilteredNav(userRole)` removes items the user can't see. This is UX convenience only — page-level guards are the real security.
49. **Supplier is required on all purchases** — Procurement modal and NewBatchModal both validate that a supplier is selected before saving. No "No supplier / unknown" option. Without a supplier, the cost cannot be tracked as a liability in Supplier Dues.
50. **Audit trail on all entry tables** — `created_by_id`, `created_by_name`, `updated_by_id`, `updated_by_name`, `updated_at` columns added to: procurement, sales, expenses, cash_collection, transactions, distributions, batches, supplier_payments, growing_fee_advances, accounts, farm_expenses, stock_returns. Shown in tables as a clock icon (hover tooltip) via `AuditInfo` component at `src/components/AuditInfo.jsx`.
51. **Service status check on login** — `AuthContext` checks `organization.service_status` after loading org. If `suspended` or `cancelled`, signs out the user and sets `serviceBlocked` state. `ProtectedRoute` shows a full-screen blocking message instead of the app.
52. **Super admin panel is a separate app** — Located at `/admin-panel/` (sibling to `/poultry-manager/`). Uses the same Supabase project. Access controlled by `super_admins` table. No signup page — admin rows inserted manually via DB. Every admin action logged to `admin_activity_log`.
53. **super_admins RLS** — Policy `super_admin_self_select`: `USING (user_id = auth.uid())` — users can only read their own row. Avoids the circular self-referential policy problem.
54. **Item catalog data migration** — All existing items/item_types and all other table data must be assigned to the correct `organization_id`. The abc org ID is `e955f09e-eab3-4e6a-be9e-46a3c48e1360`. Run UPDATE on all tables if data appears missing.
55. **Untracked purchases warning** — Procurement page shows an amber banner listing all procurement records with no `supplier_id`, showing total untracked amount. These are not tracked as liabilities anywhere.

---

## Folder Structure

```
src/
├── components/
│   ├── Sidebar.jsx         — DesktopSidebar + MobileHeader; role-filtered nav via useFilteredNav()
│   ├── ProtectedRoute.jsx  — guards: no user → /login, no org → /setup
│   └── StockReturnModal.jsx — shared stock return modal (FarmDetail + BatchDetail)
├── contexts/
│   └── AuthContext.jsx     — AuthProvider + useAuth(); provides user/organization/userRole/permissions
├── hooks/
│   ├── useAuth.js          — LEGACY (superseded by AuthContext.jsx — do not use for new code)
│   └── usePermissions.js   — wraps useAuth() with a can(action) helper function
├── lib/
│   ├── supabaseClient.js   — Supabase singleton (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
│   ├── stockHelpers.js     — addToStock(name, qty, unit, orgId), subtractFromStock(name, qty, orgId)
│   └── stockLedger.js      — ledgerIn({...orgId}), ledgerOut({...orgId}), getChickBalance(orgId), getAverageCostPerUnit(name, {batchId, startDate, orgId})
├── utils/
│   └── format.js           — formatCurrency(), formatCurrencyRound(), roundCurrency(), formatFCR() — ALL currency display must use these
└── pages/
    ├── Login.jsx
    ├── Signup.jsx          — NEW: email+password signup → creates org → owner role
    ├── OrgSetup.jsx        — NEW: shown when user has no org; create org OR join with token
    ├── OrgSelector.jsx     — NEW: shown when user belongs to multiple orgs
    ├── InviteAccept.jsx    — NEW: /invite/:token — accept invite (login or signup first)
    ├── Dashboard.jsx
    ├── Farms.jsx
    ├── FarmDetail.jsx
    ├── Batches.jsx
    ├── BatchDetail.jsx
    ├── Procurement.jsx
    ├── Stock.jsx
    ├── Vendors.jsx
    ├── Sales.jsx
    ├── CashCollection.jsx
    ├── Expenses.jsx
    ├── Suppliers.jsx
    ├── SupplierDetail.jsx
    ├── AccountsPage.jsx
    ├── PLReport.jsx
    ├── FCRReport.jsx
    ├── GrowingFees.jsx
    ├── BatchReport.jsx
    ├── CatalogSettings.jsx — /settings/catalog (owner/manager only)
    ├── GrowingFeeSettings.jsx — /settings/growing-fee (owner only)
    ├── TeamSettings.jsx    — NEW: /settings/team (owner only) — invite + manage members
    ├── OrgSettings.jsx     — NEW: /settings/organization (owner only)
    └── Profile.jsx         — NEW: /settings/profile (all roles)
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

### Session 28 — Mobile Feature Parity (Auth Foundation + Settings/Profile + Reports + Stock Returns)

**Goal:** Build the mobile modules that existed on web but were missing on mobile.

**Completed:**

1. **Auth & org foundation — mobile now mirrors web `AuthContext`:**
   - `poultry-manager-mobile/src/contexts/AuthContext.js` CREATED — `AuthProvider` + `useAuth()` with `user`, `organization`, `orgs`, `userRole`, `serviceBlocked`, role booleans, all permission booleans (`canEdit/canDelete/canViewFinancials/canRecordOperations/canManageUsers`), `signOut`, `selectOrganization`, `refreshOrg`, `dismissServiceBlock`. Selected-org persisted in **AsyncStorage** (`selectedOrgId`), not sessionStorage.
   - `src/hooks/useAuth.js` is now a **shim** re-exporting from the context (old imports still work).
   - `App.js` wrapped in `<AuthProvider>`; root navigator now handles: loading → service-blocked → no session (Login/Signup) → no org (OrgSetup if 0 orgs / OrgSelector if 2+) → Main.
   - NEW screens: `SignupScreen.js`, `OrgSelectorScreen.js`, `ServiceBlockedScreen.js`. `LoginScreen` got a Sign-up link.
   - `MoreScreen` is now role-filtered (owner-only + financial items hidden by role; UX only — screens self-guard).

2. **Settings & Profile (NEW mobile screens):** `ProfileScreen.js` (edit name, change password via re-auth, language switcher, sign out, role/org/member-since), `OrgSettingsScreen.js` (edit org details, deactivate with type-to-confirm, owner-gated), `GrowingFeeSettingsScreen.js` (FCR-tier rate CRUD, owner-gated).

3. **Reports (NEW mobile screens):** `FCRReportScreen.js` (FCR across closed batches) and `BatchReportScreen.js` (per-batch P&L; net-of-returns feed/med, direct chick cost, growing-fee accrual; reached via a "📄 Report" button on sold/closed batches in `BatchDetailScreen`). Both gated by `canViewFinancials`. Note: the web `BatchReport.jsx` is an older variant — the mobile port uses the canonical net-of-returns/growing-fee formulas from `BatchDetail.jsx`/`PLReport.jsx`.

4. **Stock Returns (NEW on mobile):** `src/components/StockReturnModal.js` (shared by FarmDetail + BatchDetail, rule #39) + net-of-returns wiring in `FarmDetailScreen.js`, `BatchDetailScreen.js`, `PLReportScreen.js`. Save flow matches the web canonical (rules #37–41).

**All new screens registered in `App.js` (MoreStack + BatchesStack). Every new file Babel-parses; imports resolve; new queries org-scoped; currency uses the 2-decimal pattern.**

**🚨 CRITICAL BUG found AND FIXED — mobile multi-org write/read scoping:**
- Root cause: `organization_id` is **NOT NULL, no default, NO trigger** on all core tables (verified against live DB), but 13 mobile screens were INSERTing without it (writes **hard-failed** at the DB) and most SELECTs weren't org-scoped (cross-org leakage). Mobile was never migrated to multi-org — Session 25 was web-only.
- **FIX (this session):** across every data screen, added `organization_id: orgId` to each INSERT and `.eq('organization_id', orgId)` to each SELECT/UPDATE/DELETE on org-scoped tables. `orgId = useAuth().organization?.id`, with `if (!orgId) return` guards + `orgId` in fetch deps. Screens fixed: Batches, DistributeFeed, Procurement, RecordSale, RecordPayment, Sales, Payments, Farms, Stock, Vendors, Catalog, Suppliers, SupplierDetail, Accounts, Expenses, FarmDetail, BatchDetail, Home, PLReport + StockReturnModal. **AST audit: 129 selects scoped, 41 inserts stamped, 24 updates/deletes scoped, 0 violations**; views/auth tables correctly excluded. (ExpensesScreen is read-only — no insert.)

**Auth — email verification + invite fix (Session 28; code done, needs deploy + dashboard toggle):**
- Problem: "Confirm email" had been turned OFF to stop an invite error → anyone could self-register with fake emails (`abc@abc.com`). The invite error root cause: with confirmation ON, an invited NEW user's `signUp` is unconfirmed → "Email not confirmed" on login.
- Fix (model chosen = self-serve + verified): keep "Confirm email" ON for public signups; invited users are created **PRE-CONFIRMED** (the invite email already verifies them) by a new edge function **`accept-invitation`** (service role, `email_confirm: true`, validates token, inserts `organization_users`, marks `accepted_at`; handled outcomes return 200 with `{error, code}`). Web `src/pages/InviteAccept.jsx` signup path now calls it then `signInWithPassword`; existing-user (login) path unchanged. `supabase/config.toml`: `enable_confirmations = true` + `[functions.accept-invitation] verify_jwt = false`.
- **Mobile invite flow (DONE):** new `poultry-manager-mobile/src/screens/InviteAcceptScreen.js` (registered in the pre-login stack; reachable via Login → "Have an invitation? Accept it"). User pastes the invite code or full `/invite/<token>` link → validates the invitation → NEW users go through the `accept-invitation` edge function (pre-confirmed) then `signInWithPassword`; EXISTING users sign in + `accept_invitation` RPC. No deep-linking set up (paste-token, same as OrgSetup join).
- **USER TODO (on the LIVE project):** (1) deploy `supabase functions deploy accept-invitation --no-verify-jwt`; (2) re-enable Auth → "Confirm email" in the dashboard.

**Subscription plans + farm/user limits (Session 28; code done, needs migration + admin-infra check):**
- DB: `poultry-manager/supabase/migrations/023_subscription_plans.sql` — new **`plans`** table (`key, name, max_farms, max_users` [NULL=unlimited], `price_monthly, is_active, sort_order`), seeded **Free(2 farms/1 user)** / Basic(5/5) / Pro(20/15) / Enterprise(unlimited). `organizations.subscription_plan` = plan key; added `plan_changed_at/by`. BEFORE-INSERT triggers on `farms` + `organization_users` HARD-enforce limits (`FARM_LIMIT_REACHED` / `USER_LIMIT_REACHED`). `change_organization_plan(org,user,plan)` = owner self-service (blocks downgrade below usage). `create_organization` now accepts `p_plan`. `admin_update_plan` recreated. `plans` RLS: public read, super_admins write; delete-in-use blocked (`PLAN_IN_USE`).
- Admin panel: new `Plans.jsx` (CRUD) + route/nav; `OrgDetail.jsx` now DB-sources plans (removed hardcoded `PLAN_LIMITS`; fixed a latent `org.plan`→`org.subscription_plan` bug).
- Web app: Signup plan picker (defers choice via `localStorage['signup_plan']` through email-confirm → applied in OrgSetup); OrgSettings shows plan + usage (`X/Y farms`, `X/Y users`) + owner Change-Plan modal; Farms + TeamSettings disable Add/Invite at the limit (upgrade link) and map the DB limit errors. Both web + admin builds green.
- **Scope:** web + admin only (NOT mobile). **Target DB: `khbuypzugydxvejjcoam`** — admin `.env.local` repointed there (web-dev + mobile already there; old admin env backed up in session scratchpad).
- **USER TODO:** (1) run migrations **023 then 024** on `khbuypzugydxvejjcoam`; (2) ensure admin infra (`super_admins` + `admin_*` functions) exists on `khbuypzugydxvejjcoam` or the admin panel won't log in there (else revert admin `.env` from backup); (3) note production `thekzwqdjlfssjshffto` does NOT get this feature.

**Yearly billing + signup redesign (Session 28):**
- DB `024_yearly_billing.sql`: adds `plans.price_yearly` (backfilled to ~10× monthly = 2 months free for existing paid plans), `organizations.billing_period` ('monthly'|'yearly', CHECK). `create_organization` + `change_organization_plan` now take `p_billing_period` (overloads collapsed into single functions). Run AFTER 023.
- Admin `Plans.jsx`: added a "Price (yearly)" field (form state + payload + 3-col price grid).
- Web `Signup.jsx`: **redesigned plan picker** — Monthly/Yearly pill toggle + "Save up to X%" hint, radio-dot cards with farm/user chip badges + bold price, yearly shows ≈/mo + savings; **removed the redundant `description` line** (it duplicated the limits and went stale after limit edits). Billing choice flows through the email-confirm deferral (`localStorage['signup_billing']`) → applied in `OrgSetup`.
- Web `OrgSettings.jsx`: change-plan modal now has a Monthly/Yearly toggle, per-period prices, passes `p_billing_period`, and the confirm button enables on billing-only changes. Both web + admin builds green.

**Onboarding flow reworked → 3 steps (Session 28):** Sign up → Create org → **Choose plan** (plan selection pulled OUT of signup/org-setup into a dedicated page).
- `Signup.jsx` rewritten **account-only** (full name, email, password — no business name, no plan); after `signUp` with a session → `window.location='/setup'`; email-confirm path unchanged.
- `OrgSetup.jsx`: plan picker removed; creating the org (defaults to Free) now redirects to `/choose-plan` (was `/dashboard`).
- NEW `src/pages/ChoosePlan.jsx` (route `/choose-plan`, `ProtectedRoute`, no sidebar): proper pricing page — rich cards (name, tagline, big price, feature checklist with farms/users emphasised + common features, "Most Popular" ribbon on `pro`, outline vs filled CTA), and **per-card Monthly/Yearly selector** (no global toggle). Calls `change_organization_plan(org,user,plan,billing)` → `/dashboard`; "Skip — continue on Free" link. `App.jsx` route added.
- **Shared `src/components/PlanCard.jsx`** — the rich plan card (per-card monthly/yearly selector, feature checklist, "Most Popular" ribbon, "3 months free trial" badge on paid via `showTrial` prop). Used by BOTH `ChoosePlan.jsx` (onboarding, `showTrial`) and `OrgSettings.jsx`'s **redesigned change-plan modal** (wide 4-col grid, `showTrial=false`, "CURRENT PLAN" badge + "Current plan"/"Update billing" CTA, per-card choose applies immediately via `change_organization_plan`). Trial badge hidden on the Free plan.

**Razorpay subscriptions / autopay (Session 28; code done, needs Razorpay account + secrets + plans + webhook):**
- DB `025_razorpay_subscriptions.sql`: `plans.razorpay_plan_id_monthly/_yearly` (app-plan→Razorpay-plan map); `organizations.razorpay_customer_id / razorpay_subscription_id / subscription_status / current_period_end / pending_plan / pending_billing_period`; `subscription_events` table (webhook idempotency/audit). Run after 024.
- Edge functions: `razorpay-create-subscription` (owner-only, JWT-verified; creates the Razorpay subscription with `RAZORPAY_KEY_SECRET`, `start_at` = now+90d for the trial, stores `pending_*`, returns `{subscription_id, key_id}`); `razorpay-verify-subscription` (owner-only; verifies the Checkout success signature `payment_id|subscription_id` and activates the plan — **PRIMARY activation path**, because `subscription.authenticated` is NOT a subscribable Razorpay webhook event); and `razorpay-webhook` (`--no-verify-jwt`; HMAC-verifies `x-razorpay-signature`, dedupes by event id via `subscription_events`, applies `pending_plan` on `subscription.activated/charged`, reverts to free on `cancelled/completed/expired`). `config.toml`: `[functions.razorpay-webhook] verify_jwt=false`.
- Frontend `src/lib/razorpay.js`: `loadRazorpay()` + `subscribeToPlan()` (invoke create-subscription → open Checkout with `subscription_id`). `ChoosePlan` + `OrgSettings` modal: PAID plans route through `subscribeToPlan` (webhook applies plan after first charge); FREE applies instantly via `change_organization_plan`. Admin `Plans.jsx`: "Razorpay plan id — monthly/yearly" fields.
- **USER TODO:** create Razorpay account → Test keys; `supabase secrets set RAZORPAY_KEY_ID=… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=…`; create Razorpay **Plans** (one per app-plan × cycle) + paste ids in admin Plans; add `VITE_RAZORPAY_KEY_ID` to web `.env`; deploy 3 functions — `razorpay-create-subscription`, `razorpay-verify-subscription`, `razorpay-webhook --no-verify-jwt`; register the webhook URL in Razorpay with events **subscription.activated/charged/cancelled/completed/halted/pending + payment.failed** (NOT `authenticated` — not selectable; activation handled by verify-subscription); run migration 025. **Recurring needs KYC approval for LIVE** (Test Mode works for dev now). Secret key must NEVER be in the repo/client — only in Supabase function secrets.

**Distribution recording fix + shared modal (Session 28):** Web BatchDetail's distributions "+ Record" linked to a non-existent `/distribute` route → the catch-all `*` route bounced it to `/dashboard`. Extracted the distribution form into **`src/components/DistributionModal.jsx`** (self-fetches central stock + the farm's active batches; `initialBatchId` prop preselects a batch). BatchDetail now opens it **inline** (preselecting the current batch). FarmDetail still has its own local copy of the modal (+ a `?record=dist` query param that auto-opens it) — **pending cleanup:** point FarmDetail at the shared component to drop the ~270-line duplicate (money-logic — keep them in sync until then).

**Starter seed script (Session 28):** `poultry-manager/supabase/seed_starter_data.sql` — idempotent PL/pgSQL `DO` block (resolves the org by name via `v_org_name`) that seeds the **item catalog** (4 types Feed/Medicine/Vaccine/Supplement + 18 items), **growing-fee FCR tiers** (5 tiers, ₹9→₹5/kg as FCR worsens), a **Sample Supplier**, and **6 sample procurement** rows. The procurement loop also upserts `stock` and writes `stock_ledger` `in` entries so purchased items actually show as in-stock (raw procurement inserts alone wouldn't). Re-run-safe (item_types/items/suppliers guarded by existence; fee config & procurement only seed if the org has none). Run in the SQL Editor on `khbuypzugydxvejjcoam`; syntax-validated via a read-only compile check (raises before any write).

**Attachments system (Session 28) — reusable file/image uploads:** Polymorphic, org-scoped attachments backed by a private Supabase Storage bucket. Decision: Supabase Storage (free tier 1 GB + 5 GB egress; not GCP), web + mobile, images + PDF. **Foundation:** `migrations/026_attachments.sql` — `attachments` table (entity_type/entity_id/file_path/file_name/file_type/file_size/kind + org_id + uploader audit), RLS via `get_user_organization_id()`, private bucket `attachments` (10 MB cap, image/* + pdf), storage.objects policies scoped to `(storage.foldername(name))[1] = org_id`. Path convention `{org}/{entity_type}/{entity_id}/{uuid}.{ext}`. **Web (done):** `src/lib/attachments.js` (canvas image compression ~1600px/q0.7, `uploadAttachments`, `attachmentsByEntity`, `signedUrl`, `openAttachment`, `deleteAttachment`); reusable controlled `src/components/AttachmentUploader.jsx` (thumbnails + camera/gallery/files via one `<input accept=image/*,pdf>`); wired into Procurement Add Purchase — files held in `pendingFiles`, uploaded on save attached to the purchase's **first** procurement row; list shows 📎(count) opening a signed URL. **USER TODO:** run `026_attachments.sql` on khbuypzugydxvejjcoam. **Mobile (done — needs native rebuild):** installed `expo-image-picker`/`expo-document-picker`/`expo-image-manipulator`/`expo-file-system`/`base64-arraybuffer` (SDK 54). `src/lib/attachments.js` uploads via base64→ArrayBuffer (`manipulateAsync`+`SaveFormat` to compress; the new `expo-file-system` `File(uri).base64()` for PDFs (the `/legacy` subpath doesn't resolve in v19); `decode` from base64-arraybuffer; `supabase.storage.upload(path, ArrayBuffer)`). Components `AttachmentUploader.js` (📷 Camera / 🖼 Gallery / 📄 File buttons, thumbnails) + `AttachmentViewer.js` (bottom-sheet, tap-to-open via Linking, delete). Wired into `ProcurementScreen`: uploader in the add sheet (uploads on save to the new proc id), purchase cards now tappable → viewer with a detail header. `app.json` got the `expo-image-picker` plugin (camera/photos permission strings). APIs verified against installed SDK-54 `.d.ts` (note: repo AGENTS.md references Expo v56 docs but installed is v54 — coded to the installed types). **Native modules → needs a dev-client / EAS rebuild (won't run in the old APK or plain Expo Go reload).**

**Cash collection — in-hand → verify workflow (Session 28, in progress):** Big change so collections no longer post to accounts on record. Decisions: vendor required + sale optional, per-collection verify, anyone-except-viewer records / owner+accountant verify, image upload on record (mobile-focused). **Phase 1 DB done — `migrations/027_cash_collection_verification.sql`** (USER TODO: run on khbuypzugydxvejjcoam): `cash_collection.sale_id` now nullable; added `collected_by_id/name`, `method` (cash/online/cheque), `status` (pending/verified/rejected), `verified_by_id/name`, `verified_at`, `account_id`, `transaction_id`, `reject_reason`; backfills existing rows → verified (collector=creator); RLS insert opened to owner/manager/farm_supervisor/accountant; **`verify_cash_collection(p_id,p_account_id,p_verified_by_name)`** + **`reject_cash_collection(p_id,p_reason,p_by_name)`** SECURITY DEFINER RPCs (verify posts the `in` transaction + clears the hand; only owner/accountant). "Cash in hand" = SUM of a collector's pending collections (computed, not stored). **Phase 2 mobile done** — `src/screens/CollectionScreen.js` (cash-in-hand card, record modal with method/vendor/notes + `AttachmentUploader` photo/screenshot, "My collections" + owner/accountant "To verify" queue with Verify→account-picker / Reject; taps open `AttachmentViewer`); nav wired in `App.js` (`Collection` screen) + `MoreScreen` (the 💳 item now → `Collection`, was mis-pointed to `Payments`). Uses attachments (`entity_type='cash_collection'`) → needs the native picker rebuild like Procurement. **Phase 3 web DONE:** `src/pages/CashCollection.jsx` rewritten — no more immediate transaction insert on record. Tabbed: **My Collections** (cash-in-hand card = my pending total + `CollectionModal` record form with method/vendor/optional-sale/notes/`AttachmentUploader`, posts pending), **To Verify** (owner/accountant — pending queue cards → `VerifyModal` account picker calling `verify_cash_collection`, or Reject via `reject_cash_collection`), **Receivables** (canViewFinancials — the kept `vendor_balances` overview). Cards open `AttachmentViewer` with a detail header. Guard relaxed to allow any collector (viewers with no financial access still redirected). All three platforms now share the flow; **USER TODO: run migration 027 on khbuypzugydxvejjcoam** (nothing works until then). **Edit:** the creator can edit their own **pending** collection (CollectionModal/record-modal now does UPDATE-or-INSERT, prefilled; Edit button on mine+pending cards on web & mobile) — RLS `cc_update` already allows own-pending; verified/rejected are locked. Creator can also delete a pending collection's attachments via the viewer (`canDelete` extended to own-pending).

**Sales confirmation workflow (Session 28, in progress):** Same pattern as cash collection — a sale counts NOWHERE until confirmed. Decisions: owner+manager+accountant confirm; pending sales still count against the flock (no overselling) but not toward revenue/receivables/FCR. **Phase 1 DB done — `migrations/028_sales_confirmation.sql`** (USER TODO, but HOLD until BatchDetail below is done): `sales.status` (pending/confirmed/rejected) + confirmed_by/at + reject_reason; backfill existing → confirmed (>1h old, re-run-safe); `confirm_sale(p_id,p_by_name)` (re-checks overselling vs live flock) + `reject_sale` RPCs (SECURITY DEFINER, owner/manager/accountant); **views `vendor_balances` + `batch_summary` now count only `status='confirmed'` sales AND only `status='verified'` collections** (fixes receivables to exclude unverified collections too). **Phase 2 read-filters done** (via 2 agents): added `.eq('status','confirmed')` to revenue/P&L/FCR/dashboard aggregations (web PLReport/Dashboard×2/BatchReport; mobile PLReport/Home×2/BatchReport) and `.neq('status','rejected')` to flock-availability checks (web FarmDetail; mobile FarmDetail×2). **Phase 3 Sales-list confirm UI done** — web `Sales.jsx` + mobile `SalesScreen.js`: status badges, Confirm/Reject (owner/manager/accountant) via the RPCs, revenue/totals confirmed-only, availability checks → non-rejected, sale select now includes `status`(+`chicken_count` on mobile). **Phase 3 BatchDetail DONE** (web `BatchDetail.jsx` + mobile `BatchDetailScreen.js`): revenue + totalSaleKg → confirmed-only; soldSoFar/availability (incl. the in-modal hint) → non-rejected; sales list got a Status column/badge + Confirm/Reject (owner/manager/accountant via the RPCs); `canConfirmSales` from `userRole`. **FEATURE COMPLETE on all surfaces (DB + web + mobile). `028` is now SAFE TO RUN on khbuypzugydxvejjcoam** (backfills existing sales → confirmed). Flow: record → pending (counts vs flock, not revenue) → owner/manager/accountant Confirm (Sales list or BatchDetail) → counts everywhere; Reject voids.

**Dark mode (Session 28):** Both apps, system-default + manual toggle. **WEB DONE:** `index.css` adds `@custom-variant dark (&:where(.dark,.dark *))` + semantic tokens (`--bg/--surface/--surface-2/--text/--text-muted/--text-faint/--border`) in `:root`(light) & `.dark`, and an **UNLAYERED `.dark` remap block** that flips the neutral Tailwind utilities (`bg-white`/`bg-gray-50/100/200`, `text-gray-*`, `border-gray-*`, inputs, faint accent tints) app-wide without per-file edits (Tailwind v4 layered utilities lose to unlayered rules). `contexts/ThemeContext.jsx` (theme system/light/dark, localStorage, toggles `.dark` on `<html>`, matchMedia listener) wrapped in `main.jsx`; anti-FOUC inline script in `index.html`; `components/ThemeToggle.jsx` in Profile → Appearance. The 3 inline-hex pages (BatchDetail/FarmDetail/FCRReport — warm-stone palette) converted hex→`var(--*)` (agent); Farms card bg → `var(--surface)/--surface-2)`. Accent colours (amber/green/red/blue, capacity/FCR bars, status pills) intentionally kept. **MOBILE: DONE.** `src/contexts/ThemeContext.js` exports `LIGHT`/`DARK` color tokens + `useTheme()` (`colors`,`isDark`,`mode`,`setMode`; `Appearance` for system + AsyncStorage persist), wrapped in `App.js`; `components/ThemeToggle.js` in ProfileScreen → Appearance. **Full screen sweep complete** (via ~18 agents in 7 batches): ALL 34 screens + 5 shared components (DatePicker/AttachmentUploader/AttachmentViewer/StockReturnModal/LanguageSwitcher) converted to the **`const makeStyles = (c) => StyleSheet.create({...})` + `const styles = useMemo(() => makeStyles(colors), [colors])`** pattern, neutral hex mapped by property to `c.bg/surface/surface2/text/textMuted/textFaint/border`, accents/status colours preserved. Module-level components handled either by moving inside the screen (stateless helpers) or giving each its OWN `useTheme`+`useMemo` (stateful modals/cards, to avoid remount-on-rerender). Themed global status bar via `expo-status-bar` `<StatusBar style={isDark?'light':'dark'}/>` in App.js + HomeScreen's per-screen `<StatusBar>` made theme-aware. Verified: all 40 styled files parse clean, every styled file is theme-aware, web build green. Note: a few intentional leaves (status→colour data objects like ROLE_META/STATUS_BG, the dark cash-in-hand card, native pickers) stay literal by design; the `ThemeToggle` keeps static layout styles + applies colours inline.

**Remaining blockers / next session task:**
- **⚠️ Supabase multi-project topology (verify before shipping the APK):** THREE projects are in play — `thekzwqdjlfssjshffto` = web **PRODUCTION** (`poultry-manager/.env.production`) **and** the `.mcp.json` / tooling target, so ALL this session's DB checks (org_id schema, "missing views", the views SQL) actually ran against **web PROD**; `khbuypzugydxvejjcoam` = web **local-dev** (`.env.local`); `meebbwdaxszoyarssutm` = mobile's original (matches old AGENT.md overview, now stale). **Decision (Session 28):** mobile repointed to `khbuypzugydxvejjcoam` (web local-dev) per user — updated `poultry-manager-mobile/.env` + `eas.json` (old `.env` backed up in session scratchpad). **NOT YET VERIFIED:** that `khbuypzugydxvejjcoam` has the app's schema (tables, `organization_id`, the 3 reporting views, `create_organization`/`accept_invitation` RPCs, RLS). The MCP is still pinned to PROD, so to audit khbuypzugydxvejjcoam: point `.mcp.json` `project_ref` at it + reconnect, then re-run the schema/views checks before trusting the APK.
- **Missing DB views (separate breakage) — FIX IN PROGRESS:** `vendor_balances`, `low_stock_alerts`, `batch_summary` **DO NOT EXIST** in the live DB, breaking `HomeScreen`, `VendorsScreen`, `PaymentsScreen`, `RecordPaymentScreen` (and likely web `Dashboard`/`Vendors`/`CashCollection`).
  - DONE: the 4 mobile screens now filter their view reads with `.eq('organization_id', orgId)`.
  - DONE: migration SQL authored (`recreate_org_scoped_reporting_views`) = the org-scoped view defs from `supabase_uat_migration.sql` (lines 639–682) + `WITH (security_invoker = on)` + `GRANT SELECT … TO anon, authenticated`. (The `batch_summary` def fixes the original `schema.sql` bug `JOIN farms ON f.id = b.id` → `b.farm_id`.)
  - PENDING: applying that migration is a **production DB change** — the auto classifier blocked the automated apply; awaiting explicit user authorization (or run it in the Supabase SQL Editor).
- Minor follow-ups: add `canRecordOperations` gating to the StockReturn "Return" button; `BatchReportScreen` chick-cost reads 0 when chick procurement lacks `batch_id` (pre-existing, rules #29/#30); optional deep-link `InviteAccept` handler (token-join already works via OrgSetup); fold the new Session-28 screens' English strings into `en.json`/`ml.json` (esp. Malayalam).

---

### Session 26 — Super Admin Panel + Audit Trail + Supplier Validation

**Completed:**

1. **RLS bootstrap fixes:**
   - `018_fix_rls_bootstrap.sql` — Added `org_insert` policy + fixed `ou_insert` to self-insert only
   - `019_create_org_function.sql` — `create_organization(p_name, p_user_id, ...)` SECURITY DEFINER function; both OrgSetup.jsx and Signup.jsx now use `supabase.rpc('create_organization', {...})` instead of two separate inserts
   - `020_fix_helper_functions.sql` — Fixed `get_user_organization_id()` and `get_user_role()` to use `current_setting('request.jwt.claims')` instead of `auth.uid()` (which returned NULL in SECURITY DEFINER context)
   - `super_admins` RLS fixed: `user_id = auth.uid()` self-select only (was circular)
   - After org creation: `window.location.href = '/dashboard'` (hard reload) instead of `refreshOrg()` to avoid stale session issues

2. **Audit trail (`021_audit_fields.sql`):**
   - Added `created_by_id`, `created_by_name`, `updated_by_id`, `updated_by_name`, `updated_at` to 12 tables
   - `src/components/AuditInfo.jsx` — clock icon tooltip showing created/updated by + timestamp; pops left to avoid table overflow
   - All inserts in: Procurement, Sales, Expenses, CashCollection, AccountsPage, Suppliers, SupplierDetail, FarmDetail, BatchDetail now include audit fields
   - All updates in: AccountsPage (accounts), BatchDetail (batches), FarmDetail (batches) include `updated_by_*`

3. **Supplier required validation:**
   - Procurement modal: validation error if no supplier selected
   - FarmDetail NewBatchModal: validation error if no supplier when purchase fields filled
   - Changed blank option from "No supplier / unknown" to "— select supplier —"
   - Procurement page: amber banner listing all purchases with no supplier_id

4. **Item catalog — data migration:**
   - Added 17 new items (Feed × 6, Medicine × 6, Vaccine × 5)
   - Fixed typos: Grover→Grower, Antibiotoc→Antibiotic, Vitamine→Vitamin, Vccine NDV→Vaccine NDV
   - Migrated all data to abc org (`e955f09e-eab3-4e6a-be9e-46a3c48e1360`)

5. **Super Admin Panel (`/admin-panel/`):**
   - Separate React + Vite + Tailwind app, dark theme
   - DB: `super_admins`, `plan_limits`, `admin_activity_log` tables + plan/service columns on `organizations`
   - 5 SECURITY DEFINER functions for admin operations
   - Pages: Login (access-denied guard), Dashboard (6 cards, plan distribution, activity feed), Organizations (filterable table, pagination), OrgDetail (full detail, change plan modal, suspend/cancel/reactivate modals, admin notes, users/farms/batches tables), ActivityLog (CSV export)
   - Both emails inserted as super admins: amalrajp7034@gmail.com, amalraj150@gmail.com
   - Supabase MCP connected as `supabase-poultry` for direct DB access

6. **Main app service status check:**
   - `AuthContext` checks `organization.service_status` on load
   - Suspended/cancelled → signs out + sets `serviceBlocked` state
   - `ProtectedRoute` shows blocking screen with support email

**Supabase MCP:** Connected via psql at `db.meebbwdaxszoyarssutm.supabase.co:5432`. Password in `.env.local`.

**Current blockers:**
- Admin panel not yet deployed to Vercel (run locally with `npm run dev` in `/admin-panel/`)
- Migrations 018–021 must be run in Supabase SQL Editor if not already done

**Next session task:**
- Deploy admin-panel to Vercel as a separate project, then test full flow: create org → login → admin panel shows it → change plan → suspend → verify main app blocks suspended users.

---

### Session 27 — i18n Multi-Language Support (English + Malayalam) — IN PROGRESS

**Objective:** Add Malayalam + English multi-language support to both web app and mobile app using i18next.

---

#### ✅ COMPLETED

**Infrastructure (both apps):**
- `npm install i18next react-i18next i18next-browser-languagedetector` — web
- `npm install i18next react-i18next` — mobile (AsyncStorage already present)
- `src/i18n/locales/en.json` — full English translation file (all keys)
- `src/i18n/locales/ml.json` — full Malayalam translation file (all keys)
- `src/i18n/index.js` — i18n config (web): uses LanguageDetector, localStorage key `poultry_language`, fallback `en`
- `src/utils/dateFormat.js` — `formatDate(date, language)` and `formatDateShort(date, language)` with Malayalam month names
- `src/components/LanguageSwitcher.jsx` — compact toggle (EN/മല) + full two-button version (🇬🇧 English / 🇮🇳 മലയാളം)
- `src/main.jsx` — `import './i18n/index.js'` added before App renders
- `index.html` — Noto Sans Malayalam + Inter fonts added, title updated
- `src/index.css` — `[lang="ml"]` CSS rule for Malayalam font + line-height
- Mobile: `src/i18n/index.js` — AsyncStorage-based language detector, same en/ml resources
- Mobile: `src/i18n/locales/en.json` + `ml.json` — copied from web
- Mobile: `index.js` — `import './src/i18n/index.js'` added

**Web pages with t() applied:**
- `src/pages/Login.jsx` ✅ — LanguageSwitcher compact top-right
- `src/pages/Signup.jsx` ✅
- `src/pages/OrgSetup.jsx` ✅
- `src/pages/OrgSelector.jsx` ✅
- `src/pages/InviteAccept.jsx` ✅
- `src/pages/Dashboard.jsx` ✅
- `src/components/Sidebar.jsx` ✅ — LanguageSwitcher compact in footer, uses labelKey pattern
- `src/pages/Profile.jsx` ✅ — full LanguageSwitcher embedded
- `src/pages/OrgSettings.jsx` ✅
- `src/pages/TeamSettings.jsx` ✅
- `src/pages/CatalogSettings.jsx` ✅
- `src/components/AuditInfo.jsx` ✅

**Translation key additions made during session (en.json + ml.json both updated):**
- `org.*` expanded: orgSettings, manageBusinessDetails, businessDetails, organisationName, tradingName, farmAddress, saveChanges, saving, savedSuccessfully, subscription, billingComingSoon, plan_label, dangerZone, deactivateOrg, deactivateWarning, typeToConfirm, orgNamePlaceholder, deactivating, deactivateButton, orgNameRequired, orgNameMismatch
- `profile.*` expanded: yourProfile, manageAccount, personalDetails, fullName, emailCannotChange, saveName, saving, nameUpdated, passwordChanged, organisation, yourRole, memberSince, language
- `audit.*` added: createdBy, updatedBy, unknown

---

#### ❌ NOT YET DONE — MUST COMPLETE NEXT SESSION

**Web pages still needing t() replacement:**
- `src/pages/Farms.jsx`
- `src/pages/FarmDetail.jsx` (large ~116KB)
- `src/pages/Batches.jsx`
- `src/pages/BatchDetail.jsx` (large ~77KB)
- `src/pages/Procurement.jsx`
- `src/pages/Stock.jsx`
- `src/pages/Sales.jsx`
- `src/pages/Vendors.jsx`
- `src/pages/CashCollection.jsx`
- `src/pages/Expenses.jsx`
- `src/components/StockReturnModal.jsx`
- `src/pages/Suppliers.jsx`
- `src/pages/SupplierDetail.jsx`
- `src/pages/GrowingFees.jsx` (large ~48KB)
- `src/pages/GrowingFeeSettings.jsx`
- `src/pages/AccountsPage.jsx` (large ~31KB)
- `src/pages/PLReport.jsx`
- `src/pages/FCRReport.jsx`
- `src/pages/BatchReport.jsx`

**Mobile screens still needing t() replacement (ALL 21 + 1 component):**
- `src/screens/LoginScreen.js`
- `src/screens/HomeScreen.js`
- `src/screens/MoreScreen.js`
- `src/screens/FarmsScreen.js`
- `src/screens/FarmDetailScreen.js`
- `src/screens/BatchesScreen.js`
- `src/screens/BatchDetailScreen.js`
- `src/screens/StockScreen.js`
- `src/screens/ProcurementScreen.js`
- `src/screens/CatalogScreen.js`
- `src/screens/SalesScreen.js`
- `src/screens/VendorsScreen.js`
- `src/screens/PaymentsScreen.js`
- `src/screens/RecordSaleScreen.js`
- `src/screens/RecordPaymentScreen.js`
- `src/screens/DistributeFeedScreen.js`
- `src/screens/ExpensesScreen.js`
- `src/screens/SuppliersScreen.js`
- `src/screens/SupplierDetailScreen.js`
- `src/screens/AccountsScreen.js`
- `src/screens/PLReportScreen.js`
- `src/components/DatePicker.js`
- Mobile `LanguageSwitcher.js` component — needs to be CREATED at `src/components/LanguageSwitcher.js`
- `MoreScreen.js` — add LanguageSwitcher in settings section

**Also still TODO:**
- `user_preferences` Supabase table (for cross-device language sync — optional, do last)

---

#### RULES FOR NEXT SESSION

**⚠️ TOKEN SAFETY — DO NOT LAUNCH MORE THAN 3-4 AGENTS IN PARALLEL**
- Last time 8 agents in parallel exhausted token quota
- Launch max 3 agents at a time, wait for completion, then next batch

**Pattern for every file:**
```jsx
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/dateFormat'; // web only
const { t, i18n } = useTranslation();
// Replace all hardcoded text with t('key')
// Replace date formatting with formatDate(x, i18n.language)
```

**Mobile pattern:**
```js
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// Replace Text content, Alert.alert() args, placeholders, navigation titles
```

**Next session start command:**
> "Continue Session 27 i18n — start with Batch B: Farms, Batches, Procurement, Stock (max 3 agents)"

---

### Session 25 — Multi-Organization Support & Role-Based Access Control

**Completed:**

1. **`supabase/migrations/017_multi_org.sql`** CREATED:
   - `organizations` table (name, business_name, phone, address, subscription_plan, is_active)
   - `organization_users` junction table (organization_id, user_id, role, is_active)
   - `invitations` table (organization_id, email, role, token, expires_at, accepted_at)
   - `ADD COLUMN organization_id` to all 23 existing tables
   - `get_user_organization_id()` and `get_user_role()` SECURITY DEFINER Postgres functions
   - `ENABLE ROW LEVEL SECURITY` + full RLS policies on every table
   - Comments for manual data migration steps (fill org_id on existing rows, then set NOT NULL)

2. **`src/contexts/AuthContext.jsx`** CREATED — replaces old `useAuth.js`:
   - Loads `organization_users` + `organizations` join on auth state change
   - Handles 0/1/many org cases (redirect to /setup, auto-select, sessionStorage choice)
   - Derives all permission booleans: canEdit, canDelete, canViewFinancials, canRecordOperations, canManageUsers
   - Exports `useAuth()`, `signOut()`, `selectOrganization(orgId)`, `refreshOrg()`

3. **`src/hooks/usePermissions.js`** CREATED — `can(action)` helper wrapping useAuth()

4. **New pages CREATED:**
   - `Signup.jsx` — signup form → create org → set owner role
   - `OrgSetup.jsx` — create new org OR join with invite token
   - `OrgSelector.jsx` — pick org when user belongs to multiple
   - `InviteAccept.jsx` — `/invite/:token` — validates token, accepts invite (existing or new user)
   - `TeamSettings.jsx` — `/settings/team` — member table, role changes, deactivate/reactivate, invite modal
   - `OrgSettings.jsx` — `/settings/organization` — edit org name/details, danger zone (deactivate org)
   - `Profile.jsx` — `/settings/profile` — edit full name, change password, view role/org

5. **`src/main.jsx`** UPDATED — wrapped app in `<AuthProvider>`

6. **`src/components/ProtectedRoute.jsx`** UPDATED — uses AuthContext; redirects to /setup when no org

7. **`src/components/Sidebar.jsx`** UPDATED — role-filtered nav (ALL_NAV with roles field), RoleBanner, org name in header

8. **`src/pages/Login.jsx`** UPDATED — added "Sign up" link to /signup

9. **`src/App.jsx`** UPDATED — new public routes (/signup, /setup, /select-org, /invite/:token), new settings routes (/settings/team, /settings/organization, /settings/profile)

10. **organization_id added to all page queries** (defense in depth on top of RLS):
    - Farms, Batches, Procurement, Stock, Vendors, Sales (Part 1 agent)
    - CashCollection, Expenses, Suppliers, SupplierDetail, AccountsPage, GrowingFees (Part 2 agent)
    - FarmDetail, BatchDetail (Part 3 agent — 5 sub-components updated)
    - Dashboard, PLReport, FCRReport, GrowingFeeSettings, CatalogSettings, BatchReport (Part 4 agent)
    - `stockHelpers.js`: addToStock + subtractFromStock now take `organizationId` parameter
    - `stockLedger.js`: ledgerIn, ledgerOut, getChickBalance, getAverageCostPerUnit now take `organizationId`
    - All call sites updated: Procurement.jsx, Batches.jsx, FarmDetail.jsx, StockReturnModal.jsx

11. **Permission gates added to all pages:**
    - Financial pages (AccountsPage, Expenses, CashCollection, GrowingFees, Suppliers, SupplierDetail): `canViewFinancials` guard + `canEdit` on action buttons
    - Settings pages: GrowingFeeSettings (owner only), CatalogSettings (canEdit only)
    - Operational pages (Farms, Batches, Stock, Vendors, Sales, Procurement): `canEdit`/`canDelete`/`canRecordOperations` gates on action buttons
    - FarmDetail: financial summary section gated by `canViewFinancials`; all action buttons role-gated
    - BatchDetail: financial P&L gated by `canViewFinancials`; distribution/sale/advance buttons role-gated

**Migration required:**
- Run `supabase/migrations/017_multi_org.sql` in Supabase SQL Editor
- Follow the commented steps to fill organization_id on existing rows before setting NOT NULL

**Current blockers:**
- Migrations 010–017 must be run in Supabase SQL Editor (in order)
- migration 017 requires manual data migration steps (commented in the SQL file)

**Next session task:**
- Run migration 017 in Supabase, complete the data migration steps, test multi-org signup/invite flow end-to-end, then push to GitHub and redeploy Vercel.

---

### Session 24 — Stock Return Feature

**Completed:**

1. **Migration `016_stock_returns.sql`** CREATED — new tables `stock_returns` and `farm_expense_returns`; added `returned_quantity NUMERIC DEFAULT 0` to `distributions`.

2. **`src/components/StockReturnModal.jsx`** CREATED — shared modal component used by both FarmDetail.jsx and BatchDetail.jsx:
   - Reads `farm_expenses` for this distribution to get `cost_per_unit`
   - Reads existing `stock_returns` to calculate `alreadyReturned` and validate max returnable
   - Condition toggle: Usable (return_to_stock=true) / Waste (return_to_stock=false)
   - On save: inserts `stock_returns` → conditionally inserts `stock_ledger IN` + updates `stock` table → inserts `farm_expense_returns` → updates `distributions.returned_quantity` → updates `farm_stock`
   - Summary card shows: returning qty, cost credit, net remaining at farm, stock impact

3. **`FarmDetail.jsx`** UPDATED:
   - Added `farmExpenseReturns` state; fetched from `farm_expense_returns WHERE farm_id = id`
   - `feedCost` and `medicineCost` are now net: gross farm_expenses − farm_expense_returns credit
   - `distCostMap`, `returnCostMap`, `netDistCostMap` computed for per-row display
   - Distributions tab: added Distributed, Returned (orange), Net Cost columns; Return button per row (hidden once fully returned)
   - `returnModal` state; StockReturnModal mounted at bottom of render

4. **`BatchDetail.jsx`** UPDATED:
   - Added `expenseReturns` state; fetched in `load()` and `refresh()` from `farm_expense_returns WHERE batch_id = batchId`
   - `feedCost` and `medCost` are now net of returns
   - `returnCostByDist` map for per-row net cost display
   - Distributions table: added Distributed, Returned, Net Cost, Return button columns
   - Post-close prompt: after `handleMarkAsSold` shows dialog "Any leftover stock to return?" with "No leftover stock" and "Go to Farm Page" buttons

5. **`PLReport.jsx`** UPDATED:
   - Added `farmExpReturns` state; fetched in `fetchReport()` alongside `farm_expenses`
   - `feedCost` and `medCost` useMemo now deduct `farm_expense_returns` credits for the period

**Migration required:**
- Run `supabase/migrations/016_stock_returns.sql` in Supabase SQL Editor

**Current blockers:**
- Migrations 010–016 must be run in Supabase SQL Editor (in order)
- GitHub remote URL may need fixing

**Next session task:**
- Run migration 016, test Stock Return flow (distribute → return → verify stock restored + cost credited in P&L), then push to GitHub.

---

### Session 23 — Weighted Average Cost Scoping + Floating Point Storage

**Completed:**

1. **Weighted average cost scoped to batch** — `getAverageCostPerUnit()` rewrtten with `{ batchId, startDate }` params; 3-tier lookup: batch_id → date ≥ start_date → global fallback. All call sites updated to pass startDate.

2. **Chick cost calculation fixed** — no longer proportional across all farms. Now: `procurement WHERE type='chicks' AND batch_id IN (farmBatchIds)`, direct sum. `allBatchesChickTotal` state removed from FarmDetail.jsx and FarmDetailScreen.js.

3. **Batch-before-procurement order fixed** — FarmDetail.jsx NewBatchModal and BatchesScreen.js now insert batch first, then procurement with `batch_id = batch.id`. Migration 013 backfills existing chick procurement by matching date.

4. **Procurement.jsx** — `cost_per_unit` computed by division now `roundCurrency(cost / qty)`. Auto-filled `cost` field now uses `String(roundCurrency(qty * cpu))` instead of `.toFixed(2)`.

5. **ProcurementScreen.js (mobile)** — `costPerUnit = cost / qty` now `roundCurrency(cost / qty)`.

6. **FarmDetail.jsx** — `totalCost = chickCount * pricePerChick` now `roundCurrency(...)`.

7. **BatchesScreen.js (mobile)** — `totalCost = chickCount * price` now `roundCurrency(...)`.

8. **BatchDetail.jsx** — growing fee ledger fields now all rounded: `totalFee = roundCurrency(rate * kg)`, `rawBalance`, `balanceDue`, `overpaid` all wrapped.

9. **GrowingFees.jsx** — FIFO payment distribution now rounds: `applied`, `remaining`, `newAmountPaid`, `newBalanceDue` all use `roundCurrency()`. Threshold changed from `<= 0.001` to `<= 0` for paid status.

10. **Dashboard.jsx** — `cashAndBank`, `stockValue`, `totalAssets`, `totalLiabilities`, `netWorth` all wrapped with `roundCurrency()`.

11. **Mobile `formatCurrency` display functions fixed** — added `maximumFractionDigits: 2` to: BatchDetailScreen.js, FarmDetailScreen.js, SalesScreen.js, PaymentsScreen.js, ProcurementScreen.js, ExpensesScreen.js, VendorsScreen.js, RecordPaymentScreen.js. Fixed two inline `toLocaleString` in SalesScreen.js and BatchesScreen.js.

12. **Migration `014_round_currency_fields.sql`** CREATED — rounds `procurement.cost_per_unit`, `procurement.cost`, all `growing_fee_ledger` currency fields, and `farm_expenses` fields (belt-and-suspenders over migration 012).

**Migrations required:**
- Run `supabase/migrations/013_link_chick_procurement_to_batch.sql`
- Run `supabase/migrations/014_round_currency_fields.sql`

**Next session task:**
- Run migrations 010/011/012/013/014 in Supabase SQL Editor, then verify all numbers display correctly.

---

### Session 22 — Floating Point Fix + Distribution Form Item Filter

**Completed:**

1. **Global currency formatting utilities** — Created `src/utils/format.js`:
   - `formatCurrency(value)` — ₹ + en-IN locale, always 2 decimal places (both min and max)
   - `formatCurrencyRound(value)` — ₹ + en-IN locale, no decimal places (for badges/pills)
   - `roundCurrency(value)` — round to 2dp using EPSILON trick (for intermediate calculations)
   - `formatFCR(value)` — `.toFixed(2)` (for FCR display)
   - All local per-page `fmt()` / `formatCurrency()` functions removed from every page
   - All pages updated: Dashboard, BatchDetail, GrowingFees, FarmDetail, Expenses, AccountsPage, CashCollection, Suppliers, SupplierDetail, Batches, Sales, Procurement, PLReport

2. **Floating point root cause fixed** — was missing `maximumFractionDigits: 2` in `toLocaleString()`. Now format.js enforces both `minimumFractionDigits: 2` and `maximumFractionDigits: 2`.

3. **Chick cost proportional calculation** — wrapped in `roundCurrency()` in FarmDetail.jsx and BatchDetail.jsx to prevent floating point drift.

4. **`is_distributable` column on `item_types`** — Migration `010_item_types_distributable.sql`:
   - `ALTER TABLE item_types ADD COLUMN is_distributable boolean NOT NULL DEFAULT true`
   - `UPDATE item_types SET is_distributable = false WHERE LOWER(name) LIKE '%chick%'`

5. **Distribution form item filter fixed** (web + mobile):
   - **`FarmDetail.jsx` DistributionModal**: Type dropdown fetches `item_types WHERE is_distributable = true`; Item dropdown fetches `items WHERE item_type_id = selectedTypeId AND is_active = true`; item selection resets when type changes; stock quantity shown by name-matching against stock prop
   - **`FarmDetailScreen.js`**: `openAddDist()` fetches item_types and first type's items; `handleDistTypeChange()` reloads items on type switch; modal uses `distItemTypes` chips and `distCatalogItems` chips instead of hardcoded types and stockItems
   - **`DistributeFeedScreen.js`**: Fetches `item_types WHERE is_distributable = true` on load; `catalogItems` filtered by `distributableTypeIds` set; type filter chips are dynamic from itemTypes (not hardcoded 'All'/'Feed'/'Medicine'); `typeFilter` is now a type UUID or '' (all)

6. **Floating point artifacts in feed cost calculations fixed** — `farm_expenses.cost_per_unit` and `total_cost` were storing irrational numbers (e.g., 202500/13 = 15576.923076...) due to missing `roundCurrency()` calls at calculation time:
   - **`src/lib/stockLedger.js`** `getAverageCostPerUnit()`: returns `roundCurrency(totalCost / totalQty)` (not raw division)
   - **`src/pages/FarmDetail.jsx`** DistributionModal: `total_cost: roundCurrency(qty * avgCpu)` before insert
   - **`src/screens/FarmDetailScreen.js`** `handleAddDist()`: `avgCpu = roundCurrency(totalProcCost / totalProcQty)` and `total_cost: roundCurrency(qty * avgCpu)`
   - **`src/screens/DistributeFeedScreen.js`**: same rounding applied at avgCpu division and total_cost multiplication
   - **`poultry-manager-mobile/src/utils/format.js`** CREATED with `roundCurrency()` function
   - **`supabase/migrations/012_round_farm_expenses.sql`** CREATED — cleans up existing unrounded rows in DB

7. **GrowingFees page improvements**: 6-card summary bar (Gross Fee, Advances Given, Post-close Paid, Total Paid, Balance Due, Farms count); 9-column farm group table including Advances column.

7. **Dashboard liabilities**: Added Growing Fees Payable to liabilities section; `totalLiabilities = supplierDues + growingFeePayable`; Net Worth breakdown shows Growing Fees Owed.

8. **BatchDetail cost breakdown**: Purple segment (`#c4b5fd`) for growing fee in stacked bar; growing fee row in breakdown table when > 0.

9. **FarmDetail UI cleanup**: Removed "Adv: ₹X active" badge from batch row growing fee cell; removed "Give Advance" button from batch row actions; Give Advance button in overview card hidden when `balance_due > 0`.

10. **P&L `sold_at` fix**: Growing fee ledger now filtered by batch `sold_at` (not `created_at`). Two-step query: fetch batch IDs with sold_at in period → query ledger by those batch IDs.

11. **vercel.json** added for SPA routing (committed locally; GitHub push pending — remote URL needs fixing).

12. **Weighted average cost scoping fixed** (Session 23):
    - `getAverageCostPerUnit()` now accepts `{ batchId, startDate }` — scopes to batch first, date range second, global last
    - `FarmDetail.jsx` DistributionModal passes `batchId` + `resolvedBatch.start_date`
    - `FarmDetailScreen.js` + `DistributeFeedScreen.js` inline cost calculation scoped to `date >= batchStartDate`

13. **Chick cost calculation fixed** (Session 23):
    - Was: `(farmChicks / allFarmsChicks) * allFarmsChickCost` — proportional across ALL farms, completely wrong multi-farm
    - Now: `procurement WHERE type='chicks' AND batch_id IN (farmBatchIds)` — direct sum of this farm's chick procurement
    - `allBatchesChickTotal` state removed from both FarmDetail.jsx and FarmDetailScreen.js

14. **NewBatchModal order fixed** (Session 23):
    - Was: insert procurement first (no batch_id), then insert batch — chick procurement could never be linked
    - Now: insert batch first → insert procurement with `batch_id = batch.id` → ledger entries
    - **`supabase/migrations/013_link_chick_procurement_to_batch.sql`** CREATED — backfills batch_id on existing chick procurement by matching `procurement.date = batches.start_date`

**Migrations required (run in this order):**
- `009_backfill_advance_transactions.sql` — if not already run
- `010_item_types_distributable.sql` — adds `is_distributable` column
- `011_remove_chicks_from_catalog.sql` — removes Chicks from item_types/items
- `012_round_farm_expenses.sql` — rounds farm_expenses fields
- `013_link_chick_procurement_to_batch.sql` — links chick procurement to batches
- `014_round_currency_fields.sql` — rounds procurement.cost_per_unit, growing_fee_ledger fields
- `015_procurement_type_text.sql` — changes procurement.type from ENUM to TEXT (fixes Vaccine enum error)

**Current blockers:**
- GitHub remote URL may need fixing (`chicken-45` repo not found at previous URL)
- Migrations 010–015 must be run in Supabase SQL Editor

**Next session task:**
- Run all pending migrations in Supabase, verify numbers display correctly and Vaccine procurement saves, then push to GitHub

---

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
