import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}
function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysElapsed(startDate) {
  return Math.floor((Date.now() - new Date(startDate + 'T00:00:00')) / 86400000)
}

// ─── Day status badge ──────────────────────────────────────────────────────────

function DayBadge({ elapsed, status }) {
  if (status !== 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold bg-gray-100 text-gray-500">
        Day {elapsed}
      </span>
    )
  }
  const isOverdue     = elapsed > 45
  const isApproaching = elapsed >= 40 && elapsed <= 45
  const bg    = isOverdue ? '#fef2f2' : isApproaching ? '#fffbeb' : '#f0fdf4'
  const color = isOverdue ? '#dc2626' : isApproaching ? '#d97706' : '#15803d'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-base font-extrabold"
      style={{ backgroundColor: bg, color }}>
      {isOverdue     && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />}
      {isApproaching && '⚠️ '}
      Day {elapsed}
    </span>
  )
}

// ─── Stacked bar ──────────────────────────────────────────────────────────────

function StackedBar({ segments }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {segments.map((seg, i) => (
        <div key={i} style={{
          width: ready ? `${seg.pct}%` : '0%',
          backgroundColor: seg.color,
          flexShrink: 0,
          transition: `width 600ms cubic-bezier(0.4,0,0.2,1) ${i * 60}ms`,
        }} />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BatchDetail() {
  const { farmId, batchId } = useParams()
  const navigate = useNavigate()

  const [farm,         setFarm]         = useState(null)
  const [batch,        setBatch]        = useState(null)
  const [distributions,setDistributions]= useState([])
  const [sales,        setSales]        = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [chickProc,    setChickProc]    = useState([])
  const [allBatchTotal,setAllBatchTotal]= useState(0)
  const [vendors,      setVendors]      = useState([])
  const [loading,      setLoading]      = useState(true)

  // ── Action state ──
  const [saving,         setSaving]         = useState(false)
  const [actionError,    setActionError]    = useState('')
  const [editModal,      setEditModal]      = useState(false)
  const [editForm,       setEditForm]       = useState({ chick_count: '', start_date: '' })
  const [mortalityModal, setMortalityModal] = useState(false)
  const [mortalityVal,   setMortalityVal]   = useState('')
  const [saleModal,      setSaleModal]      = useState(false)
  const [saleForm,       setSaleForm]       = useState({ vendor_id: '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) })
  const [confirmModal,   setConfirmModal]   = useState(null) // { label, newStatus }

  async function load() {
    const [
      { data: farmData },
      { data: batchData },
      { data: distData },
      { data: salesData },
      { data: expData },
      { data: chickProcData },
      { data: allBatchData },
      { data: vendorData },
    ] = await Promise.all([
      supabase.from('farms').select('id, name').eq('id', farmId).single(),
      supabase.from('batches').select('*').eq('id', batchId).single(),
      supabase.from('distributions').select('*').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('sales').select('*, vendors(name)').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('farm_expenses').select('*').eq('batch_id', batchId),
      supabase.from('procurement').select('cost, quantity').eq('type', 'chicks'),
      supabase.from('batches').select('chick_count'),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    setFarm(farmData)
    setBatch(batchData)
    setDistributions(distData || [])
    setSales(salesData || [])
    setExpenses(expData || [])
    setChickProc(chickProcData || [])
    setAllBatchTotal((allBatchData || []).reduce((s, b) => s + Number(b.chick_count || 0), 0))
    setVendors(vendorData || [])
    setLoading(false)
  }

  async function refresh() {
    const [{ data: batchData }, { data: distData }, { data: salesData }, { data: expData }] = await Promise.all([
      supabase.from('batches').select('*').eq('id', batchId).single(),
      supabase.from('distributions').select('*').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('sales').select('*, vendors(name)').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('farm_expenses').select('*').eq('batch_id', batchId),
    ])
    setBatch(batchData)
    setDistributions(distData || [])
    setSales(salesData || [])
    setExpenses(expData || [])
  }

  useEffect(() => { load() }, [farmId, batchId])

  async function handleEditBatch(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('batches').update({
      chick_count: Number(editForm.chick_count),
      start_date:  editForm.start_date,
    }).eq('id', batchId)
    setSaving(false)
    if (error) { setActionError(error.message); return }
    setEditModal(false)
    refresh()
  }

  async function handleMortality(e) {
    e.preventDefault()
    const n = Number(mortalityVal)
    if (isNaN(n) || n < 0) { setActionError('Enter a valid number (0 or more)'); return }
    setSaving(true)
    const { error } = await supabase.from('batches').update({ mortality_count: n }).eq('id', batchId)
    setSaving(false)
    if (error) { setActionError(error.message); return }
    setMortalityModal(false)
    refresh()
  }

  function promptMarkStatus(newStatus) {
    if (newStatus !== 'active' && sales.length === 0) {
      setActionError(`Cannot mark as ${newStatus} — record at least one sale first.`)
      return
    }
    const label = newStatus === 'active' ? 'Reactivate' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
    setActionError('')
    setConfirmModal({ label, newStatus })
  }

  async function handleMarkStatus() {
    if (!confirmModal) return
    setSaving(true)
    const today  = new Date().toISOString().slice(0, 10)
    const update = { status: confirmModal.newStatus }
    if (confirmModal.newStatus === 'sold')   update.sold_at   = today
    if (confirmModal.newStatus === 'closed') update.closed_at = today
    const { error } = await supabase.from('batches').update(update).eq('id', batchId)
    setSaving(false)
    setConfirmModal(null)
    if (error) { setActionError(error.message); return }
    refresh()
  }

  async function handleSale(e) {
    e.preventDefault()
    const kg    = parseFloat(saleForm.kg_sold)
    const price = parseFloat(saleForm.price_per_kg)
    setSaving(true)
    const { error } = await supabase.from('sales').insert({
      batch_id:     batchId,
      vendor_id:    saleForm.vendor_id,
      kg_sold:      kg,
      price_per_kg: price,
      date:         saleForm.date,
    })
    setSaving(false)
    if (error) { setActionError(error.message); return }
    setSaleModal(false)
    setSaleForm({ vendor_id: vendors[0]?.id || '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) })
    refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!batch || !farm) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-5xl mb-3">🐔</p>
        <p className="font-medium text-gray-600">Batch not found</p>
        <button onClick={() => navigate(-1)} className="text-amber-600 hover:underline text-sm mt-3 inline-block">← Back</button>
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const elapsed       = daysElapsed(batch.start_date)
  const daysToHarvest = 45 - elapsed
  const isActive      = batch.status === 'active'
  const isOverdue     = isActive && elapsed > 45
  const isApproaching = isActive && elapsed >= 40 && elapsed <= 45
  const alive         = Number(batch.chick_count || 0) - Number(batch.mortality_count || 0)

  // Financial
  const revenue   = sales.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const feedCost  = expenses.filter(e => e.item_type === 'feed').reduce((s, e) => s + Number(e.total_cost || 0), 0)
  const medCost   = expenses.filter(e => e.item_type === 'medicine').reduce((s, e) => s + Number(e.total_cost || 0), 0)

  const totalChickCostAll = chickProc.reduce((s, p) => s + Number(p.cost || 0), 0)
  const chickCost = allBatchTotal > 0
    ? (Number(batch.chick_count) / allBatchTotal) * totalChickCostAll
    : 0

  const totalExpenses = chickCost + feedCost + medCost
  const profit        = revenue - totalExpenses
  const margin        = revenue > 0 ? (profit / revenue) * 100 : 0

  // Feed & medicine summaries from distributions
  const feedBags = distributions.filter(d => d.type === 'feed').reduce((s, d) => s + Number(d.quantity || 0), 0)
  const medQty   = distributions.filter(d => d.type === 'medicine').reduce((s, d) => s + Number(d.quantity || 0), 0)

  // Timeline events (sorted oldest → newest)
  const timelineEvents = [
    { date: batch.start_date, icon: '🐣', label: `Batch started — ${Number(batch.chick_count).toLocaleString('en-IN')} chicks`, color: '#fef9c3', border: '#fde047' },
    ...distributions.map(d => ({
      date:   d.date,
      icon:   d.type === 'feed' ? '🌾' : '💊',
      label:  `${d.item_name} — ${Number(d.quantity).toLocaleString('en-IN')} ${d.unit}`,
      color:  '#dbeafe',
      border: '#93c5fd',
    })),
    ...sales.map(s => ({
      date:   s.date,
      icon:   '💰',
      label:  `Sale to ${s.vendors?.name ?? '—'} — ${fmt(s.total_amount)}`,
      color:  '#dcfce7',
      border: '#86efac',
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <>
    <div className="space-y-5 max-w-[900px] mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/farms" className="hover:text-amber-600 transition">Farms</Link>
        <span>/</span>
        <Link to={`/farms/${farmId}`} className="hover:text-amber-600 transition">{farm.name}</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Batch {fmtDate(batch.start_date)}</span>
      </div>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-2xl border shadow-sm p-6">
        {/* Overdue / approaching banner */}
        {isOverdue && (
          <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2"
            style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            <span className="text-sm font-bold text-red-700">Overdue by {Math.abs(daysToHarvest)} days — harvest immediately</span>
          </div>
        )}
        {isApproaching && (
          <div className="mb-4 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#fffbeb', borderLeft: '4px solid #d97706' }}>
            <span className="text-sm font-bold text-amber-700">⚠️ Approaching harvest — {daysToHarvest} day{daysToHarvest !== 1 ? 's' : ''} remaining</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p style={{ color: '#78716c' }} className="text-sm font-medium mb-1">{farm.name}</p>
            <h1 style={{ color: '#1c1917' }} className="text-2xl font-extrabold">
              Batch — {fmtDate(batch.start_date)}
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <DayBadge elapsed={elapsed} status={batch.status} />
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold
                ${batch.status === 'active' ? 'bg-green-100 text-green-700' :
                  batch.status === 'sold'   ? 'bg-blue-100 text-blue-700'   : 'bg-gray-100 text-gray-600'}`}>
                {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/farms/${farmId}`)}
            style={{ borderColor: '#e7e5e0', color: '#78716c' }}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-stone-50 transition"
          >
            ← Back to Farm
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mt-4 pt-4" style={{ borderTop: '1px solid #e7e5e0' }}>
          {isActive ? (
            <>
              <button
                onClick={() => { setEditForm({ chick_count: String(batch.chick_count), start_date: batch.start_date }); setActionError(''); setEditModal(true) }}
                style={{ borderColor: '#d1d5db', color: '#374151' }}
                className="rounded-lg border bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold transition"
              >
                ✏️ Edit Batch
              </button>
              <button
                onClick={() => { setMortalityVal(String(batch.mortality_count || 0)); setActionError(''); setMortalityModal(true) }}
                style={{ borderColor: '#fecaca', color: '#dc2626', backgroundColor: '#fef2f2' }}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:opacity-80 transition"
              >
                💀 Set Mortality
              </button>
              <button
                onClick={() => promptMarkStatus('sold')}
                disabled={saving}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
              >
                ✅ Mark as Sold
              </button>
              <button
                onClick={() => promptMarkStatus('closed')}
                disabled={saving}
                className="rounded-lg bg-gray-500 hover:bg-gray-600 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
              >
                🔒 Mark as Closed
              </button>
            </>
          ) : (
            <button
              onClick={() => promptMarkStatus('active')}
              disabled={saving}
              className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              ♻️ Reactivate Batch
            </button>
          )}
        </div>
        {actionError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
        )}
      </div>

      {/* ── Overview cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Chick Count',     value: Number(batch.chick_count).toLocaleString('en-IN'),   bg: '#f0fdf4', color: '#15803d' },
          { label: 'Alive',           value: alive.toLocaleString('en-IN'),                       bg: '#f0fdf4', color: '#15803d' },
          { label: 'Days Elapsed',    value: `Day ${elapsed}`,                                    bg: isOverdue ? '#fef2f2' : isApproaching ? '#fffbeb' : '#fafaf5', color: isOverdue ? '#dc2626' : isApproaching ? '#d97706' : '#1c1917' },
          { label: isActive ? 'Days to Harvest' : 'Total Days', value: isActive ? (daysToHarvest < 0 ? `${Math.abs(daysToHarvest)}d overdue` : `${daysToHarvest}d`) : `${elapsed}d`, bg: '#fafaf5', color: '#78716c' },
          { label: 'Mortality',       value: Number(batch.mortality_count || 0).toLocaleString('en-IN'), bg: '#fef2f2', color: '#dc2626' },
          { label: 'Distributions',   value: distributions.length,                               bg: '#fafaf5', color: '#78716c' },
        ].map(card => (
          <div key={card.label}
            style={{ backgroundColor: card.bg, borderColor: '#e7e5e0' }}
            className="rounded-xl border p-4 text-center">
            <p style={{ color: card.color }} className="text-2xl font-extrabold">{card.value}</p>
            <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Financial summary ─────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
        <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold mb-4">Financial Summary</h3>

        <div style={{ height: 20, backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
          {revenue > 0 ? (
            <StackedBar segments={[
              { pct: Math.min((chickCost / revenue) * 100, 100), color: '#fca5a5' },
              { pct: Math.min((feedCost  / revenue) * 100, 100), color: '#fdba74' },
              { pct: Math.min((medCost   / revenue) * 100, 100), color: '#fde047' },
              ...(profit > 0 ? [{ pct: Math.min((profit / revenue) * 100, 100), color: '#15803d' }] : []),
            ]} />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: '#78716c' }}>
          {[
            { color: '#fca5a5', label: 'Chick Cost' },
            { color: '#fdba74', label: 'Feed Cost' },
            { color: '#fde047', label: 'Medicine' },
            ...(profit > 0 ? [{ color: '#15803d', label: 'Profit' }] : []),
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>

        <div>
          {[
            { label: 'Revenue',        value: fmt(revenue),                                     color: '#15803d', bold: false },
            { label: 'Chick Cost',     value: fmt(chickCost),                                  color: '#dc2626', bold: false },
            { label: 'Feed Cost',      value: fmt(feedCost),                                   color: '#dc2626', bold: false },
            { label: 'Medicine Cost',  value: fmt(medCost),                                    color: '#dc2626', bold: false },
            { label: 'Total Expenses', value: fmt(totalExpenses),                              color: '#dc2626', bold: true },
            { label: 'Gross Profit',   value: (profit < 0 ? '−' : '') + fmt(Math.abs(profit)), color: profit >= 0 ? '#15803d' : '#dc2626', bold: true },
            { label: 'Profit Margin',  value: `${margin.toFixed(1)}%`,                         color: margin >= 0 ? '#15803d' : '#dc2626', bold: false },
          ].map((row, i) => (
            <div key={row.label}
              className="flex justify-between items-center py-2"
              style={{ borderBottom: i < 6 ? '1px solid #f5f5f4' : 'none' }}>
              <span style={{ color: '#78716c', fontWeight: row.bold ? 600 : 400 }} className="text-sm">{row.label}</span>
              <span style={{ color: row.color, fontWeight: row.bold ? 800 : 600 }} className="text-sm">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Distributions ─────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e7e5e0' }}>
          <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">
            Distributions ({distributions.length})
          </h3>
          <Link
            to={`/distribute?batchId=${batchId}&farmId=${farmId}`}
            className="rounded-lg bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition"
          >
            + Record
          </Link>
        </div>
        {distributions.length === 0 ? (
          <p style={{ color: '#78716c' }} className="text-sm text-center py-8">No distributions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr style={{ backgroundColor: '#fafaf5', borderBottom: '1px solid #e7e5e0', color: '#78716c' }}
                  className="text-left text-xs font-semibold uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {distributions.map((d, i) => (
                  <tr key={d.id}
                    style={{ borderBottom: i < distributions.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                    <td className="px-5 py-3" style={{ color: '#78716c' }}>{fmtDate(d.date)}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: '#1c1917' }}>{d.item_name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
                        ${d.type === 'feed' ? 'bg-green-100 text-green-700' : d.type === 'medicine' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {d.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: '#78716c' }}>
                      {Number(d.quantity).toLocaleString('en-IN')} {d.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sales ────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#e7e5e0' }}>
          <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">
            Sales ({sales.length})
          </h3>
          <button
            onClick={() => { setSaleForm({ vendor_id: vendors[0]?.id || '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) }); setActionError(''); setSaleModal(true) }}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
          >
            + Record Sale
          </button>
        </div>
        {sales.length === 0 ? (
          <p style={{ color: '#78716c' }} className="text-sm text-center py-8">No sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr style={{ color: '#78716c', backgroundColor: '#fafaf5', borderBottom: '1px solid #e7e5e0' }}
                  className="text-left text-xs font-semibold uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3 text-right">Kg Sold</th>
                  <th className="px-5 py-3 text-right">Price/kg</th>
                  <th className="px-5 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={s.id}
                    style={{ borderBottom: i < sales.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                    <td className="px-5 py-3" style={{ color: '#78716c' }}>{fmtDate(s.date)}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: '#1c1917' }}>{s.vendors?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right" style={{ color: '#78716c' }}>{Number(s.kg_sold).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right" style={{ color: '#78716c' }}>₹{Number(s.price_per_kg).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right font-bold" style={{ color: '#15803d' }}>{fmt(s.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e7e5e0', backgroundColor: '#fafaf5' }}>
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right" style={{ color: '#78716c' }}>Total Revenue</td>
                  <td className="px-5 py-3 text-right font-extrabold" style={{ color: '#15803d' }}>{fmt(revenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
        <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold mb-5">Timeline</h3>
        {timelineEvents.length === 0 ? (
          <p style={{ color: '#78716c' }} className="text-sm text-center py-4">No events yet.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-0.5" style={{ backgroundColor: '#e7e5e0' }} />
            <div className="space-y-4">
              {timelineEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base z-10"
                    style={{ backgroundColor: ev.color, border: `2px solid ${ev.border}` }}
                  >
                    {ev.icon}
                  </div>
                  <div className="flex-1 pt-1.5">
                    <p style={{ color: '#1c1917' }} className="text-sm font-medium">{ev.label}</p>
                    <p style={{ color: '#78716c' }} className="text-xs mt-0.5">{fmtDate(ev.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>

    {/* ── Edit Batch Modal ──────────────────────────────────────────────── */}
    {editModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Edit Batch</h2>
            <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={handleEditBatch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input required type="date" value={editForm.start_date}
                onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chick Count *</label>
              <input required type="number" min="1" value={editForm.chick_count}
                onChange={e => setEditForm(p => ({ ...p, chick_count: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* ── Mortality Modal ───────────────────────────────────────────────── */}
    {mortalityModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Set Mortality Count</h2>
            <button onClick={() => setMortalityModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={handleMortality} className="space-y-4">
            <p className="text-sm text-gray-500">Total number of birds that have died in this batch.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mortality Count *</label>
              <input required type="number" min="0" value={mortalityVal}
                onChange={e => setMortalityVal(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setMortalityModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    {/* ── Confirm Status Modal ─────────────────────────────────────────── */}
    {confirmModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">Confirm Status Change</h2>
            <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <p className="text-sm text-gray-600 mb-5">
            Mark this batch as <span className="font-semibold text-gray-900">{confirmModal.label}</span>?
            This will change the batch status.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmModal(null)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleMarkStatus}
              disabled={saving}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{
                backgroundColor:
                  confirmModal.newStatus === 'sold'   ? '#2563eb' :
                  confirmModal.newStatus === 'closed' ? '#6b7280' : '#16a34a'
              }}
            >
              {saving ? 'Saving…' : `Yes, ${confirmModal.label}`}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Sale Modal ────────────────────────────────────────────────────── */}
    {saleModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">Record Sale</h2>
            <button onClick={() => setSaleModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-4">
            Batch {fmtDate(batch.start_date)} · {Number(batch.chick_count).toLocaleString('en-IN')} chicks
          </div>
          <form onSubmit={handleSale} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              {vendors.length === 0 ? (
                <p className="text-sm text-red-500">No vendors found. Add a vendor first.</p>
              ) : (
                <select required value={saleForm.vendor_id}
                  onChange={e => setSaleForm(p => ({ ...p, vendor_id: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kg Sold *</label>
                <input required type="number" min="0.01" step="0.01" value={saleForm.kg_sold}
                  onChange={e => setSaleForm(p => ({ ...p, kg_sold: e.target.value }))}
                  placeholder="e.g. 150"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price / kg (₹) *</label>
                <input required type="number" min="0.01" step="0.01" value={saleForm.price_per_kg}
                  onChange={e => setSaleForm(p => ({ ...p, price_per_kg: e.target.value }))}
                  placeholder="e.g. 95"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {saleForm.kg_sold && saleForm.price_per_kg && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                <span className="text-xs font-medium text-green-700">Total</span>
                <span className="text-base font-bold text-green-700">
                  ₹{(parseFloat(saleForm.kg_sold) * parseFloat(saleForm.price_per_kg)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input required type="date" value={saleForm.date}
                onChange={e => setSaleForm(p => ({ ...p, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setSaleModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
              <button type="submit" disabled={saving || vendors.length === 0}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? 'Saving…' : 'Save Sale'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  )
}
