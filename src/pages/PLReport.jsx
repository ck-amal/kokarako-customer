import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function pct(part, whole) {
  if (!whole || whole === 0) return '0%'
  return ((part / whole) * 100).toFixed(1) + '%'
}

function monthRange(offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function quarterRange() {
  const now = new Date(); const q = Math.floor(now.getMonth() / 3)
  return {
    start: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10),
  }
}

const DATE_PRESETS = [
  { label: 'This Month',   fn: () => monthRange(0) },
  { label: 'Last Month',   fn: () => monthRange(-1) },
  { label: 'This Quarter', fn: quarterRange },
  { label: 'This Year',    fn: () => ({ start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` }) },
]

// ─── P&L Row ──────────────────────────────────────────────────────────────────

function PLRow({ label, amount, indent = false, bold = false, muted = false, detail, onExpand, expanded }) {
  return (
    <div>
      <div
        className={`flex items-center justify-between py-2.5 ${indent ? 'pl-6' : ''} ${detail ? 'cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2' : 'px-2 -mx-2'}`}
        onClick={detail ? onExpand : undefined}
      >
        <div className="flex items-center gap-1.5">
          {detail && (
            <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
          )}
          <span className={`text-sm ${bold ? 'font-bold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
            {label}
          </span>
        </div>
        <span className={`text-sm ${bold ? 'font-bold text-gray-900' : muted ? 'text-gray-400' : 'text-gray-700'} tabular-nums`}>
          {formatCurrency(amount)}
        </span>
      </div>
      {expanded && detail && detail.length > 0 && (
        <div className="ml-6 mb-2 border-l-2 border-gray-100 pl-3">
          {detail.map((d, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs text-gray-500">
              <span className="truncate max-w-[280px]">{d.label}</span>
              <span className="tabular-nums ml-4">{formatCurrency(d.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-gray-200 my-1" />
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, children, accent }) {
  const colors = {
    green:  'border-green-200 bg-green-50',
    red:    'border-red-200   bg-red-50',
    amber:  'border-amber-200 bg-amber-50',
    gray:   'border-gray-100  bg-white',
  }
  return (
    <div className={`rounded-2xl border px-5 py-4 ${colors[accent ?? 'gray']}`}>
      {title && <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{title}</p>}
      {children}
    </div>
  )
}

// ─── Visual bar ───────────────────────────────────────────────────────────────

function BarChart({ revenue, cogs, opex, net }) {
  const max = Math.max(revenue, cogs + opex, 1)
  const bars = [
    { label: 'Revenue',  value: revenue,   color: 'bg-green-400' },
    { label: 'COGS',     value: cogs,       color: 'bg-orange-400' },
    { label: 'Op. Exp',  value: opex,       color: 'bg-red-400' },
    { label: 'Net',      value: Math.abs(net), color: net >= 0 ? 'bg-green-600' : 'bg-red-600' },
  ]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Visual Summary</p>
      <div className="space-y-3">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16 shrink-0">{b.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div className={`h-full rounded-full ${b.color} transition-all duration-500`} style={{ width: `${Math.min(100, (b.value / max) * 100)}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-700 tabular-nums w-28 text-right">{formatCurrency(b.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PLReport() {
  const [farms,       setFarms]       = useState([])
  const [batches,     setBatches]     = useState([])
  const [loading,     setLoading]     = useState(false)
  const [activePreset, setActivePreset] = useState('Active Batches')
  const [dateRange,   setDateRange]   = useState(monthRange(0))
  const [farmFilter,  setFarmFilter]  = useState('')
  const [batchFilter, setBatchFilter] = useState('')

  // Raw data
  const [sales,           setSales]           = useState([])
  const [procurement,     setProcurement]     = useState([])
  const [farmExp,         setFarmExp]         = useState([])
  const [expenses,        setExpenses]        = useState([])
  const [fcrBatches,      setFcrBatches]      = useState([])
  const [growingFeeLedger,setGrowingFeeLedger]= useState([]) // full accrual — total_fee per closed batch

  // Expanded rows
  const [expanded,    setExpanded]    = useState({})

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    Promise.all([
      supabase.from('farms').select('id, name').order('name'),
      supabase.from('batches').select('start_date').eq('status', 'active').order('start_date', { ascending: true }).limit(1),
    ]).then(([{ data: farmsData }, { data: earliest }]) => {
      setFarms(farmsData || [])
      const start = earliest?.[0]?.start_date ?? monthRange(0).start
      setDateRange({ start, end: today })
    })
  }, [])

  useEffect(() => {
    if (!farmFilter) { setBatches([]); setBatchFilter(''); return }
    supabase.from('batches').select('id, start_date, status').eq('farm_id', farmFilter).order('start_date', { ascending: false })
      .then(({ data }) => setBatches(data || []))
    setBatchFilter('')
  }, [farmFilter])

  useEffect(() => {
    fetchReport()
  }, [dateRange, farmFilter, batchFilter])

  async function fetchReport() {
    setLoading(true)
    const { start, end } = dateRange

    // Build batch ID filter
    let batchIds = null
    if (batchFilter) {
      batchIds = [batchFilter]
    } else if (farmFilter) {
      const { data: fb } = await supabase.from('batches').select('id').eq('farm_id', farmFilter)
      batchIds = (fb || []).map(b => b.id)
    }

    const [{ data: s }, { data: p }, { data: fe }, { data: ex }, { data: soldBatchesInPeriod }] = await Promise.all([
      // Sales
      (() => {
        let q = supabase.from('sales').select('id, total_amount, date, batch_id, vendors(name)').gte('date', start).lte('date', end)
        if (batchIds) q = q.in('batch_id', batchIds)
        return q
      })(),
      // Procurement (chicks only for COGS)
      (() => {
        let q = supabase.from('procurement').select('id, item_name, cost, date, type').eq('type', 'chicks').gte('date', start).lte('date', end)
        return q
      })(),
      // Farm expenses (distributions)
      (() => {
        let q = supabase.from('farm_expenses').select('id, item_name, item_type, total_cost, date, batch_id, farm_id').gte('date', start).lte('date', end)
        if (batchIds) q = q.in('batch_id', batchIds)
        else if (farmFilter) q = q.eq('farm_id', farmFilter)
        return q
      })(),
      // Operating/direct expenses
      (() => {
        let q = supabase.from('expenses').select('id, category, amount, description, date, expense_category_type, batch_id').gte('date', start).lte('date', end)
        if (batchIds) q = q.in('batch_id', batchIds)
        return q
      })(),
      // Batches closed (sold) in this period — filter by sold_at for correct accrual period
      (() => {
        let q = supabase.from('batches').select('id').eq('status', 'sold').gte('sold_at', start).lte('sold_at', end)
        if (batchIds) q = q.in('id', batchIds)
        return q
      })(),
    ])

    // Fetch growing_fee_ledger for batches closed in this period (accrual: cost belongs to close date)
    const soldBatchIdsInPeriod = (soldBatchesInPeriod || []).map(b => b.id)
    let gfLedger = []
    if (soldBatchIdsInPeriod.length > 0) {
      const { data } = await supabase
        .from('growing_fee_ledger')
        .select('id, batch_id, farm_id, total_fee, total_advances, amount_paid, balance_due, fcr, fcr_tier_description, farms(name), batches(start_date)')
        .in('batch_id', soldBatchIdsInPeriod)
      gfLedger = data || []
    }

    // Fetch FCR data for batches in scope that have FCR computed
    let fcrQuery = supabase.from('batches')
      .select('id, start_date, status, fcr, fcr_rating, total_feed_kg, total_sale_kg, farms(name)')
      .not('fcr', 'is', null)
    if (batchIds) fcrQuery = fcrQuery.in('id', batchIds)
    else if (farmFilter) fcrQuery = fcrQuery.eq('farm_id', farmFilter)
    const { data: fcrData } = await fcrQuery

    setSales(s || [])
    setProcurement(p || [])
    setFarmExp(fe || [])
    setExpenses(ex || [])
    setGrowingFeeLedger(gfLedger)
    setFcrBatches(fcrData || [])
    setLoading(false)
  }

  // ─── Compute P&L ────────────────────────────────────────────────────────────

  const revenue = useMemo(() => sales.reduce((s, r) => s + Number(r.total_amount), 0), [sales])

  const chickCost   = useMemo(() => procurement.reduce((s, r) => s + Number(r.cost), 0), [procurement])
  const feedCost    = useMemo(() => farmExp.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost), 0), [farmExp])
  const medCost     = useMemo(() => farmExp.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0), [farmExp])
  const directExp   = useMemo(() => expenses.filter(e => e.expense_category_type === 'cogs').reduce((s, e) => s + Number(e.amount), 0), [expenses])
  const totalCOGS   = chickCost + feedCost + medCost + directExp

  const grossProfit = revenue - totalCOGS

  const opExpByCategory = useMemo(() => {
    const map = {}
    for (const e of expenses.filter(e => e.expense_category_type === 'operating' || !e.expense_category_type)) {
      map[e.category] = (map[e.category] || 0) + Number(e.amount)
    }
    return map
  }, [expenses])
  // Growing fee — accrual basis: full fee earned at batch close, regardless of payment status
  const totalGrowingFee        = useMemo(() => growingFeeLedger.reduce((s, r) => s + Number(r.total_fee      || 0), 0), [growingFeeLedger])
  const totalGrowingAdvances   = useMemo(() => growingFeeLedger.reduce((s, r) => s + Number(r.total_advances || 0), 0), [growingFeeLedger])
  const totalGrowingPostClose  = useMemo(() => growingFeeLedger.reduce((s, r) => s + Number(r.amount_paid    || 0), 0), [growingFeeLedger])
  const totalGrowingOutstanding= useMemo(() => growingFeeLedger.reduce((s, r) => s + Number(r.balance_due    || 0), 0), [growingFeeLedger])

  const totalOpEx = Object.values(opExpByCategory).reduce((s, v) => s + v, 0) + totalGrowingFee
  const netProfit   = grossProfit - totalOpEx

  function toggleExpanded(key) {
    setExpanded(p => ({ ...p, [key]: !p[key] }))
  }

  function applyPreset(p) {
    setActivePreset(p.label)
    setDateRange(p.fn())
  }

  async function applyActiveBatchesPreset() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('batches').select('start_date').eq('status', 'active').order('start_date', { ascending: true }).limit(1)
    const start = data?.[0]?.start_date ?? monthRange(0).start
    setActivePreset('Active Batches')
    setDateRange({ start, end: today })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">P&L Statement</h1>
          <p className="text-sm text-gray-500 mt-0.5">Profit & Loss for the selected period</p>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          🖨 Export / Print
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={applyActiveBatchesPreset}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${
              activePreset === 'Active Batches' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}>
            🐣 Active Batches
          </button>
          {DATE_PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${
                activePreset === p.label ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 text-xs">|</span>
          <input type="date" value={dateRange.start} onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={dateRange.end} onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
        </div>
        <div className="flex items-center gap-3">
          <select value={farmFilter} onChange={e => setFarmFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
            <option value="">All Farms</option>
            {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {farmFilter && batches.length > 0 && (
            <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm bg-white">
              <option value="">All Batches</option>
              {batches.map(b => <option key={b.id} value={b.id}>{fmtDate(b.start_date)} — {b.status}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">

          {/* Period label */}
          <p className="text-xs text-gray-400 font-medium">
            {fmtDate(dateRange.start)} — {fmtDate(dateRange.end)}
            {farmFilter && farms.find(f => f.id === farmFilter) ? ` · ${farms.find(f => f.id === farmFilter).name}` : ' · All Farms'}
          </p>

          {/* REVENUE */}
          <SectionCard title="Revenue">
            <PLRow label="Chicken Sales" amount={revenue}
              detail={sales.map(s => ({ label: `${fmtDate(s.date)} — ${s.vendors?.name ?? 'Vendor'}`, amount: s.total_amount }))}
              onExpand={() => toggleExpanded('sales')} expanded={expanded.sales} />
            <Divider />
            <PLRow label="Total Revenue" amount={revenue} bold />
          </SectionCard>

          {/* COGS */}
          <SectionCard title="Cost of Goods Sold (COGS)">
            <PLRow label="Chick Purchase Cost" amount={chickCost}
              detail={procurement.map(p => ({ label: `${fmtDate(p.date)} — ${p.item_name}`, amount: p.cost }))}
              onExpand={() => toggleExpanded('chicks')} expanded={expanded.chicks} />
            <PLRow label="Feed Cost" amount={feedCost}
              detail={farmExp.filter(r => r.item_type?.toLowerCase().includes('feed')).map(r => ({ label: `${fmtDate(r.date)} — ${r.item_name}`, amount: r.total_cost }))}
              onExpand={() => toggleExpanded('feed')} expanded={expanded.feed} />
            <PLRow label="Medicine Cost" amount={medCost}
              detail={farmExp.filter(r => r.item_type?.toLowerCase().includes('medicine')).map(r => ({ label: `${fmtDate(r.date)} — ${r.item_name}`, amount: r.total_cost }))}
              onExpand={() => toggleExpanded('medicine')} expanded={expanded.medicine} />
            <PLRow label="Direct Expenses" amount={directExp}
              detail={expenses.filter(e => e.expense_category_type === 'cogs').map(e => ({ label: `${fmtDate(e.date)} — ${e.description || e.category}`, amount: e.amount }))}
              onExpand={() => toggleExpanded('directExp')} expanded={expanded.directExp} />
            <Divider />
            <PLRow label="Total COGS" amount={totalCOGS} bold />
          </SectionCard>

          {/* GROSS PROFIT */}
          <div className={`rounded-2xl border-2 px-5 py-5 text-center ${grossProfit >= 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Gross Profit</p>
            <p className={`text-3xl font-bold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(Math.abs(grossProfit))}</p>
            <p className={`text-sm mt-1 font-medium ${grossProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {grossProfit >= 0 ? 'Gross Margin: ' : 'Gross Loss — Margin: '}{pct(Math.abs(grossProfit), revenue)}
            </p>
          </div>

          {/* OPERATING EXPENSES */}
          <SectionCard title="Operating Expenses">
            {Object.entries(opExpByCategory).length === 0 && totalGrowingFee === 0 ? (
              <p className="text-sm text-gray-400 py-2">No operating expenses in this period</p>
            ) : (
              <>
                {Object.entries(opExpByCategory).map(([cat, amt]) => (
                  <PLRow key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} amount={amt} indent
                    detail={expenses.filter(e => (e.expense_category_type === 'operating' || !e.expense_category_type) && e.category === cat)
                      .map(e => ({ label: `${fmtDate(e.date)} — ${e.description || cat}`, amount: e.amount }))}
                    onExpand={() => toggleExpanded(`opex_${cat}`)} expanded={expanded[`opex_${cat}`]} />
                ))}
                {totalGrowingFee > 0 && (
                  <PLRow
                    label="Growing Fees"
                    amount={totalGrowingFee}
                    indent
                    detail={[
                      // Per-batch breakdown
                      ...growingFeeLedger.map(r => ({
                        label: `${r.farms?.name ?? '—'} · Batch ${r.batches?.start_date ? fmtDate(r.batches.start_date + 'T12:00:00') : '—'} · FCR ${Number(r.fcr || 0).toFixed(2)}`,
                        amount: r.total_fee,
                      })),
                      // Payment status summary
                      ...(totalGrowingAdvances > 0 ? [{ label: '↳ Advances settled at close', amount: totalGrowingAdvances }] : []),
                      ...(totalGrowingPostClose > 0 ? [{ label: '↳ Post-close cash payments', amount: totalGrowingPostClose }] : []),
                      ...(totalGrowingOutstanding > 0 ? [{ label: '↳ Outstanding (still owed)', amount: totalGrowingOutstanding }] : []),
                    ]}
                    onExpand={() => toggleExpanded('growing_fees')}
                    expanded={expanded.growing_fees}
                  />
                )}
              </>
            )}
            <Divider />
            <PLRow label="Total Operating Expenses" amount={totalOpEx} bold />
          </SectionCard>

          {/* NET PROFIT */}
          <div className={`rounded-2xl border-2 px-5 py-6 text-center ${netProfit >= 0 ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
              {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
            </p>
            <p className={`text-4xl font-bold ${netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(Math.abs(netProfit))}</p>
            <p className={`text-sm mt-1 font-medium ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              Net Margin: {pct(Math.abs(netProfit), revenue)}
            </p>
          </div>

          {/* Visual summary */}
          <BarChart revenue={revenue} cogs={totalCOGS} opex={totalOpEx} net={netProfit} />

          {/* FCR section */}
          {fcrBatches.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Feed Conversion Ratio (FCR)</p>
              <div className="space-y-2">
                {fcrBatches.map((b, i) => {
                  const fcr = Number(b.fcr)
                  const color = fcr <= 1.8 ? '#15803d' : fcr <= 2.1 ? '#2563eb' : fcr <= 2.5 ? '#d97706' : '#dc2626'
                  const bg    = fcr <= 1.8 ? '#f0fdf4' : fcr <= 2.1 ? '#eff6ff' : fcr <= 2.5 ? '#fffbeb' : '#fef2f2'
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{b.farms?.name ?? '—'} · Batch {fmtDate(b.start_date)}</p>
                        <p className="text-xs text-gray-400">{Number(b.total_feed_kg || 0).toLocaleString('en-IN')} kg feed ÷ {Number(b.total_sale_kg || 0).toLocaleString('en-IN')} kg sold</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-extrabold" style={{ color }}>{fcr.toFixed(2)}</span>
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: bg, color }}>{b.fcr_rating}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
