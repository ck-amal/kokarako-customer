import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import SubscriptionBanner from '../components/SubscriptionBanner'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GROW_OUT_DAYS = 45

function daysRemaining(startDate) {
  const start = new Date(startDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  return GROW_OUT_DAYS - Math.floor((today - start) / (1000 * 60 * 60 * 24))
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

function getRangeForPeriod(period) {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  let start
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    start = d.toISOString().slice(0, 10)
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  } else {
    start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  }
  return { start, end }
}

function buildTrend(points, period) {
  if (!points.length) return []
  const buckets = new Map()
  for (const p of points) {
    const d = new Date(p.date + 'T00:00:00')
    let key, sortKey
    if (period === 'week') {
      key = p.date
      sortKey = p.date
    } else if (period === 'month') {
      const w = Math.ceil(d.getDate() / 7)
      key = `Wk ${w}`
      sortKey = String(w).padStart(2, '0')
    } else {
      key = d.toLocaleDateString('en-IN', { month: 'short' })
      sortKey = String(d.getMonth()).padStart(2, '0')
    }
    if (!buckets.has(sortKey)) buckets.set(sortKey, { label: key, sum: 0, weight: 0 })
    const b = buckets.get(sortKey)
    b.sum    += p.rate * (p.weight || 1)
    b.weight += (p.weight || 1)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, b]) => ({ label: b.label, value: b.sum / b.weight }))
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({ points, color = '#f59e0b' }) {
  if (!points || points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-1">
        <span className="text-3xl">📭</span>
        <p className="text-sm">No data for this period</p>
      </div>
    )
  }
  if (points.length === 1) {
    return (
      <div className="flex items-center justify-center h-32 flex-col gap-1">
        <p className="text-2xl font-bold" style={{ color }}>
          ₹{Number(points[0].value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-gray-400">Only 1 data point — {points[0].label}</p>
      </div>
    )
  }

  const W = 480, H = 130, PX = 30, PY = 18
  const vals   = points.map(p => p.value)
  const minV   = Math.min(...vals)
  const maxV   = Math.max(...vals)
  const range  = maxV - minV || 1
  const innerW = W - 2 * PX
  const innerH = H - 2 * PY

  const toX = i => PX + (i / (points.length - 1)) * innerW
  const toY = v => H - PY - ((v - minV) / range) * innerH

  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ')
  const areaPoints = [
    `${toX(0)},${H - PY}`,
    ...points.map((p, i) => `${toX(i)},${toY(p.value)}`),
    `${toX(points.length - 1)},${H - PY}`,
  ].join(' ')

  return (
    <div className="select-none">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }}>
        <defs>
          <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Horizontal guide lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f}
            x1={PX} y1={PY + f * innerH} x2={W - PX} y2={PY + f * innerH}
            stroke="#f3f4f6" strokeWidth="1"
          />
        ))}
        {/* Area fill */}
        <polygon points={areaPoints} fill="url(#rateGrad)" />
        {/* Line */}
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots + value labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(p.value)} r="4" fill={color} stroke="white" strokeWidth="2" />
            {(points.length <= 8 || i === 0 || i === points.length - 1) && (
              <text
                x={toX(i)}
                y={toY(p.value) - 8}
                textAnchor="middle"
                fontSize="10"
                fill={color}
                fontWeight="600"
              >
                ₹{Number(p.value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </text>
            )}
          </g>
        ))}
      </svg>
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-400 mt-0.5" style={{ paddingLeft: PX, paddingRight: PX }}>
        {points.map((p, i) => (
          <span key={i} className={`truncate text-center ${points.length > 10 && i % 2 !== 0 ? 'invisible' : ''}`}
            style={{ minWidth: 0, flex: 1 }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Rate Detail Modal ────────────────────────────────────────────────────────

function RateDetailModal({ title, icon, unit, avg, trend, color, period, byItem, onClose }) {
  const PERIOD_LABEL = { week: 'Last 7 days', month: 'This month', year: 'This year' }
  const maxRate = byItem && byItem.length > 0 ? Math.max(...byItem.map(i => i.avgRate)) : 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <h2 className="text-base font-semibold text-gray-800">{title}</h2>
              <p className="text-xs text-gray-400">{PERIOD_LABEL[period]}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Average pill */}
        {avg != null && (
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: color + '12' }}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall Average</p>
            <p className="text-2xl font-bold ml-auto" style={{ color }}>
              ₹{Number(avg).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
            </p>
          </div>
        )}

        {/* Per-item breakdown */}
        {byItem && byItem.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">By Item</p>
            <div className="space-y-2 mb-5">
              {byItem.map(item => (
                <div key={item.name} className="flex items-center gap-3">
                  <p className="text-sm font-medium text-gray-700 w-36 shrink-0 truncate" title={item.name}>
                    {item.name}
                  </p>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(item.avgRate / maxRate) * 100}%`, background: color }}
                    />
                  </div>
                  <p className="text-sm font-bold shrink-0 w-20 text-right" style={{ color }}>
                    ₹{Number(item.avgRate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-400 shrink-0 w-16 text-right">
                    {item.count} buy{item.count > 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Trend label */}
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Overall trend
        </p>

        {/* Chart */}
        <LineChart points={trend} color={color} />
      </div>
    </div>
  )
}

// ─── Clickable Rate Card ──────────────────────────────────────────────────────

function RateCard({ title, icon, value, unit, sub, color, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:shadow-md hover:border-gray-200 transition group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-100 rounded-lg animate-pulse mt-1" />
          ) : (
            <p className="text-2xl font-bold mt-1 leading-none" style={{ color: value != null ? color : '#9ca3af' }}>
              {value != null ? `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
            </p>
          )}
          {!loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-3xl opacity-80">{icon}</span>
          <span className="text-xs text-gray-300 group-hover:text-gray-400 transition">tap for trend ↗</span>
        </div>
      </div>
    </button>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent, to, loading }) {
  const card = (
    <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 flex items-start justify-between gap-3 transition
      ${accent === 'red'    ? 'border-red-200'    : ''}
      ${accent === 'green'  ? 'border-green-200'  : ''}
      ${accent === 'amber'  ? 'border-amber-200'  : ''}
      ${accent === 'blue'   ? 'border-blue-200'   : ''}
      ${!accent             ? 'border-gray-100'   : ''}
      ${to ? 'hover:shadow-md cursor-pointer' : ''}
    `}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-8 w-24 bg-gray-100 rounded-lg animate-pulse mt-1" />
        ) : (
          <p className={`text-2xl font-bold mt-1 leading-none
            ${accent === 'red'   ? 'text-red-600'   : ''}
            ${accent === 'green' ? 'text-green-600' : ''}
            ${accent === 'amber' ? 'text-amber-600' : ''}
            ${accent === 'blue'  ? 'text-blue-600'  : ''}
            ${!accent            ? 'text-gray-800'  : ''}
          `}>{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
      <span className="text-3xl opacity-80 shrink-0">{icon}</span>
    </div>
  )

  return to ? <Link to={to}>{card}</Link> : card
}

// ─── Days remaining pill ──────────────────────────────────────────────────────

function DaysPill({ startDate }) {
  const days = daysRemaining(startDate)
  if (days < 0)  return <span className="text-xs font-semibold text-red-600">{Math.abs(days)}d overdue</span>
  if (days <= 5) return <span className="text-xs font-semibold text-orange-500">{days}d left</span>
  return <span className="text-xs font-semibold text-gray-600">{days}d left</span>
}

// ─── Recent activity row ──────────────────────────────────────────────────────

function ActivityRow({ type, label, sub, amount, date, positive }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm
        ${positive ? 'bg-green-100' : 'bg-red-50'}`}>
        {positive ? '💰' : '🧾'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{label}</p>
        <p className="text-xs text-gray-400">{sub} · {formatDate(date)}</p>
      </div>
      <span className={`text-sm font-bold shrink-0 ${positive ? 'text-green-600' : 'text-red-500'}`}>
        {positive ? '+' : '−'}{formatCurrency(amount)}
      </span>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { organization } = useAuth()
  const { t } = useTranslation()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [ratesPeriod, setRatesPeriod] = useState('month')
  const [ratesData,   setRatesData]   = useState(null)
  const [ratesLoading, setRatesLoading] = useState(true)
  const [rateModal,   setRateModal]   = useState(null) // null | 'chick' | 'feed' | 'kg'

  useEffect(() => {
    async function fetchAll() {
      const { start, end } = currentMonthRange()

      const [
        { data: batches },
        { data: vendorBals },
        { data: lowStock },
        { data: recentSales },
        { data: recentExpenses },
        { data: monthSales },
        { data: supplierProcs },
        { data: supplierPays },
        { data: accounts },
        { data: transactions },
        { data: stockItems },
        { data: soldFCRBatches },
        { data: gfLedger },
        { data: farms },
        { data: fixedAssetRows },
        { data: supplierOpenings },
      ] = await Promise.all([
        // Active batches (for count, chick total, table)
        supabase
          .from('batches')
          .select('id, start_date, chick_count, farms(name)')
          .eq('organization_id', organization?.id)
          .eq('status', 'active')
          .order('start_date', { ascending: false }),

        // Vendor outstanding balances
        supabase
          .from('vendor_balances')
          .select('outstanding_balance')
          .eq('organization_id', organization?.id),

        // Low stock items
        supabase
          .from('low_stock_alerts')
          .select('id')
          .eq('organization_id', organization?.id),

        // 5 most recent sales
        supabase
          .from('sales')
          .select('id, date, total_amount, contacts(name), batches(farms(name))')
          .eq('organization_id', organization?.id)
          .eq('status', 'confirmed')
          .order('date', { ascending: false })
          .limit(5),

        // 5 most recent expenses
        supabase
          .from('expenses')
          .select('id, date, amount, category, description')
          .eq('organization_id', organization?.id)
          .order('date', { ascending: false })
          .limit(5),

        // Revenue this month
        supabase
          .from('sales')
          .select('total_amount')
          .eq('organization_id', organization?.id)
          .eq('status', 'confirmed')
          .gte('date', start)
          .lte('date', end),

        // Supplier dues — total procurement cost with supplier_id
        supabase
          .from('procurement')
          .select('cost')
          .eq('organization_id', organization?.id)
          .not('supplier_id', 'is', null),

        // Supplier payments — total paid
        supabase
          .from('supplier_payments')
          .select('amount')
          .eq('organization_id', organization?.id),

        // Accounts (for cash/bank balance)
        supabase
          .from('accounts')
          .select('id, name, type, opening_balance')
          .eq('organization_id', organization?.id)
          .eq('is_active', true),

        // All transactions (for computing account balances)
        supabase
          .from('transactions')
          .select('account_id, transaction_type, amount')
          .eq('organization_id', organization?.id),

        // Stock (for stock value)
        supabase
          .from('stock')
          .select('quantity, avg_cost')
          .eq('organization_id', organization?.id),

        // Batches sold this month with FCR
        supabase
          .from('batches')
          .select('fcr, fcr_rating')
          .eq('organization_id', organization?.id)
          .eq('status', 'sold')
          .not('fcr', 'is', null)
          .gte('sold_at', start)
          .lte('sold_at', end),

        // Growing fee payables (pending/partial ledger entries)
        supabase
          .from('growing_fee_ledger')
          .select('balance_due')
          .eq('organization_id', organization?.id)
          .in('status', ['pending', 'partial']),

        // Total farm count
        supabase
          .from('farms')
          .select('id')
          .eq('organization_id', organization?.id),

        // Fixed assets
        supabase
          .from('fixed_assets')
          .select('purchase_value')
          .eq('organization_id', organization?.id),

        // Supplier opening balances
        supabase
          .from('contacts')
          .select('opening_balance')
          .eq('is_supplier', true)
          .eq('organization_id', organization?.id)
          .eq('is_active', true),
      ])

      const monthRevenue  = (monthSales || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
      const totalOutstanding = (vendorBals || [])
        .reduce((s, v) => s + Math.max(0, Number(v.outstanding_balance)), 0)
      const totalChicks = (batches || []).reduce((s, b) => s + Number(b.chick_count), 0)
      const supplierOpeningTotal = (supplierOpenings || []).reduce((s, r) => s + Number(r.opening_balance || 0), 0)
      const supplierDues = Math.max(0,
        supplierOpeningTotal +
        (supplierProcs || []).reduce((s, r) => s + Number(r.cost), 0) -
        (supplierPays  || []).reduce((s, r) => s + Number(r.amount), 0)
      )

      // Business Health calculations
      const txByAccount = {}
      for (const tx of (transactions || [])) {
        if (!txByAccount[tx.account_id]) txByAccount[tx.account_id] = { in: 0, out: 0 }
        if (tx.transaction_type === 'in')  txByAccount[tx.account_id].in  += Number(tx.amount)
        else                                txByAccount[tx.account_id].out += Number(tx.amount)
      }
      const cashAndBank = roundCurrency((accounts || []).reduce((s, a) => {
        const t = txByAccount[a.id] || { in: 0, out: 0 }
        return s + Number(a.opening_balance) + t.in - t.out
      }, 0))
      const stockValue = roundCurrency((stockItems || []).reduce((s, i) => s + roundCurrency(Number(i.quantity || 0) * Number(i.avg_cost || 0)), 0))
      const fixedAssetsTotal = roundCurrency((fixedAssetRows || []).reduce((s, r) => s + Number(r.purchase_value || 0), 0))
      const totalAssets = roundCurrency(cashAndBank + totalOutstanding + stockValue + fixedAssetsTotal)
      const growingFeePayable = roundCurrency((gfLedger || []).reduce((s, r) => s + Number(r.balance_due), 0))
      const totalLiabilities = roundCurrency(supplierDues + growingFeePayable)
      const netWorth = roundCurrency(totalAssets - totalLiabilities)

      const fcrList = (soldFCRBatches || []).map(b => Number(b.fcr))
      const avgFCR  = fcrList.length > 0 ? fcrList.reduce((s, f) => s + f, 0) / fcrList.length : null

      // Merge and sort recent transactions (sales + expenses) by date, take 5
      const txns = [
        ...(recentSales || []).map(s => ({
          id:       s.id,
          type:     'sale',
          label:    `Sale — ${s.contacts?.name ?? 'Vendor'}`,
          sub:      s.batches?.farms?.name ?? '—',
          amount:   s.total_amount,
          date:     s.date,
          positive: true,
        })),
        ...(recentExpenses || []).map(e => ({
          id:       e.id,
          type:     'expense',
          label:    e.description || `Expense — ${e.category}`,
          sub:      e.category,
          amount:   e.amount,
          date:     e.date,
          positive: false,
        })),
      ]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5)

      setData({
        batches:        batches || [],
        farmCount:      (farms || []).length,
        totalChicks,
        monthRevenue,
        totalOutstanding,
        lowStockCount:  (lowStock || []).length,
        supplierDues,
        growingFeePayable,
        totalLiabilities,
        txns,
        cashAndBank,
        stockValue,
        fixedAssetsTotal,
        totalAssets,
        netWorth,
        avgFCR,
        fcrCount: fcrList.length,
      })
      setLoading(false)
    }

    fetchAll()
  }, [organization])

  useEffect(() => {
    if (!organization?.id) return
    async function fetchRates() {
      setRatesLoading(true)
      const { start, end } = getRangeForPeriod(ratesPeriod)

      const [{ data: chicks }, { data: feed }, { data: kgSales }] = await Promise.all([
        supabase.from('procurement')
          .select('date, cost, quantity')
          .eq('organization_id', organization.id)
          .in('type', ['chick', 'chicks'])
          .gt('quantity', 0)
          .gte('date', start).lte('date', end)
          .order('date'),
        supabase.from('procurement')
          .select('date, cost, quantity, item_name')
          .eq('organization_id', organization.id)
          .eq('type', 'feed')
          .gt('quantity', 0)
          .gte('date', start).lte('date', end)
          .order('date'),
        supabase.from('sales')
          .select('date, price_per_kg, kg_sold')
          .eq('organization_id', organization.id)
          .eq('status', 'confirmed')
          .eq('sale_type', 'chicken')
          .gt('kg_sold', 0)
          .gte('date', start).lte('date', end)
          .order('date'),
      ])

      const chickRows = (chicks   || []).filter(r => Number(r.quantity) > 0)
      const feedRows  = (feed     || []).filter(r => Number(r.quantity) > 0)
      const kgRows    = (kgSales  || []).filter(r => Number(r.kg_sold)  > 0)

      const totalChickCost = chickRows.reduce((s, r) => s + Number(r.cost), 0)
      const totalChickQty  = chickRows.reduce((s, r) => s + Number(r.quantity), 0)
      const totalFeedCost  = feedRows.reduce((s, r) => s + Number(r.cost), 0)
      const totalFeedQty   = feedRows.reduce((s, r) => s + Number(r.quantity), 0)
      const totalKgValue   = kgRows.reduce((s, r) => s + Number(r.price_per_kg) * Number(r.kg_sold), 0)
      const totalKgSold    = kgRows.reduce((s, r) => s + Number(r.kg_sold), 0)

      const avgChick = totalChickQty > 0 ? totalChickCost / totalChickQty : null
      const avgFeed  = totalFeedQty  > 0 ? totalFeedCost  / totalFeedQty  : null
      const avgKg    = totalKgSold   > 0 ? totalKgValue   / totalKgSold   : null

      const chickTrend = buildTrend(
        chickRows.map(r => ({ date: r.date, rate: Number(r.cost) / Number(r.quantity), weight: Number(r.quantity) })),
        ratesPeriod
      )
      const feedTrend = buildTrend(
        feedRows.map(r => ({ date: r.date, rate: Number(r.cost) / Number(r.quantity), weight: Number(r.quantity) })),
        ratesPeriod
      )
      const kgTrend = buildTrend(
        kgRows.map(r => ({ date: r.date, rate: Number(r.price_per_kg), weight: Number(r.kg_sold) })),
        ratesPeriod
      )

      // Per-item breakdown for feed
      const feedItemMap = {}
      for (const r of feedRows) {
        const name = r.item_name || 'Unknown'
        if (!feedItemMap[name]) feedItemMap[name] = { cost: 0, qty: 0, count: 0 }
        feedItemMap[name].cost  += Number(r.cost)
        feedItemMap[name].qty   += Number(r.quantity)
        feedItemMap[name].count += 1
      }
      const feedByItem = Object.entries(feedItemMap)
        .map(([name, { cost, qty, count }]) => ({ name, avgRate: qty > 0 ? cost / qty : 0, count }))
        .sort((a, b) => b.avgRate - a.avgRate)

      setRatesData({ avgChick, avgFeed, avgKg, chickTrend, feedTrend, kgTrend, chickRows, feedRows, kgRows, feedByItem })
      setRatesLoading(false)
    }
    fetchRates()
  }, [organization, ratesPeriod])

  const monthName = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-8">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Subscription notice (ending soon / ended) */}
      <SubscriptionBanner />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Farms"
          value={loading ? '…' : data.farmCount}
          sub={loading ? '' : data.farmCount === 1 ? '1 active farm' : `${data.farmCount} active farms`}
          icon="🏡"
          to="/farms"
          loading={loading}
        />
        <StatCard
          label={t('dashboard.activeBatches')}
          value={loading ? '…' : data.batches.length}
          sub={loading ? '' : `${data.batches.length === 1 ? '1 farm' : `${data.batches.length} farms`} running`}
          icon="🐣"
          to="/batches"
          loading={loading}
        />
        <StatCard
          label="Total Chicks Alive"
          value={loading ? '…' : data.totalChicks.toLocaleString('en-IN')}
          sub="across active batches"
          icon="🐔"
          loading={loading}
        />
        <StatCard
          label={`${t('dashboard.revenueThisMonth')} — ${new Date().toLocaleString('en-IN', { month: 'short' })}`}
          value={loading ? '…' : formatCurrency(data.monthRevenue)}
          sub={monthName}
          icon="💰"
          accent="green"
          to="/sales"
          loading={loading}
        />
        <StatCard
          label={t('dashboard.outstandingPayments')}
          value={loading ? '…' : formatCurrency(data.totalOutstanding)}
          sub={loading || data.totalOutstanding === 0 ? 'All cleared' : 'owed by vendors'}
          icon="📋"
          accent={!loading && data.totalOutstanding > 0 ? 'red' : undefined}
          to="/cash-collection"
          loading={loading}
        />
        <StatCard
          label={t('dashboard.lowStockAlerts')}
          value={loading ? '…' : data.lowStockCount}
          sub={loading ? '' : data.lowStockCount === 0 ? 'All stocked up' : `item${data.lowStockCount > 1 ? 's' : ''} need restocking`}
          icon="📦"
          accent={!loading && data.lowStockCount > 0 ? 'amber' : undefined}
          to="/stock"
          loading={loading}
        />
        <StatCard
          label={t('dashboard.supplierDues')}
          value={loading ? '…' : formatCurrency(data.supplierDues)}
          sub={loading || data.supplierDues === 0 ? 'Nothing owed' : 'owed to suppliers'}
          icon="🏭"
          accent={!loading && data.supplierDues > 0 ? 'red' : undefined}
          to="/suppliers"
          loading={loading}
        />
        <StatCard
          label={`Avg FCR — ${new Date().toLocaleString('en-IN', { month: 'short' })}`}
          value={loading ? '…' : (data.avgFCR != null ? data.avgFCR.toFixed(2) : '—')}
          sub={loading ? '' : data.avgFCR != null
            ? `${data.fcrCount} sold batch${data.fcrCount > 1 ? 'es' : ''} · ${data.avgFCR <= 1.8 ? 'Excellent' : data.avgFCR <= 2.1 ? 'Good' : data.avgFCR <= 2.5 ? 'Average' : 'Poor'}`
            : 'No batches sold this month'}
          icon="🌾"
          accent={!loading && data.avgFCR != null ? (data.avgFCR <= 1.8 ? 'green' : data.avgFCR <= 2.1 ? 'blue' : data.avgFCR <= 2.5 ? 'amber' : 'red') : undefined}
          to="/reports/fcr"
          loading={loading}
        />
      </div>

      {/* Business Health */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">{t('dashboard.businessHealth')}</h2>
          <Link to="/accounts" className="text-xs text-amber-600 hover:underline font-medium">{t('dashboard.cashAndBank')} →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Assets */}
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm px-5 py-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">{t('dashboard.totalAssets')}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('dashboard.cashAndBank')}</span>
                <span className="font-semibold text-gray-800">{loading ? '…' : formatCurrency(data.cashAndBank)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('dashboard.vendorOutstanding')}</span>
                <span className="font-semibold text-gray-800">{loading ? '…' : formatCurrency(data.totalOutstanding)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('dashboard.stockValue')}</span>
                <span className="font-semibold text-gray-800">{loading ? '…' : formatCurrency(data.stockValue)}</span>
              </div>
              {(!loading && data.fixedAssetsTotal > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fixed Assets</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(data.fixedAssetsTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                <span className="font-semibold text-gray-700">{t('dashboard.totalAssets')}</span>
                <span className="font-bold text-green-700">{loading ? '…' : formatCurrency(data.totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* Liabilities */}
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm px-5 py-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">{t('dashboard.totalLiabilities')}</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('dashboard.supplierOutstanding')}</span>
                <span className="font-semibold text-gray-800">{loading ? '…' : formatCurrency(data.supplierDues)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('dashboard.growingFeesDue')}</span>
                <span className="font-semibold text-gray-800">{loading ? '…' : formatCurrency(data.growingFeePayable)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-gray-100 pt-2 mt-2">
                <span className="font-semibold text-gray-700">{t('dashboard.totalLiabilities')}</span>
                <span className="font-bold text-red-600">{loading ? '…' : formatCurrency(data.totalLiabilities)}</span>
              </div>
            </div>
          </div>

          {/* Net Worth */}
          <div className={`rounded-2xl border shadow-sm px-5 py-4 ${
            !loading && data.netWorth >= 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">{t('dashboard.netWorth')}</p>
            <p className={`text-3xl font-bold mt-1 ${loading ? 'text-gray-400' : data.netWorth >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
              {loading ? '…' : formatCurrency(data.netWorth)}
            </p>
            <p className="text-xs text-gray-500 mt-2">Assets − Liabilities</p>
            {!loading && (
              <div className="mt-3 pt-3 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-500">{t('dashboard.vendorOutstanding')}</p>
                  <p className="font-semibold text-gray-700">{formatCurrency(data.totalOutstanding)}</p>
                </div>
                <div>
                  <p className="text-gray-500">{t('dashboard.supplierDues')}</p>
                  <p className="font-semibold text-gray-700">{formatCurrency(data.supplierDues)}</p>
                </div>
                {data.growingFeePayable > 0 && (
                  <div className="col-span-2">
                    <p className="text-gray-500">{t('dashboard.growingFeeOutstanding')}</p>
                    <p className="font-semibold text-amber-700">{formatCurrency(data.growingFeePayable)}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Market Rates ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Market Rates</h2>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {['week', 'month', 'year'].map(p => (
              <button
                key={p}
                onClick={() => setRatesPeriod(p)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition capitalize ${
                  ratesPeriod === p ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RateCard
            title="Avg Chick Rate"
            icon="🐣"
            value={ratesData?.avgChick ?? null}
            unit="per chick"
            sub={ratesData && ratesData.chickRows.length > 0
              ? `${ratesData.chickRows.length} purchase${ratesData.chickRows.length > 1 ? 's' : ''} this ${ratesPeriod}`
              : 'No chick purchases'}
            color="#f59e0b"
            loading={ratesLoading}
            onClick={() => !ratesLoading && setRateModal('chick')}
          />
          <RateCard
            title="Avg Feed Rate"
            icon="🌾"
            value={ratesData?.avgFeed ?? null}
            unit="per bag"
            sub={ratesData && ratesData.feedRows.length > 0
              ? `${ratesData.feedRows.length} purchase${ratesData.feedRows.length > 1 ? 's' : ''} this ${ratesPeriod}`
              : 'No feed purchases'}
            color="#10b981"
            loading={ratesLoading}
            onClick={() => !ratesLoading && setRateModal('feed')}
          />
          <RateCard
            title="Avg Chicken Kg Rate"
            icon="⚖️"
            value={ratesData?.avgKg ?? null}
            unit="per kg"
            sub={ratesData && ratesData.kgRows.length > 0
              ? `${ratesData.kgRows.length} sale${ratesData.kgRows.length > 1 ? 's' : ''} this ${ratesPeriod}`
              : 'No confirmed sales'}
            color="#6366f1"
            loading={ratesLoading}
            onClick={() => !ratesLoading && setRateModal('kg')}
          />
        </div>
      </div>

      {/* Rate detail modal */}
      {rateModal === 'chick' && ratesData && (
        <RateDetailModal
          title="Avg Chick Rate"
          icon="🐣"
          unit="per chick"
          avg={ratesData.avgChick}
          trend={ratesData.chickTrend}
          color="#f59e0b"
          period={ratesPeriod}
          onClose={() => setRateModal(null)}
        />
      )}
      {rateModal === 'feed' && ratesData && (
        <RateDetailModal
          title="Avg Feed Rate"
          icon="🌾"
          unit="per bag"
          avg={ratesData.avgFeed}
          trend={ratesData.feedTrend}
          color="#10b981"
          period={ratesPeriod}
          byItem={ratesData.feedByItem}
          onClose={() => setRateModal(null)}
        />
      )}
      {rateModal === 'kg' && ratesData && (
        <RateDetailModal
          title="Avg Chicken Kg Rate"
          icon="⚖️"
          unit="per kg"
          avg={ratesData.avgKg}
          trend={ratesData.kgTrend}
          color="#6366f1"
          period={ratesPeriod}
          onClose={() => setRateModal(null)}
        />
      )}

      {/* Active batches table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">{t('dashboard.activeBatches')}</h2>
          <Link to="/batches" className="text-xs text-amber-600 hover:underline font-medium">{t('dashboard.viewAll')} →</Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
            </div>
          ) : data.batches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">🐣</span>
              <p className="text-sm">{t('batches.noBatches')}</p>
              <Link to="/batches" className="text-xs text-amber-500 hover:underline mt-1">Start a batch →</Link>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">{t('farms.title')}</th>
                  <th className="px-5 py-3">{t('batches.startDate')}</th>
                  <th className="px-5 py-3 text-right">{t('batches.chickCount')}</th>
                  <th className="px-5 py-3 text-center">Progress</th>
                  <th className="px-5 py-3 text-right">Days Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.batches.map(b => {
                  const elapsed  = GROW_OUT_DAYS - daysRemaining(b.start_date)
                  const pct      = Math.min(100, Math.max(0, Math.round((elapsed / GROW_OUT_DAYS) * 100)))
                  const isOver   = daysRemaining(b.start_date) < 0
                  const isNear   = daysRemaining(b.start_date) <= 5 && !isOver
                  return (
                    <tr key={b.id} className="hover:bg-amber-50/40 transition">
                      <td className="px-5 py-3.5 font-medium text-gray-800">{b.farms?.name ?? '—'}</td>
                      <td className="px-5 py-3.5 text-gray-500">{formatDate(b.start_date)}</td>
                      <td className="px-5 py-3.5 text-right text-gray-700">{Number(b.chick_count).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isOver ? 'bg-red-400' : isNear ? 'bg-orange-400' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right shrink-0">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DaysPill startDate={b.start_date} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">{t('dashboard.recentActivity')}</h2>
          <div className="flex gap-3">
            <Link to="/sales"    className="text-xs text-amber-600 hover:underline font-medium">{t('nav.sales')} →</Link>
            <Link to="/expenses" className="text-xs text-amber-600 hover:underline font-medium">{t('nav.expenses')} →</Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
            </div>
          ) : data.txns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">📊</span>
              <p className="text-sm">{t('dashboard.noActivity')}</p>
            </div>
          ) : (
            <div>
              {data.txns.map(tx => (
                <ActivityRow key={`${tx.type}-${tx.id}`} {...tx} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
