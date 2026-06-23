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

// ─── Give Advance Modal ───────────────────────────────────────────────────────

function GiveAdvanceModal({ farm, batch, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    account_id:       '',
    amount:           '',
    payment_date:     today,
    payment_method:   'Cash',
    reference_number: '',
    notes:            '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('is_active', true).order('created_at')
      .then(({ data }) => {
        const accs = data || []
        setAccounts(accs)
        const cashAcc = accs.find(a => a.type === 'cash') ?? accs[0]
        if (cashAcc) setForm(f => ({ ...f, account_id: cashAcc.id }))
      })
  }, [])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!form.account_id) { setError('Select an account'); return }

    setSaving(true)

    const { data: adv, error: advErr } = await supabase.from('growing_fee_advances').insert({
      farm_id:          farm.id,
      batch_id:         batch.id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      account_id:       form.account_id,
      notes:            form.notes.trim() || null,
    }).select('id').single()

    if (advErr) { setError(advErr.message); setSaving(false); return }

    // Update batch total_advances
    const { data: currentBatch } = await supabase.from('batches').select('total_advances').eq('id', batch.id).single()
    await supabase.from('batches').update({
      total_advances: Number(currentBatch?.total_advances || 0) + amt,
    }).eq('id', batch.id)

    // Insert transaction (cash out immediately)
    const batchStartDate = new Date(batch.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await supabase.from('transactions').insert({
      account_id:       form.account_id,
      transaction_type: 'out',
      category:         'growing_fee_advance',
      description:      `Growing fee advance — ${farm.owner_name || farm.name}, Batch ${batchStartDate}`,
      amount:           amt,
      transaction_date: form.payment_date,
      reference_type:   'growing_fee_advance',
      reference_id:     adv.id,
    })

    setSaving(false)
    onSaved()
  }

  const elapsed = Math.floor((Date.now() - new Date(batch.start_date + 'T00:00:00')) / 86400000)
  const batchLabel = `Batch ${new Date(batch.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — Day ${elapsed}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Growing Fee Advance Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm">
          <p className="font-semibold text-gray-800">{farm.name}</p>
          {farm.owner_name && <p className="text-gray-500 text-xs mt-0.5">{farm.owner_name}</p>}
          <p className="text-gray-500 text-xs mt-1">{batchLabel} · {Number(batch.chick_count).toLocaleString('en-IN')} chicks</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay From Account *</label>
              <select required value={form.account_id} onChange={set('account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Select account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '📱'} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
              <input required type="date" value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={form.reference_number} onChange={set('reference_number')} placeholder="e.g. Cheque no. or UTR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Record Advance'}
            </button>
          </div>
        </form>
      </div>
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
  const [advances,       setAdvances]       = useState([])

  // ── Action state ──
  const [saving,         setSaving]         = useState(false)
  const [actionError,    setActionError]    = useState('')
  const [editModal,      setEditModal]      = useState(false)
  const [editForm,       setEditForm]       = useState({ chick_count: '', start_date: '' })
  const [mortalityModal, setMortalityModal] = useState(false)
  const [mortalityVal,   setMortalityVal]   = useState('')
  const [saleModal,      setSaleModal]      = useState(false)
  const [saleForm,       setSaleForm]       = useState({ vendor_id: '', chicken_count: '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) })
  const [confirmModal,   setConfirmModal]   = useState(null) // { label, newStatus }
  const [closeBatchLoading,setCloseBatchLoading]= useState(false)
  const [advanceModal,   setAdvanceModal]   = useState(false)

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
      supabase.from('farms').select('id, name, owner_name, owner_phone').eq('id', farmId).single(),
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

    // Fetch advances (safe — graceful if table doesn't exist yet)
    const { data: advData } = await supabase
      .from('growing_fee_advances')
      .select('id, amount, payment_date, payment_method')
      .eq('batch_id', batchId)
      .order('payment_date')
    setAdvances(advData || [])

    setLoading(false)
  }

  async function refresh() {
    const [{ data: batchData }, { data: distData }, { data: salesData }, { data: expData }] = await Promise.all([
      supabase.from('batches').select('*').eq('id', batchId).single(),
      supabase.from('distributions').select('*').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('sales').select('*, vendors(name)').eq('batch_id', batchId).order('date', { ascending: true }),
      supabase.from('farm_expenses').select('*').eq('batch_id', batchId),
    ])
    // Fetch growing fee ledger separately (safe — won't break if migration not run yet)
    let ledgerData = null
    if (batchData?.growing_fee_id) {
      const { data } = await supabase
        .from('growing_fee_ledger')
        .select('status, amount_paid, balance_due, fcr_tier_description')
        .eq('id', batchData.growing_fee_id)
        .single()
      ledgerData = data
    }
    // Refresh advances too
    const { data: advData } = await supabase
      .from('growing_fee_advances')
      .select('id, amount, payment_date, payment_method')
      .eq('batch_id', batchId)
      .order('payment_date')
    setAdvances(advData || [])

    setBatch(batchData ? { ...batchData, growing_fee_ledger: ledgerData } : null)
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
    if (newStatus === 'sold') {
      handleMarkAsSold()
      return
    }
    const label = newStatus === 'active' ? 'Reactivate' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
    setActionError('')
    setConfirmModal({ label, newStatus })
  }

  async function handleMarkAsSold() {
    setActionError('')
    setCloseBatchLoading(true)

    // Step 1: Mark as sold
    const isAlreadySold = batch.status === 'sold' || batch.status === 'closed'
    if (!isAlreadySold) {
      const { error } = await supabase.from('batches')
        .update({ status: 'sold', sold_at: new Date().toISOString().slice(0, 10) })
        .eq('id', batchId)
      if (error) {
        setActionError(error.message)
        setCloseBatchLoading(false)
        return
      }
    }

    // Step 2: Calculate FCR
    const { data: feedDists } = await supabase
      .from('distributions')
      .select('id, item_name, quantity, unit')
      .eq('batch_id', batchId)
      .eq('type', 'feed')

    const itemNames = [...new Set((feedDists || []).map(d => d.item_name).filter(Boolean))]
    const kgMap = {}
    if (itemNames.length > 0) {
      const { data: itemRows } = await supabase
        .from('items')
        .select('name, kg_per_unit')
        .in('name', itemNames)
      for (const item of (itemRows || [])) {
        if (item.kg_per_unit != null) kgMap[item.name] = item.kg_per_unit
      }
    }

    const totalSaleKg = sales.reduce((s, r) => s + Number(r.kg_sold || 0), 0)
    const totalFeedKg = (feedDists || []).reduce((s, d) => {
      const kpu = kgMap[d.item_name] ?? null
      return s + (kpu != null ? Number(d.quantity) * Number(kpu) : 0)
    }, 0)
    const fcr       = totalSaleKg > 0 && totalFeedKg > 0 ? +(totalFeedKg / totalSaleKg).toFixed(2) : null
    const fcrRating = fcr == null ? null : fcr <= 1.8 ? 'Excellent' : fcr <= 2.1 ? 'Good' : fcr <= 2.5 ? 'Average' : 'Poor'

    await supabase.from('batches').update({
      total_feed_kg: totalFeedKg || null,
      total_sale_kg: totalSaleKg || null,
      fcr,
      fcr_rating: fcrRating,
    }).eq('id', batchId)

    // Step 3: Calculate Growing Fee (if FCR is known and no fee already recorded)
    if (fcr != null && !batch.growing_fee_id) {
      const { data: feeConfigs } = await supabase
        .from('growing_fee_config')
        .select('*')
        .eq('is_active', true)
        .order('fcr_from', { ascending: true })

      const tier = (feeConfigs || []).find(c =>
        fcr >= Number(c.fcr_from) && (c.fcr_to == null || fcr < Number(c.fcr_to))
      )

      if (tier) {
        const totalFee = +(Number(tier.rate_per_kg) * totalSaleKg).toFixed(2)
        const tierDesc = `${tier.description || ''} (FCR ${Number(tier.fcr_from).toFixed(1)}–${tier.fcr_to != null ? Number(tier.fcr_to).toFixed(1) : '+'})`

        // Fetch farm owner name snapshot
        const { data: farmData } = await supabase
          .from('farms')
          .select('owner_name')
          .eq('id', farmId)
          .single()

        // Fetch total advances given for this batch
        const { data: advRows } = await supabase
          .from('growing_fee_advances')
          .select('amount')
          .eq('batch_id', batchId)
        const totalAdvances = (advRows || []).reduce((s, r) => s + Number(r.amount), 0)

        const rawBalance  = totalFee - totalAdvances
        const balanceDue  = Math.max(0, rawBalance)
        const overpaid    = rawBalance < 0 ? Math.abs(rawBalance) : 0
        const ledgerStatus = balanceDue <= 0 ? (overpaid > 0 ? 'overpaid' : 'paid') : 'pending'

        const { data: ledgerRow } = await supabase
          .from('growing_fee_ledger')
          .insert({
            farm_id:              farmId,
            batch_id:             batchId,
            owner_name:           farmData?.owner_name || null,
            fcr,
            fcr_tier_description: tierDesc,
            rate_per_kg:          Number(tier.rate_per_kg),
            total_sale_kg:        totalSaleKg,
            total_fee:            totalFee,
            total_advances:       totalAdvances,
            overpaid_amount:      overpaid,
            status:               ledgerStatus,
            amount_paid:          0,
            balance_due:          balanceDue,
          })
          .select('id')
          .single()

        if (ledgerRow?.id) {
          await supabase.from('batches').update({
            growing_fee_id:     ledgerRow.id,
            growing_fee_per_kg: Number(tier.rate_per_kg),
            growing_fee_total:  totalFee,
          }).eq('id', batchId)
        }
      }
    }

    setCloseBatchLoading(false)
    refresh()
  }

  async function handleMarkStatus() {
    if (!confirmModal) return
    setSaving(true)
    const today  = new Date().toISOString().slice(0, 10)
    const update = { status: confirmModal.newStatus }
    if (confirmModal.newStatus === 'closed') update.closed_at = today
    const { error } = await supabase.from('batches').update(update).eq('id', batchId)
    setSaving(false)
    setConfirmModal(null)
    if (error) { setActionError(error.message); return }
    refresh()
  }

  async function handleSale(e) {
    e.preventDefault()
    const count = parseInt(saleForm.chicken_count)
    if (!count || count <= 0) { setActionError('Enter number of chickens'); return }
    const live      = Math.max(0, Number(batch.chick_count || 0) - Number(batch.mortality_count || 0))
    const soldSoFar = sales.reduce((s, r) => s + Number(r.chicken_count || 0), 0)
    const available = Math.max(0, live - soldSoFar)
    if (count > available) {
      setActionError(`Only ${available.toLocaleString('en-IN')} birds available (${live.toLocaleString('en-IN')} live − ${soldSoFar.toLocaleString('en-IN')} already sold)`)
      return
    }
    const kg    = parseFloat(saleForm.kg_sold)
    const price = parseFloat(saleForm.price_per_kg)
    setSaving(true)
    const { error } = await supabase.from('sales').insert({
      batch_id:      batchId,
      vendor_id:     saleForm.vendor_id,
      chicken_count: count,
      kg_sold:       kg,
      price_per_kg:  price,
      date:          saleForm.date,
    })
    setSaving(false)
    if (error) { setActionError(error.message); return }
    setSaleModal(false)
    setSaleForm({ vendor_id: vendors[0]?.id || '', chicken_count: '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) })
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

  const growingFee    = (!isActive && batch.growing_fee_total != null) ? Number(batch.growing_fee_total) : 0
  const totalExpenses = chickCost + feedCost + medCost + growingFee
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
                disabled={saving || closeBatchLoading}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
              >
                {closeBatchLoading ? 'Saving…' : '✅ Mark as Sold'}
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
            <>
<button
              onClick={() => promptMarkStatus('active')}
              disabled={saving}
              className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              ♻️ Reactivate Batch
            </button>
            </>
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
              { pct: Math.min((chickCost  / revenue) * 100, 100), color: '#fca5a5' },
              { pct: Math.min((feedCost   / revenue) * 100, 100), color: '#fdba74' },
              { pct: Math.min((medCost    / revenue) * 100, 100), color: '#fde047' },
              ...(growingFee > 0 ? [{ pct: Math.min((growingFee / revenue) * 100, 100), color: '#c4b5fd' }] : []),
              ...(profit > 0 ? [{ pct: Math.min((profit / revenue) * 100, 100), color: '#15803d' }] : []),
            ]} />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: '#78716c' }}>
          {[
            { color: '#fca5a5', label: 'Chick Cost' },
            { color: '#fdba74', label: 'Feed Cost' },
            { color: '#fde047', label: 'Medicine' },
            ...(growingFee > 0 ? [{ color: '#c4b5fd', label: 'Growing Fee' }] : []),
            ...(profit > 0 ? [{ color: '#15803d', label: 'Profit' }] : []),
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color, display: 'inline-block' }} />
              {l.label}
            </span>
          ))}
        </div>

        {(() => {
          const rows = [
            { label: 'Revenue',        value: fmt(revenue),                                      color: '#15803d', bold: false },
            { label: 'Chick Cost',     value: fmt(chickCost),                                   color: '#dc2626', bold: false },
            { label: 'Feed Cost',      value: fmt(feedCost),                                    color: '#dc2626', bold: false },
            { label: 'Medicine Cost',  value: fmt(medCost),                                     color: '#dc2626', bold: false },
            ...(growingFee > 0 ? [{ label: 'Growing Fee', value: fmt(growingFee), color: '#7c3aed', bold: false }] : []),
            { label: 'Total Expenses', value: fmt(totalExpenses),                               color: '#dc2626', bold: true },
            { label: 'Gross Profit',   value: (profit < 0 ? '−' : '') + fmt(Math.abs(profit)),  color: profit >= 0 ? '#15803d' : '#dc2626', bold: true },
            { label: 'Profit Margin',  value: `${margin.toFixed(1)}%`,                          color: margin >= 0 ? '#15803d' : '#dc2626', bold: false },
          ]
          return (
            <div>
              {rows.map((row, i) => (
                <div key={row.label}
                  className="flex justify-between items-center py-2"
                  style={{ borderBottom: i < rows.length - 1 ? '1px solid #f5f5f4' : 'none' }}>
                  <span style={{ color: '#78716c', fontWeight: row.bold ? 600 : 400 }} className="text-sm">{row.label}</span>
                  <span style={{ color: row.color, fontWeight: row.bold ? 800 : 600 }} className="text-sm">{row.value}</span>
                </div>
              ))}
            </div>
          )
        })()}
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

      {/* ── Growing Fee Advances (active batch) ─────────────────────── */}
      {isActive && (
        <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">Growing Fee Advance Tracking</h3>
            <span className="text-xs font-medium text-gray-400">Batch Active — Day {elapsed}</span>
          </div>
          <p style={{ color: '#78716c' }} className="text-xs mb-3">Fee will be calculated automatically when batch is marked as sold.</p>
          {advances.length > 0 ? (
            <div className="space-y-2 mb-3">
              {advances.map((adv, i) => (
                <div key={adv.id} className="flex items-center justify-between text-sm" style={{ borderBottom: i < advances.length - 1 ? '1px solid #f5f5f4' : 'none', paddingBottom: i < advances.length - 1 ? 8 : 0 }}>
                  <div>
                    <span style={{ color: '#1c1917' }} className="font-medium">{fmtDate(adv.payment_date)}</span>
                    {adv.payment_method && <span style={{ color: '#78716c' }} className="text-xs ml-2">· {adv.payment_method}</span>}
                  </div>
                  <span className="font-semibold text-amber-700">{fmt(adv.amount)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span style={{ color: '#78716c' }} className="text-sm font-semibold">Total Advances</span>
                <span className="font-bold text-amber-700">{fmt(advances.reduce((s, a) => s + Number(a.amount), 0))}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: '#78716c' }} className="text-xs italic mb-3">No advances recorded for this batch yet.</p>
          )}
          <button
            onClick={() => { setActionError(''); setAdvanceModal(true) }}
            className="w-full rounded-lg border border-green-600 text-green-700 hover:bg-green-50 px-4 py-2 text-sm font-semibold transition"
          >
            + Give Advance
          </button>
        </div>
      )}

      {/* ── FCR Section ──────────────────────────────────────────────── */}
      {(batch.status === 'sold' || batch.status === 'closed') && batch.fcr != null && (() => {
        const fcr = Number(batch.fcr)
        const rating = batch.fcr_rating || ''
        const ratingColor = rating === 'Excellent' ? '#15803d' : rating === 'Good' ? '#2563eb' : rating === 'Average' ? '#d97706' : '#dc2626'
        const ratingBg    = rating === 'Excellent' ? '#f0fdf4' : rating === 'Good' ? '#eff6ff' : rating === 'Average' ? '#fffbeb' : '#fef2f2'
        const gaugeMax    = 3.0
        const gaugePct    = Math.min((fcr / gaugeMax) * 100, 100)
        const gaugeColor  = rating === 'Excellent' ? '#15803d' : rating === 'Good' ? '#2563eb' : rating === 'Average' ? '#f59e0b' : '#dc2626'
        return (
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">Feed Conversion Ratio (FCR)</h3>
              <span className="text-xs font-semibold rounded-full px-3 py-1" style={{ backgroundColor: ratingBg, color: ratingColor }}>{rating}</span>
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <p style={{ color: ratingColor }} className="text-4xl font-extrabold">{fcr.toFixed(2)}</p>
                <p style={{ color: '#78716c' }} className="text-xs mt-1">Feed KG ÷ Sale KG</p>
              </div>
              <div className="flex-1 text-right text-xs" style={{ color: '#78716c' }}>
                <p>{Number(batch.total_feed_kg || 0).toLocaleString('en-IN')} kg feed consumed</p>
                <p>{Number(batch.total_sale_kg || 0).toLocaleString('en-IN')} kg chicken sold</p>
              </div>
            </div>
            {/* Gauge bar */}
            <div className="mb-2">
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#f3f4f6' }}>
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${gaugePct}%`, backgroundColor: gaugeColor }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1" style={{ color: '#9ca3af' }}>
                <span>0</span>
                <span className="text-green-600 font-medium">≤1.8 Excellent</span>
                <span className="text-blue-600 font-medium">≤2.1 Good</span>
                <span className="text-amber-600 font-medium">≤2.5 Avg</span>
                <span className="text-red-600 font-medium">3+</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Growing Fee Section ──────────────────────────────────────── */}
      {(batch.status === 'sold' || batch.status === 'closed') && batch.growing_fee_total != null && (() => {
        const grossFee     = Number(batch.growing_fee_total)
        const totalAdv     = Number(batch.growing_fee_ledger?.total_advances ?? advances.reduce((s, a) => s + Number(a.amount), 0))
        const postClosePaid= Number(batch.growing_fee_ledger?.amount_paid || 0)
        const balance      = Number(batch.growing_fee_ledger?.balance_due ?? Math.max(0, grossFee - totalAdv))
        const overpaid     = Number(batch.growing_fee_ledger?.overpaid_amount || 0)
        const status       = batch.growing_fee_ledger?.status || 'pending'
        const statusColor  = status === 'paid' ? '#15803d' : status === 'overpaid' ? '#15803d' : status === 'partial' ? '#d97706' : '#dc2626'
        const statusBg     = status === 'paid' ? '#f0fdf4' : status === 'overpaid' ? '#f0fdf4' : status === 'partial' ? '#fffbeb' : '#fef2f2'
        return (
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">Growing Fee</h3>
              <span className="text-xs font-semibold rounded-full px-3 py-1 capitalize" style={{ backgroundColor: statusBg, color: statusColor }}>{status}</span>
            </div>
            <div className="space-y-2 text-sm">
              {farm?.owner_name && (
                <div className="flex justify-between">
                  <span style={{ color: '#78716c' }}>Farm Owner</span>
                  <span className="font-medium" style={{ color: '#1c1917' }}>{farm.owner_name}</span>
                </div>
              )}
              {batch.growing_fee_ledger?.fcr_tier_description && (
                <div className="flex justify-between">
                  <span style={{ color: '#78716c' }}>FCR Tier</span>
                  <span className="font-medium" style={{ color: '#1c1917' }}>{batch.growing_fee_ledger.fcr_tier_description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: '#78716c' }}>Rate Applied</span>
                <span className="font-medium" style={{ color: '#1c1917' }}>₹{Number(batch.growing_fee_per_kg).toFixed(2)} / kg</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#78716c' }}>Chicken Sold</span>
                <span className="font-medium" style={{ color: '#1c1917' }}>{Number(batch.total_sale_kg || 0).toLocaleString('en-IN')} kg</span>
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between">
                  <span style={{ color: '#78716c' }}>Gross Growing Fee</span>
                  <span className="font-bold text-base" style={{ color: '#1c1917' }}>{fmt(grossFee)}</span>
                </div>
                {totalAdv > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: '#78716c' }}>Advances Paid</span>
                      <span className="font-medium text-amber-700">− {fmt(totalAdv)}</span>
                    </div>
                    {advances.length > 0 && (
                      <div className="ml-3 space-y-1">
                        {advances.map(adv => (
                          <div key={adv.id} className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
                            <span>{fmtDate(adv.payment_date)} · {adv.payment_method || 'Cash'}</span>
                            <span>{fmt(adv.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {postClosePaid > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: '#78716c' }}>Post-close Paid</span>
                    <span className="font-medium text-green-700">− {fmt(postClosePaid)}</span>
                  </div>
                )}
                <div className="pt-1 border-t border-gray-100">
                  {overpaid > 0 ? (
                    <div className="flex justify-between">
                      <span className="font-semibold text-green-700">Overpaid (credit)</span>
                      <span className="font-bold text-green-700">+ {fmt(overpaid)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span style={{ color: '#78716c' }}>Balance Due</span>
                      <span className="font-bold text-lg" style={{ color: balance > 0 ? '#dc2626' : '#15803d' }}>{fmt(balance)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {overpaid > 0 && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">
                Advance exceeds growing fee. ₹{overpaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })} credit for farm owner.
              </div>
            )}
            {balance > 0 && (
              <a href="/growing-fees" className="mt-4 w-full block text-center rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition">
                Record Payment →
              </a>
            )}
          </div>
        )
      })()}

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

    {/* ── Give Advance Modal ───────────────────────────────────────────── */}
    {advanceModal && isActive && (
      <GiveAdvanceModal
        farm={farm}
        batch={batch}
        onClose={() => setAdvanceModal(false)}
        onSaved={() => { setAdvanceModal(false); refresh() }}
      />
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. of Chickens *</label>
                <input required type="number" min="1" step="1" value={saleForm.chicken_count}
                  onChange={e => setSaleForm(p => ({ ...p, chicken_count: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {(() => {
                  const live = Math.max(0, Number(batch.chick_count || 0) - Number(batch.mortality_count || 0))
                  const soldSoFar = sales.reduce((s, r) => s + Number(r.chicken_count || 0), 0)
                  const available = Math.max(0, live - soldSoFar)
                  const entered = parseInt(saleForm.chicken_count) || 0
                  return (
                    <p className={`text-xs mt-1 font-medium ${entered > available ? 'text-red-600' : 'text-gray-400'}`}>
                      {entered > available ? `⚠ Exceeds available (${available.toLocaleString('en-IN')})` : `Available: ${available.toLocaleString('en-IN')} birds`}
                    </p>
                  )
                })()}
              </div>
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
