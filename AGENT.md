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
| `farms`            | name, location, capacity | Base entity |
| `batches`          | farm_id, start_date, chick_count, status (active/sold/closed) | 45-day grow-out cycle |
| `vendors`          | name, phone, address | Buyers / traders |
| `procurement`      | type (chicks/feed/medicine/equipment/other), item_name, quantity, unit, cost, supplier, date | Auto-syncs to stock (except chicks) |
| `stock`            | item_name, quantity, unit, reorder_level | Upserted on procurement; deducted on distribution |
| `sales`            | batch_id, vendor_id, kg_sold, price_per_kg, total_amount (generated), date | total_amount is a generated column |
| `expenses`         | batch_id (optional), category, amount, description, date | Optional batch link for P&L |
| `cash_collection`  | vendor_id, sale_id, amount_paid, date, balance_due, notes | Per-sale partial payment tracking |

### Views

| View                | Purpose |
|---------------------|---------|
| `vendor_balances`   | total_sales − total_collected = outstanding_balance per vendor |
| `batch_summary`     | Per-batch P&L (revenue − procurement − expenses) |
| `low_stock_alerts`  | Items at or below reorder level |

Schema file: `supabase/schema.sql`

---

## Key Business Rules

1. **Batch duration** — A batch is exactly **45 days**. Days remaining = 45 − days elapsed since `start_date`. Goes red ("X days overdue") past day 45.
2. **Stock auto-sync** — Recording a procurement entry automatically adds to `stock` (matched by `item_name`, case-insensitive). `chicks` type is excluded from stock.
3. **Feed distribution** — Distributing feed subtracts from stock via `subtractFromStock()` in `src/lib/stockHelpers.js`. Quantity clamps at 0, never goes negative.
4. **P&L per batch** — Net profit = revenue (sales) − procurement cost − expenses, all linked by `batch_id`.
5. **Cash collection** — Tracks per-sale partial payments. Outstanding = total sale value − sum of payments recorded.
6. **Delete protection** — FK constraints block deleting a farm with batches, a vendor with sales, etc.

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
    ├── Procurement.jsx
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
