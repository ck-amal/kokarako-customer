import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn, ledgerOut, getChickBalance, getAverageCostPerUnit } from '../lib/stockLedger'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysElapsed(startDate) {
  return Math.floor((Date.now() - new Date(startDate)) / 86400000)
}

// ─── Capacity bar color ───────────────────────────────────────────────────────

function capBarColor(pct) {
  if (pct <= 25) return '#bbf7d0'
  if (pct <= 50) return '#4ade80'
  if (pct <= 75) return '#16a34a'
  return '#166534'
}

// ─── Animated single bar (capacity) ──────────────────────────────────────────

function AnimatedBar({ pct, color, duration = 800 }) {
  const [width, setWidth] = useState(0)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (reduced) { setWidth(pct); return }
    const t = setTimeout(() => setWidth(pct), 40)
    return () => clearTimeout(t)
  }, [pct, reduced])
  return (
    <div style={{
      height: '100%',
      width: `${width}%`,
      backgroundColor: color,
      transition: reduced ? 'none' : `width ${duration}ms cubic-bezier(0.4,0,0.2,1)`,
    }} />
  )
}

// ─── Animated stacked bar (financial) ────────────────────────────────────────

function StackedBar({ segments, duration = 600 }) {
  const [ready, setReady] = useState(false)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (reduced) { setReady(true); return }
    const t = setTimeout(() => setReady(true), 40)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {segments.map((seg, i) => (
        <div key={i} style={{
          width: ready ? `${seg.pct}%` : '0%',
          backgroundColor: seg.color,
          flexShrink: 0,
          transition: reduced ? 'none' : `width ${duration}ms cubic-bezier(0.4,0,0.2,1) ${i * 60}ms`,
        }} />
      ))}
    </div>
  )
}

// ─── Farm Edit Modal ──────────────────────────────────────────────────────────

function FarmEditModal({ farm, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:          farm.name          ?? '',
    location:      farm.location      ?? '',
    capacity:      farm.capacity      ?? '',
    phone_number:  farm.phone_number  ?? '',
    owner_name:    farm.owner_name    ?? '',
    owner_phone:   farm.owner_phone   ?? '',
    owner_address: farm.owner_address ?? '',
    owner_notes:   farm.owner_notes   ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('farms').update({
      name:          form.name.trim(),
      location:      form.location.trim() || null,
      capacity:      Number(form.capacity),
      phone_number:  form.phone_number.trim() || null,
      owner_name:    form.owner_name.trim() || null,
      owner_phone:   form.owner_phone.trim() || null,
      owner_address: form.owner_address.trim() || null,
      owner_notes:   form.owner_notes.trim() || null,
    }).eq('id', farm.id)
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Edit Farm</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Farm details */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm Name *</label>
            <input required value={form.name} onChange={set('name')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input value={form.location} onChange={set('location')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (birds) *</label>
            <input required type="number" min="1" value={form.capacity} onChange={set('capacity')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input value={form.phone_number} onChange={set('phone_number')} placeholder="e.g. 9876543210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {/* Farm Owner section */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Farm Owner</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                <input value={form.owner_name} onChange={set('owner_name')} placeholder="e.g. Rajesh Kumar"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Phone</label>
                <input value={form.owner_phone} onChange={set('owner_phone')} placeholder="e.g. 9876543210"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Address</label>
                <input value={form.owner_address} onChange={set('owner_address')} placeholder="Optional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.owner_notes} onChange={set('owner_notes')} rows={2}
                  placeholder="Payment preferences, notes about the owner…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Batch Modal ─────────────────────────────────────────────────────────

function EditBatchModal({ batch, onClose, onSaved }) {
  const [form, setForm] = useState({
    chick_count:     String(batch.chick_count),
    start_date:      batch.start_date,
    mortality_count: String(batch.mortality_count ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('batches').update({
      chick_count:     Number(form.chick_count),
      start_date:      form.start_date,
      mortality_count: Number(form.mortality_count),
    }).eq('id', batch.id)
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Edit Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input required type="date" value={form.start_date} onChange={set('start_date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chick Count *</label>
            <input required type="number" min="1" value={form.chick_count} onChange={set('chick_count')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mortality Count</label>
            <input type="number" min="0" value={form.mortality_count} onChange={set('mortality_count')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── New Batch Modal ──────────────────────────────────────────────────────────

function NewBatchModal({ farmId, onClose, onSaved }) {
  const [form, setForm] = useState({
    chick_count: '',
    start_date:  new Date().toISOString().slice(0, 10),
  })
  const [pricePerChick, setPricePerChick] = useState('')
  const [supplierId,    setSupplierId]    = useState('')
  const [payNow,        setPayNow]        = useState(false)
  const [accountId,     setAccountId]     = useState('')

  const [chickBalance,  setChickBalance]  = useState(null)
  const [capacity,      setCapacity]      = useState(null)
  const [liveChicks,    setLiveChicks]    = useState(0)
  const [suppliers,     setSuppliers]     = useState([])
  const [accounts,      setAccounts]      = useState([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: farm }, { data: activeBatches }, balance, { data: sups }, { data: accs }] = await Promise.all([
        supabase.from('farms').select('capacity').eq('id', farmId).single(),
        supabase.from('batches').select('chick_count, mortality_count').eq('farm_id', farmId).eq('status', 'active'),
        getChickBalance(),
        supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).order('name'),
      ])
      setCapacity(farm?.capacity ?? null)
      setLiveChicks((activeBatches || []).reduce(
        (s, b) => s + Math.max(0, Number(b.chick_count || 0) - Number(b.mortality_count || 0)), 0
      ))
      setChickBalance(balance)
      setSuppliers(sups || [])
      const accList = accs || []
      setAccounts(accList)
      const cash = accList.find(a => a.type === 'cash')
      if (cash) setAccountId(cash.id)
    }
    load()
  }, [farmId])

  const remaining     = capacity != null ? Math.max(0, capacity - liveChicks) : null
  const chickCount    = Number(form.chick_count) || 0
  const needsPurchase = chickBalance !== null && chickCount > 0 && chickBalance < chickCount
  const totalCost     = needsPurchase ? chickCount * (parseFloat(pricePerChick) || 0) : 0

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (remaining !== null && chickCount > remaining) {
      setError(`Exceeds remaining capacity. Only ${remaining.toLocaleString('en-IN')} spots available.`)
      return
    }
    if (needsPurchase && !pricePerChick) {
      setError('Enter price per chick to record the purchase')
      return
    }
    setSaving(true)

    if (needsPurchase) {
      const price = parseFloat(pricePerChick)
      const { data: proc, error: procErr } = await supabase.from('procurement').insert({
        type:          'chicks',
        item_name:     'Chicks',
        quantity:      chickCount,
        unit:          'birds',
        cost:          totalCost,
        cost_per_unit: price,
        supplier_id:   supplierId || null,
        date:          form.start_date,
        notes:         'Auto-recorded on batch creation',
      }).select('id').single()

      if (procErr) { setError(procErr.message); setSaving(false); return }

      await ledgerIn({
        itemName:      'Chicks',
        itemType:      'chicks',
        quantity:      chickCount,
        unit:          'birds',
        referenceType: 'procurement',
        referenceId:   proc.id,
        date:          form.start_date,
      })

      if (payNow && accountId) {
        await supabase.from('transactions').insert({
          account_id:       accountId,
          transaction_type: 'out',
          category:         'procurement',
          description:      `Chick purchase — ${chickCount.toLocaleString('en-IN')} birds`,
          amount:           totalCost,
          transaction_date: form.start_date,
          reference_type:   'procurement',
          reference_id:     proc.id,
        })
      }
    }

    const { data: inserted, error: batchErr } = await supabase.from('batches').insert({
      farm_id:     farmId,
      chick_count: chickCount,
      start_date:  form.start_date,
      status:      'active',
    }).select('id').single()

    if (batchErr) { setError(batchErr.message); setSaving(false); return }

    await ledgerOut({
      itemName:      'Chicks',
      itemType:      'chicks',
      quantity:      chickCount,
      unit:          'birds',
      referenceType: 'batch',
      referenceId:   inserted.id,
      date:          form.start_date,
    })

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Start New Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Chicks *</label>
            <input required type="number" min="1" value={form.chick_count} onChange={set('chick_count')}
              placeholder="e.g. 2000" className={inputCls} />
            {/* Stock availability */}
            {chickBalance !== null && chickCount > 0 && (
              <p className={`text-xs mt-1 font-medium ${
                chickBalance === 0 ? 'text-red-600'
                : chickCount > chickBalance ? 'text-orange-600'
                : 'text-green-600'
              }`}>
                {chickBalance === 0
                  ? '⚠ No chicks in stock — purchase details required below'
                  : chickCount > chickBalance
                  ? `⚠ Only ${chickBalance.toLocaleString('en-IN')} in stock — ${(chickCount - chickBalance).toLocaleString('en-IN')} will be purchased`
                  : `✓ ${chickBalance.toLocaleString('en-IN')} chicks available in stock`}
              </p>
            )}
            {remaining !== null && (
              <p className={`text-xs mt-1 font-medium ${remaining === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {remaining === 0
                  ? '⚠ Farm is at full capacity'
                  : `Farm capacity remaining: ${remaining.toLocaleString('en-IN')} birds`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input required type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </div>

          {/* Purchase section */}
          {needsPurchase && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Chick Purchase Details</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price per Chick (₹) *</label>
                  <input
                    required={needsPurchase} type="number" min="0.01" step="0.01"
                    value={pricePerChick} onChange={e => setPricePerChick(e.target.value)}
                    placeholder="e.g. 28.50" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost</label>
                  <div className="flex items-center h-[38px] rounded-lg bg-white border border-gray-200 px-3 text-sm font-semibold text-amber-700">
                    {totalCost > 0 ? '₹' + totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls + ' bg-white'}>
                  <option value="">No supplier / unknown</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="rounded-lg bg-white border border-amber-100 px-3 py-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payNow}
                    onChange={e => setPayNow(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Pay now</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {payNow
                        ? 'Cash will be deducted from the selected account'
                        : 'Amount will be added to Supplier Dues (liability)'}
                    </p>
                  </div>
                </label>
                {payNow && accounts.length > 0 && (
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className={inputCls + ' bg-white mt-3'}
                  >
                    <option value="">— select account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving || chickBalance === null}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : chickBalance === null ? 'Loading…' : 'Start Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Distribution Modal ───────────────────────────────────────────────────────

function DistributionModal({ farmId, stock, onClose, onSaved }) {
  const [activeBatches,   setActiveBatches]   = useState([])
  const [batchId,         setBatchId]         = useState('')
  const [batchesLoading,  setBatchesLoading]  = useState(true)
  const [form, setForm] = useState({
    type:     'feed',
    stock_id: stock.length ? stock[0].id : '',
    quantity: '',
    date:     new Date().toISOString().slice(0, 10),
    notes:    '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    supabase.from('batches')
      .select('id, start_date, chick_count')
      .eq('farm_id', farmId)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        const list = data || []
        setActiveBatches(list)
        if (list.length === 1) setBatchId(list[0].id)
        setBatchesLoading(false)
      })
  }, [farmId])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const selectedStock  = stock.find(s => s.id === form.stock_id)
  const hasNoBatches   = !batchesLoading && activeBatches.length === 0
  const formDisabled   = hasNoBatches

  async function handleSubmit(e) {
    e.preventDefault()
    if (!batchId && activeBatches.length > 0) { setError('Select a batch'); return }
    if (!form.stock_id) { setError('Select a stock item'); return }
    const qty = parseFloat(form.quantity)
    if (!qty || qty <= 0) { setError('Enter a valid quantity'); return }
    if (selectedStock && qty > Number(selectedStock.quantity)) {
      setError(`Only ${Number(selectedStock.quantity).toLocaleString('en-IN')} ${selectedStock.unit} available in stock`)
      return
    }

    setSaving(true)

    const { data: distInserted, error: distErr } = await supabase.from('distributions').insert({
      farm_id:   farmId,
      batch_id:  batchId || null,
      stock_id:  form.stock_id,
      item_name: selectedStock.item_name,
      type:      form.type,
      quantity:  qty,
      unit:      selectedStock.unit,
      date:      form.date,
      notes:     form.notes.trim() || null,
    }).select('id').single()

    if (distErr) { setError(distErr.message); setSaving(false); return }

    // 1. Write ledger OUT entry
    await ledgerOut({
      itemName:      selectedStock.item_name,
      itemType:      form.type,
      quantity:      qty,
      unit:          selectedStock.unit,
      referenceType: 'distribution',
      referenceId:   distInserted.id,
      date:          form.date,
    })

    // 2. Deduct from stock table (backward compat for dashboard/alerts)
    await supabase.from('stock')
      .update({ quantity: Math.max(0, Number(selectedStock.quantity) - qty) })
      .eq('id', form.stock_id)

    // 3. Calculate weighted-average cost and insert farm_expense
    const avgCpu = await getAverageCostPerUnit(selectedStock.item_name)
    await supabase.from('farm_expenses').insert({
      farm_id:         farmId,
      batch_id:        batchId || null,
      distribution_id: distInserted.id,
      item_name:       selectedStock.item_name,
      item_type:       form.type,
      quantity:        qty,
      unit:            selectedStock.unit,
      cost_per_unit:   avgCpu,
      total_cost:      qty * avgCpu,
      date:            form.date,
    })

    // 4. Increment farm_stock — add distributed qty to farm's on-hand stock
    const { data: fsCurrent } = await supabase.from('farm_stock')
      .select('id, quantity_on_hand')
      .eq('farm_id', farmId)
      .eq('item_name', selectedStock.item_name)
      .maybeSingle()
    if (fsCurrent) {
      await supabase.from('farm_stock').update({
        quantity_on_hand: Number(fsCurrent.quantity_on_hand) + qty,
        updated_at:       new Date().toISOString(),
      }).eq('id', fsCurrent.id)
    } else {
      await supabase.from('farm_stock').insert({
        farm_id:          farmId,
        item_name:        selectedStock.item_name,
        unit:             selectedStock.unit,
        quantity_on_hand: qty,
      })
    }

    onSaved()
  }

  if (stock.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center">
          <p className="text-3xl mb-3">📦</p>
          <p className="font-semibold text-gray-800 mb-2">No stock available</p>
          <p className="text-sm text-gray-500 mb-5">Add items to stock from the Procurement page first.</p>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Record Distribution</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Batch selector ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
            {batchesLoading ? (
              <p className="text-xs text-gray-400 py-2">Loading batches…</p>
            ) : hasNoBatches ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                ⚠ No active batches for this farm. Start a batch first before recording a distribution.
              </div>
            ) : activeBatches.length === 1 ? (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
                Batch started {fmtDate(activeBatches[0].start_date)} — {Number(activeBatches[0].chick_count).toLocaleString('en-IN')} chicks
              </div>
            ) : (
              <select value={batchId} onChange={e => setBatchId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">— Select a batch —</option>
                {activeBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    Batch started {fmtDate(b.start_date)} — {Number(b.chick_count).toLocaleString('en-IN')} chicks
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={formDisabled ? 'opacity-40 pointer-events-none' : ''}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select value={form.type} onChange={set('type')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  <option value="feed">Feed</option>
                  <option value="medicine">Medicine</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Item *</label>
                <select value={form.stock_id} onChange={set('stock_id')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {stock.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.item_name} — {Number(s.quantity).toLocaleString('en-IN')} {s.unit} available
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity ({selectedStock?.unit ?? 'units'}) *
                </label>
                <input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={set('quantity')}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input required type="date" value={form.date} onChange={set('date')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input value={form.notes} onChange={set('notes')} placeholder="Optional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Recording…' : 'Record Distribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sale Modal ───────────────────────────────────────────────────────────────

function SaleModal({ activeBatch, vendors, onClose, onSaved }) {
  const [form, setForm] = useState({
    vendor_id:     vendors.length ? vendors[0].id : '',
    chicken_count: '',
    kg_sold:       '',
    price_per_kg:  '',
    date:          new Date().toISOString().slice(0, 10),
  })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [alreadySold, setAlreadySold] = useState(0)

  useEffect(() => {
    if (!activeBatch?.id) return
    supabase.from('sales').select('chicken_count').eq('batch_id', activeBatch.id)
      .then(({ data }) => setAlreadySold((data || []).reduce((s, r) => s + Number(r.chicken_count || 0), 0)))
  }, [activeBatch?.id])

  const batchLive  = activeBatch ? Math.max(0, Number(activeBatch.chick_count || 0) - Number(activeBatch.mortality_count || 0)) : 0
  const available  = Math.max(0, batchLive - alreadySold)
  const entered    = parseInt(form.chicken_count) || 0

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const total = form.kg_sold && form.price_per_kg
    ? (parseFloat(form.kg_sold) * parseFloat(form.price_per_kg)).toFixed(2)
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const count = parseInt(form.chicken_count)
    if (!count || count <= 0) { setError('Enter number of chickens'); return }
    if (count > available) {
      setError(`Only ${available.toLocaleString('en-IN')} birds available (${batchLive.toLocaleString('en-IN')} live − ${alreadySold.toLocaleString('en-IN')} already sold)`)
      return
    }
    setSaving(true)
    const { error } = await supabase.from('sales').insert({
      batch_id:      activeBatch.id,
      vendor_id:     form.vendor_id,
      chicken_count: count,
      kg_sold:       parseFloat(form.kg_sold),
      price_per_kg:  parseFloat(form.price_per_kg),
      date:          form.date,
    })
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  if (!activeBatch) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center">
          <p className="text-3xl mb-3">🐣</p>
          <p className="font-semibold text-gray-800 mb-2">No active batch</p>
          <p className="text-sm text-gray-500 mb-5">Start a batch for this farm first, then record sales.</p>
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Record Sale</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            Batch started {fmtDate(activeBatch.start_date)} · {Number(activeBatch.chick_count).toLocaleString('en-IN')} chicks
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
            <select required value={form.vendor_id} onChange={set('vendor_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">No. of Chickens *</label>
              <input required type="number" min="1" step="1" value={form.chicken_count} onChange={set('chicken_count')}
                placeholder="e.g. 500"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className={`text-xs mt-1 font-medium ${entered > available ? 'text-red-600' : 'text-gray-400'}`}>
                {entered > available ? `⚠ Exceeds available (${available.toLocaleString('en-IN')})` : `Available: ${available.toLocaleString('en-IN')} birds`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kg Sold *</label>
              <input required type="number" min="0.01" step="0.01" value={form.kg_sold} onChange={set('kg_sold')}
                placeholder="e.g. 150"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price / kg (₹) *</label>
              <input required type="number" min="0.01" step="0.01" value={form.price_per_kg} onChange={set('price_per_kg')}
                placeholder="e.g. 95"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>

          {total && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium text-green-800">Total Amount</span>
              <span className="text-lg font-bold text-green-700">₹{Number(total).toLocaleString('en-IN')}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input required type="date" value={form.date} onChange={set('date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Farm Stock Adjust Modal ──────────────────────────────────────────────────

function FarmStockAdjustModal({ item, onClose, onSaved }) {
  const [qty,    setQty]    = useState(String(item.quantity_on_hand))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const newQty = parseFloat(qty)
    if (isNaN(newQty) || newQty < 0) { setError('Enter a valid quantity (0 or more)'); return }
    setSaving(true)
    const { error: err } = await supabase.from('farm_stock').update({
      quantity_on_hand: newQty,
      updated_at:       new Date().toISOString(),
    }).eq('id', item.id)
    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Adjust Stock</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Set the current physical quantity of <span className="font-semibold text-gray-800">{item.item_name}</span> at this farm.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Quantity ({item.unit}) *
            </label>
            <input
              required type="number" min="0" step="0.01"
              value={qty} onChange={e => setQty(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Give Advance Modal ───────────────────────────────────────────────────────

function GiveAdvanceModal({ farm, batches, initialBatchId, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const activeBatches = batches.filter(b => b.status === 'active')

  const [form, setForm] = useState({
    batch_id:         initialBatchId ?? activeBatches[0]?.id ?? '',
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

  const selectedBatch = activeBatches.find(b => b.id === form.batch_id)

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')
    if (!form.batch_id) { setError('Select a batch'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!form.account_id) { setError('Select an account'); return }

    setSaving(true)

    // Insert advance
    const { data: adv, error: advErr } = await supabase.from('growing_fee_advances').insert({
      farm_id:          farm.id,
      batch_id:         form.batch_id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      account_id:       form.account_id,
      notes:            form.notes.trim() || null,
    }).select('id').single()

    if (advErr) { setError(advErr.message); setSaving(false); return }

    // Update batch total_advances
    const { data: currentBatch } = await supabase.from('batches').select('total_advances').eq('id', form.batch_id).single()
    await supabase.from('batches').update({
      total_advances: Number(currentBatch?.total_advances || 0) + amt,
    }).eq('id', form.batch_id)

    // Insert transaction (cash out)
    const batchStartDate = selectedBatch?.start_date ? new Date(selectedBatch.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
    await supabase.from('transactions').insert({
      account_id:       form.account_id,
      transaction_type: 'out',
      category:         'growing_fee_advance',
      description:      `Growing fee advance — ${farm.owner_name || farm.name}${batchStartDate ? ', Batch ' + batchStartDate : ''}`,
      amount:           amt,
      transaction_date: form.payment_date,
      reference_type:   'growing_fee_advance',
      reference_id:     adv.id,
    })

    setSaving(false)
    onSaved()
  }

  if (activeBatches.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Growing Fee Advance</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            No active batch for this farm. Advances can only be given during an active batch.
          </div>
          <button onClick={onClose} className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Close</button>
        </div>
      </div>
    )
  }

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
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Batch selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
            {activeBatches.length === 1 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 font-medium">
                Batch {new Date(activeBatches[0].start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — Day {Math.floor((Date.now() - new Date(activeBatches[0].start_date + 'T00:00:00')) / 86400000)} — {Number(activeBatches[0].chick_count).toLocaleString('en-IN')} chicks
              </div>
            ) : (
              <select required value={form.batch_id} onChange={set('batch_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {activeBatches.map(b => {
                  const day = Math.floor((Date.now() - new Date(b.start_date + 'T00:00:00')) / 86400000)
                  const sd = new Date(b.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  return <option key={b.id} value={b.id}>Batch {sd} — Day {day} — {Number(b.chick_count).toLocaleString('en-IN')} chicks</option>
                })}
              </select>
            )}
          </div>

          {/* Account selector */}
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

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Date + Method */}
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

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={form.reference_number} onChange={set('reference_number')} placeholder="e.g. Cheque no. or UTR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {/* Notes */}
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

// ─── Tab labels ───────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Batches', 'Distributions', 'Sales', 'Farm Stock']

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FarmDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [farm,                 setFarm]                = useState(null)
  const [batches,              setBatches]             = useState([])
  const [distributions,        setDistributions]       = useState([])
  const [sales,                setSales]               = useState([])
  const [farmExpenses,         setFarmExpenses]        = useState([])
  const [allChickProcurement,  setAllChickProcurement] = useState([])
  const [allBatchesChickTotal, setAllBatchesChickTotal]= useState(0)
  const [stock,                setStock]               = useState([])
  const [vendors,              setVendors]             = useState([])
  const [cashCollection,       setCashCollection]      = useState([])
  const [growingFeeLedger,     setGrowingFeeLedger]    = useState([])
  const [farmStock,            setFarmStock]           = useState([])
  const [farmAdvances,         setFarmAdvances]        = useState([])
  const [loading,              setLoading]             = useState(true)

  const [advanceModal,         setAdvanceModal]         = useState(false)
  const [advanceBatchId,       setAdvanceBatchId]       = useState(null)

  const [editModal,          setEditModal]          = useState(false)
  const [batchModal,         setBatchModal]         = useState(false)
  const [editingBatch,       setEditingBatch]       = useState(null)
  const [distModal,          setDistModal]          = useState(false)
  const [saleModal,          setSaleModal]          = useState(false)
  const [editingFarmStock,   setEditingFarmStock]   = useState(null) // {id,item_name,unit,quantity_on_hand}

  const [activeTab,        setActiveTab]        = useState('Overview')
  const [distFilter,       setDistFilter]       = useState('all')
  const [batchStatusFilter,setBatchStatusFilter] = useState('active')
  const [batchDateFrom,    setBatchDateFrom]    = useState('')
  const [batchDateTo,      setBatchDateTo]      = useState('')
  const [batchSearch,      setBatchSearch]      = useState('')

  async function fetchAll() {
    // Phase 1: farm + this farm's batches
    const [{ data: farmData }, { data: batchData }] = await Promise.all([
      supabase.from('farms').select('*').eq('id', id).single(),
      supabase.from('batches')
        .select('*')
        .eq('farm_id', id)
        .order('start_date', { ascending: false }),
    ])

    setFarm(farmData)
    const bList    = batchData || []
    setBatches(bList)
    const batchIds = bList.map(b => b.id)

    // Phase 2: everything else in parallel
    const [
      { data: distData },
      { data: stockData },
      { data: vendorData },
      { data: chickProcData },
      { data: allBatchData },
      { data: farmExpData },
      { data: farmStockData },
      salesResult,
    ] = await Promise.all([
      supabase.from('distributions').select('*, batches(start_date)').eq('farm_id', id).order('date', { ascending: false }),
      supabase.from('stock').select('id, item_name, quantity, unit').gt('quantity', 0).order('item_name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('procurement').select('cost, quantity').eq('type', 'chicks'),
      supabase.from('batches').select('chick_count'),
      supabase.from('farm_expenses').select('*').eq('farm_id', id),
      supabase.from('farm_stock').select('*').eq('farm_id', id).order('item_name'),
      batchIds.length
        ? supabase.from('sales').select('id, date, kg_sold, price_per_kg, total_amount, batch_id, vendors(name)').in('batch_id', batchIds).order('date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    setDistributions(distData || [])
    setStock(stockData || [])
    setVendors(vendorData || [])
    setAllChickProcurement(chickProcData || [])
    setAllBatchesChickTotal((allBatchData || []).reduce((s, b) => s + Number(b.chick_count || 0), 0))
    setFarmExpenses(farmExpData || [])
    setFarmStock(farmStockData || [])
    setSales(salesResult.data || [])

    // Phase 3: cash_collection + growing fee ledger in parallel
    const saleIds = (salesResult.data || []).map(s => s.id)
    const [cashResult, feeResult] = await Promise.all([
      saleIds.length
        ? supabase.from('cash_collection').select('id, amount_paid, date, vendors(name)').in('sale_id', saleIds).order('date', { ascending: false })
        : Promise.resolve({ data: [] }),
      batchIds.length
        ? supabase.from('growing_fee_ledger').select('batch_id, total_fee, amount_paid, balance_due, status').in('batch_id', batchIds)
        : Promise.resolve({ data: [] }),
    ])
    setCashCollection(cashResult.data || [])
    setGrowingFeeLedger(feeResult.data || [])

    // Fetch advances for active batches
    const activeBatchIds = bList.filter(b => b.status === 'active').map(b => b.id)
    const advResult = activeBatchIds.length
      ? await supabase.from('growing_fee_advances').select('id, batch_id, amount, payment_date, payment_method').in('batch_id', activeBatchIds).order('payment_date')
      : { data: [] }
    setFarmAdvances(advResult.data || [])

    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  function refresh() { setLoading(true); fetchAll() }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!farm) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-5xl mb-3">🏡</p>
        <p className="font-medium text-gray-600">Farm not found</p>
        <Link to="/farms" className="text-amber-600 hover:underline text-sm mt-3 inline-block">← Back to Farms</Link>
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const activeBatch = batches.find(b => b.status === 'active')

  // Per-batch revenue for batch table
  const batchRevenue = {}
  for (const s of sales) {
    batchRevenue[s.batch_id] = (batchRevenue[s.batch_id] || 0) + Number(s.total_amount || 0)
  }

  // Per-batch feed kg and medicine qty from distributions (keyed by batch_id)
  const batchFeedKg  = {}
  const batchMedQty  = {}
  for (const d of distributions) {
    const key = d.batch_id
    if (!key) continue
    if (d.type === 'feed')     batchFeedKg[key] = (batchFeedKg[key] || 0) + Number(d.quantity || 0)
    if (d.type === 'medicine') batchMedQty[key] = (batchMedQty[key] || 0) + Number(d.quantity || 0)
  }

  // Per-batch total expenses
  const batchExpenses = {}
  for (const e of farmExpenses) {
    if (e.batch_id) batchExpenses[e.batch_id] = (batchExpenses[e.batch_id] || 0) + Number(e.total_cost || 0)
  }

  // ─── P&L ──────────────────────────────────────────────────────────────────

  const revenue      = sales.reduce((s, sale) => s + Number(sale.total_amount || 0), 0)

  // Feed & medicine cost from farm_expenses (created automatically on distribution)
  const feedCost     = farmExpenses.filter(e => e.item_type === 'feed').reduce((s, e) => s + Number(e.total_cost || 0), 0)
  const medicineCost = farmExpenses.filter(e => e.item_type === 'medicine').reduce((s, e) => s + Number(e.total_cost || 0), 0)

  // Chick cost — proportional share of all chick procurement
  const totalChickCost  = allChickProcurement.reduce((s, p) => s + Number(p.cost || 0), 0)
  const farmTotalChicks = batches.reduce((s, b) => s + Number(b.chick_count || 0), 0)
  const chickCost       = allBatchesChickTotal > 0
    ? (farmTotalChicks / allBatchesChickTotal) * totalChickCost
    : 0

  const totalCost   = chickCost + feedCost + medicineCost
  const grossProfit = revenue - totalCost
  const margin      = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  // ─── Additional computed values ───────────────────────────────────────────

  const chicksAlive = batches.filter(b => b.status === 'active').reduce((s, b) => s + Number(b.chick_count || 0) - Number(b.mortality_count || 0), 0)
  const remainingCapacity = Math.max(0, Number(farm?.capacity || 0) - chicksAlive)
  const activeBatchCount = batches.filter(b => b.status === 'active').length
  const totalMortality = batches.reduce((s, b) => s + Number(b.mortality_count || 0), 0)
  const activeBatchesList = batches.filter(b => b.status === 'active')
  const daysToHarvest = activeBatchesList.length === 0 ? '—' : (() => {
    const minRemaining = Math.min(...activeBatchesList.map(b => 45 - daysElapsed(b.start_date)))
    return minRemaining < 0 ? `Overdue ${Math.abs(minRemaining)}d` : `${minRemaining}d`
  })()

  const distCostMap = {}
  for (const fe of farmExpenses) {
    if (fe.distribution_id) distCostMap[fe.distribution_id] = Number(fe.total_cost || 0)
  }

  const filteredDists = distFilter === 'all' ? distributions : distributions.filter(d => d.type === distFilter)

  const batchFiltersActive = batchStatusFilter !== 'active' || batchDateFrom || batchDateTo || batchSearch
  const filteredBatches = batches.filter(b => {
    if (batchStatusFilter !== 'all' && b.status !== batchStatusFilter) return false
    if (batchDateFrom && b.start_date < batchDateFrom) return false
    if (batchDateTo   && b.start_date > batchDateTo)   return false
    if (batchSearch) {
      const q = batchSearch.toLowerCase()
      if (!b.id.toLowerCase().includes(q) && !b.start_date.includes(q)) return false
    }
    return true
  })

  const events = [
    ...batches.map(b => ({ date: b.start_date, type: 'batch', label: `Batch started — ${Number(b.chick_count).toLocaleString('en-IN')} chicks` })),
    ...distributions.map(d => ({ date: d.date, type: 'dist', label: `${d.type.charAt(0).toUpperCase() + d.type.slice(1)} — ${Number(d.quantity).toLocaleString('en-IN')} ${d.unit} of ${d.item_name}` })),
    ...sales.map(s => ({ date: s.date, type: 'sale', label: `Sale to ${s.vendors?.name ?? '—'} — ${fmt(s.total_amount)}` })),
    ...cashCollection.map(c => ({ date: c.date, type: 'payment', label: `Payment from ${c.vendors?.name ?? '—'} — ${fmt(c.amount_paid)}` })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/farms" className="hover:text-amber-600 transition">Farms</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{farm.name}</span>
      </div>

      {/* ─── Farm Identity Header (always visible) ──────────────────────── */}
      <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-2xl border shadow-sm p-6 max-w-[900px] mx-auto w-full">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div style={{ backgroundColor: '#f0fdf4' }} className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
              🌾
            </div>
            <div>
              <h1 style={{ color: '#1c1917' }} className="text-2xl font-bold">{farm.name}</h1>
              <div style={{ color: '#78716c' }} className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm">
                {farm.location     && <span>📍 {farm.location}</span>}
                <span>🐔 {Number(farm.capacity).toLocaleString('en-IN')} bird capacity</span>
                {farm.phone_number && <span>📞 {farm.phone_number}</span>}
              </div>
              {(farm.owner_name || farm.owner_phone) && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-0.5 text-sm" style={{ color: '#78716c' }}>
                  <span className="font-medium" style={{ color: '#1c1917' }}>Managed by:</span>
                  {farm.owner_name  && <span>{farm.owner_name}</span>}
                  {farm.owner_phone && <a href={`tel:${farm.owner_phone}`} className="hover:text-amber-600 transition">📞 {farm.owner_phone}</a>}
                  {farm.owner_address && <span>· {farm.owner_address}</span>}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditModal(true)}
            style={{ borderColor: '#e7e5e0', color: '#78716c' }}
            className="flex-shrink-0 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-stone-50 transition"
          >
            Edit
          </button>
        </div>
      </div>

      {/* ─── Tab Bar ────────────────────────────────────────────────────── */}
      <div style={{ borderColor: '#e7e5e0', backgroundColor: '#fffffe' }} className="border-b rounded-t-xl max-w-[900px] mx-auto w-full -mb-px">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-3 text-sm font-semibold border-b-2 transition"
              style={{
                borderColor: activeTab === tab ? '#15803d' : 'transparent',
                color: activeTab === tab ? '#15803d' : '#78716c',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab Content ────────────────────────────────────────────────── */}

      {/* OVERVIEW TAB */}
      {activeTab === 'Overview' && (
        <div className="space-y-4 max-w-[900px] mx-auto w-full">
          <style>{`@keyframes ovFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {/* ── 1. Capacity Status Bar ─────────────────────────────────── */}
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span style={{ color: '#1c1917' }} className="text-sm font-semibold">Farm Capacity</span>
              <span style={{ color: '#78716c' }} className="text-sm">
                {chicksAlive.toLocaleString('en-IN')} / {Number(farm.capacity).toLocaleString('en-IN')} birds
              </span>
            </div>
            <div style={{ height: 16, backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
              <AnimatedBar
                pct={farm.capacity > 0 ? Math.min(100, (chicksAlive / farm.capacity) * 100) : 0}
                color={capBarColor(farm.capacity > 0 ? (chicksAlive / farm.capacity) * 100 : 0)}
                duration={800}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span style={{ color: '#78716c' }} className="text-xs">
                {farm.capacity > 0 ? Math.round((chicksAlive / farm.capacity) * 100) : 0}% occupied
              </span>
              <span style={{ color: '#78716c' }} className="text-xs">
                {remainingCapacity.toLocaleString('en-IN')} spots remaining
              </span>
            </div>
          </div>

          {/* ── 2. Batch Stats ─────────────────────────────────────────── */}
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold mb-4">Batch Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <div style={{ backgroundColor: '#f0fdf4' }} className="text-center p-4 rounded-xl">
                <p style={{ color: '#15803d' }} className="text-3xl font-extrabold">{activeBatchCount}</p>
                <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">Active Batches</p>
              </div>
              <div style={{ backgroundColor: '#fafaf5', borderColor: '#e7e5e0' }} className="text-center p-4 rounded-xl border">
                <p style={{ color: '#1c1917' }} className="text-3xl font-extrabold">{batches.length}</p>
                <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">Total Batches</p>
              </div>
              <div style={{ backgroundColor: '#fef2f2' }} className="text-center p-4 rounded-xl">
                <p style={{ color: '#dc2626' }} className="text-3xl font-extrabold">{totalMortality.toLocaleString('en-IN')}</p>
                <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">Total Mortality</p>
              </div>
              {(() => {
                const fcrBatches = batches.filter(b => b.fcr != null)
                const avgFCR = fcrBatches.length > 0 ? fcrBatches.reduce((s, b) => s + Number(b.fcr), 0) / fcrBatches.length : null
                const bestFCR = fcrBatches.length > 0 ? Math.min(...fcrBatches.map(b => Number(b.fcr))) : null
                const color = avgFCR == null ? '#78716c' : avgFCR <= 1.8 ? '#15803d' : avgFCR <= 2.1 ? '#2563eb' : avgFCR <= 2.5 ? '#d97706' : '#dc2626'
                const bg    = avgFCR == null ? '#fafaf5' : avgFCR <= 1.8 ? '#f0fdf4' : avgFCR <= 2.1 ? '#eff6ff' : avgFCR <= 2.5 ? '#fffbeb' : '#fef2f2'
                return (
                  <div style={{ backgroundColor: bg }} className="text-center p-4 rounded-xl">
                    <p style={{ color }} className="text-3xl font-extrabold">{avgFCR != null ? avgFCR.toFixed(2) : '—'}</p>
                    <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">Avg FCR{bestFCR != null ? ` · Best: ${bestFCR.toFixed(2)}` : ''}</p>
                  </div>
                )
              })()}
              {(() => {
                const minDays = activeBatchesList.length > 0
                  ? Math.min(...activeBatchesList.map(b => 45 - daysElapsed(b.start_date)))
                  : null
                const bg = minDays === null ? '#fafaf5' : minDays < 0 ? '#fef2f2' : minDays <= 7 ? '#fffbeb' : '#f0fdf4'
                const col = minDays === null ? '#78716c' : minDays < 0 ? '#dc2626' : minDays <= 7 ? '#d97706' : '#15803d'
                return (
                  <div style={{ backgroundColor: bg }} className="text-center p-4 rounded-xl">
                    <p style={{ color: col }} className="text-3xl font-extrabold">{daysToHarvest}</p>
                    <p style={{ color: '#78716c' }} className="text-xs mt-1.5 font-medium">Days to Harvest</p>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── 3. Financial Summary ───────────────────────────────────── */}
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold mb-4">Financial Summary</h3>

            {/* Stacked bar */}
            <div style={{ height: 20, backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
              {revenue > 0 ? (
                <StackedBar duration={600} segments={[
                  { pct: Math.min((chickCost   / revenue) * 100, 100), color: '#fca5a5' },
                  { pct: Math.min((feedCost    / revenue) * 100, 100), color: '#fdba74' },
                  { pct: Math.min((medicineCost/ revenue) * 100, 100), color: '#fde047' },
                  ...(grossProfit > 0 ? [{ pct: Math.min((grossProfit / revenue) * 100, 100), color: '#15803d' }] : []),
                ]} />
              ) : null}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: '#78716c' }}>
              {[
                { color: '#fca5a5', label: 'Chick Cost' },
                { color: '#fdba74', label: 'Feed Cost' },
                { color: '#fde047', label: 'Medicine' },
                ...(grossProfit > 0 ? [{ color: '#15803d', label: 'Profit' }] : []),
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color, display: 'inline-block' }} />
                  {l.label}
                </span>
              ))}
            </div>

            {/* Breakdown rows */}
            <div>
              {[
                { label: 'Total Revenue',  value: fmt(revenue),      color: '#15803d', bold: false },
                { label: 'Chick Cost',     value: fmt(chickCost),    color: '#dc2626', bold: false },
                { label: 'Feed Cost',      value: fmt(feedCost),     color: '#dc2626', bold: false },
                { label: 'Medicine Cost',  value: fmt(medicineCost), color: '#dc2626', bold: false },
                { label: 'Total Expenses', value: fmt(totalCost),    color: '#dc2626', bold: true  },
                { label: 'Gross Profit',   value: (grossProfit < 0 ? '−' : '') + fmt(Math.abs(grossProfit)), color: grossProfit >= 0 ? '#15803d' : '#dc2626', bold: true },
                { label: 'Profit Margin',  value: `${margin.toFixed(1)}%`, color: margin >= 0 ? '#15803d' : '#dc2626', bold: false },
              ].map((row, i) => (
                <div key={row.label}
                  className="flex justify-between items-center py-2"
                  style={{ borderBottom: i < 6 ? '1px solid #f5f5f4' : 'none' }}
                >
                  <span style={{ color: '#78716c', fontWeight: row.bold ? 600 : 400 }} className="text-sm">{row.label}</span>
                  <span style={{ color: row.color, fontWeight: row.bold ? 800 : 600 }} className="text-sm">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Growing Fee Summary ────────────────────────────────────── */}
          {(() => {
            const hasActiveBatch = batches.some(b => b.status === 'active')
            const totalFee   = growingFeeLedger.reduce((s, r) => s + Number(r.total_fee || 0), 0)
            const totalPaid  = growingFeeLedger.reduce((s, r) => s + Number(r.amount_paid || 0), 0)
            const outstanding= growingFeeLedger.reduce((s, r) => s + Number(r.balance_due || 0), 0)
            const activeAdvTotal = farmAdvances.reduce((s, r) => s + Number(r.amount || 0), 0)

            if (!hasActiveBatch && growingFeeLedger.length === 0) return null
            return (
              <div style={{ backgroundColor: '#fffffe', borderColor: outstanding > 0 ? '#fca5a5' : '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold">Growing Fee</h3>
                  {outstanding > 0 && (
                    <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-red-100 text-red-600">
                      ₹{outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })} outstanding
                    </span>
                  )}
                  {outstanding === 0 && growingFeeLedger.length > 0 && (
                    <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-green-100 text-green-700">Fully Paid ✓</span>
                  )}
                </div>
                {growingFeeLedger.length > 0 && (
                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex justify-between">
                      <span style={{ color: '#78716c' }}>Total Fee Accrued</span>
                      <span className="font-semibold" style={{ color: '#1c1917' }}>₹{totalFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: '#78716c' }}>Total Paid</span>
                      <span className="font-semibold text-green-700">₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-100">
                      <span style={{ color: '#78716c' }}>Balance Due</span>
                      <span className="font-bold" style={{ color: outstanding > 0 ? '#dc2626' : '#15803d' }}>
                        ₹{outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
                {hasActiveBatch && activeAdvTotal > 0 && (
                  <div className="text-sm mb-3 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                    <span style={{ color: '#78716c' }}>Advances (active batches): </span>
                    <span className="font-semibold text-amber-700">₹{activeAdvTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {outstanding > 0 && (
                    <a href="/growing-fees" className="flex-1 text-center rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition">
                      Record Payment →
                    </a>
                  )}
                  {hasActiveBatch && outstanding === 0 && (
                    <button
                      onClick={() => { setAdvanceBatchId(null); setAdvanceModal(true) }}
                      className="flex-1 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 px-4 py-2 text-sm font-semibold transition"
                    >
                      Give Advance
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── 4. Recent Activity ─────────────────────────────────────── */}
          <div style={{ backgroundColor: '#fffffe', borderColor: '#e7e5e0' }} className="rounded-xl border shadow-sm p-5">
            <h3 style={{ color: '#1c1917' }} className="text-sm font-semibold mb-4">Recent Activity</h3>
            {events.length === 0 ? (
              <p style={{ color: '#78716c' }} className="text-sm text-center py-6">No activity yet</p>
            ) : (
              <div>
                {events.map((ev, i) => {
                  const cfg = {
                    batch:   { emoji: '🐣', bg: '#fef9c3', border: '#fde047', label: 'Batch'   },
                    dist:    { emoji: '🌾', bg: '#dbeafe', border: '#93c5fd', label: 'Supply'  },
                    sale:    { emoji: '💰', bg: '#dcfce7', border: '#86efac', label: 'Sale'    },
                    payment: { emoji: '💳', bg: '#ede9fe', border: '#c4b5fd', label: 'Payment' },
                  }[ev.type] ?? { emoji: '📌', bg: '#f3f4f6', border: '#d1d5db', label: ev.type }
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 pb-3 last:pb-0"
                      style={{
                        borderBottom: i < events.length - 1 ? '1px solid #f5f5f4' : 'none',
                        animation: `ovFadeUp 0.4s ease-out ${i * 70}ms both`,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                        style={{ backgroundColor: cfg.bg, border: `1.5px solid ${cfg.border}`, marginTop: 2 }}
                      >
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: '#1c1917' }} className="text-sm font-medium">{ev.label}</p>
                        <p style={{ color: '#78716c' }} className="text-xs mt-0.5">{fmtDate(ev.date)}</p>
                      </div>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: cfg.bg, color: '#44403c' }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BATCHES TAB */}
      {activeTab === 'Batches' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Batches</h2>
            <button
              onClick={() => setBatchModal(true)}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              + Start New Batch
            </button>
          </div>

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Status filter */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                {['active', 'sold', 'closed', 'all'].map(s => (
                  <button
                    key={s}
                    onClick={() => setBatchStatusFilter(s)}
                    className={`px-3 py-1.5 transition ${
                      batchStatusFilter === s
                        ? 'bg-green-600 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Date range */}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>From</span>
                <input
                  type="date"
                  value={batchDateFrom}
                  onChange={e => setBatchDateFrom(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <span>To</span>
                <input
                  type="date"
                  value={batchDateTo}
                  onChange={e => setBatchDateTo(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>

              {/* Search */}
              <input
                type="text"
                value={batchSearch}
                onChange={e => setBatchSearch(e.target.value)}
                placeholder="Search by date or ID…"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400 w-44"
              />

              {/* Clear button */}
              {batchFiltersActive && (
                <button
                  onClick={() => { setBatchStatusFilter('active'); setBatchDateFrom(''); setBatchDateTo(''); setBatchSearch('') }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Results count */}
            <p className="text-xs text-gray-400">Showing {filteredBatches.length} batch{filteredBatches.length !== 1 ? 'es' : ''}</p>
          </div>

          {/* Empty state */}
          {filteredBatches.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <p className="text-4xl mb-2">🐣</p>
              {batchStatusFilter === 'active' && !batchDateFrom && !batchDateTo && !batchSearch ? (
                <>
                  <p className="text-sm font-medium text-gray-600 mb-3">No active batches for this farm</p>
                  <button
                    onClick={() => setBatchModal(true)}
                    className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    Start New Batch
                  </button>
                </>
              ) : (
                <p className="text-sm">No batches match your filters.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Start Date</th>
                    <th className="px-5 py-3 text-right">Chicks</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3 text-center">Day</th>
                    <th className="px-5 py-3 text-right">Expenses</th>
                    <th className="px-5 py-3 text-right">Revenue</th>
                    <th className="px-5 py-3 text-right">Profit</th>
                    <th className="px-5 py-3 text-center">FCR</th>
                    <th className="px-5 py-3 text-right">Growing Fee</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredBatches.map(b => {
                    const elapsed       = daysElapsed(b.start_date)
                    const isActive      = b.status === 'active'
                    const isApproaching = isActive && elapsed >= 40 && elapsed <= 45
                    const isOverdue     = isActive && elapsed > 45
                    const bExp   = batchExpenses[b.id] || 0
                    const bRev   = batchRevenue[b.id]  || 0
                    const bProfit = bRev - bExp

                    const dayBg    = isOverdue ? '#fef2f2' : isApproaching ? '#fffbeb' : '#f0fdf4'
                    const dayColor = isOverdue ? '#dc2626' : isApproaching ? '#d97706' : '#15803d'
                    const rowBorderLeft = isOverdue ? '4px solid #dc2626' : isApproaching ? '4px solid #d97706' : 'none'

                    return (
                      <tr
                        key={b.id}
                        className="hover:bg-amber-50/30 transition cursor-pointer"
                        style={{ borderLeft: rowBorderLeft }}
                        onClick={() => navigate(`/farms/${id}/batches/${b.id}`)}
                      >
                        <td className="px-5 py-4 font-medium text-gray-800">{fmtDate(b.start_date)}</td>
                        <td className="px-5 py-4 text-right text-gray-700">{Number(b.chick_count).toLocaleString('en-IN')}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                            ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ backgroundColor: dayBg, color: dayColor }}>
                            {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />}
                            {isApproaching && '⚠️ '}
                            Day {elapsed}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-medium text-red-600">
                          {bExp > 0 ? fmt(bExp) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-green-700">
                          {bRev > 0 ? fmt(bRev) : '—'}
                        </td>
                        <td className="px-5 py-4 text-right font-bold"
                          style={{ color: bRev > 0 ? (bProfit >= 0 ? '#15803d' : '#dc2626') : '#9ca3af' }}>
                          {bRev > 0 ? ((bProfit < 0 ? '−' : '') + fmt(Math.abs(bProfit))) : '—'}
                        </td>
                        <td className="px-5 py-4 text-center">
                          {b.fcr != null ? (() => {
                            const fcr = Number(b.fcr)
                            const color = fcr <= 1.8 ? '#15803d' : fcr <= 2.1 ? '#2563eb' : fcr <= 2.5 ? '#d97706' : '#dc2626'
                            const bg    = fcr <= 1.8 ? '#f0fdf4' : fcr <= 2.1 ? '#eff6ff' : fcr <= 2.5 ? '#fffbeb' : '#fef2f2'
                            return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ backgroundColor: bg, color }}>{fcr.toFixed(2)}</span>
                          })() : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {(() => {
                            const fee = growingFeeLedger.find(f => f.batch_id === b.id)
                            if (!fee) {
                              return <span className="text-gray-300 text-xs">—</span>
                            }
                            const statusColor = fee.status === 'paid' ? '#15803d' : fee.status === 'partial' ? '#d97706' : '#dc2626'
                            const statusBg    = fee.status === 'paid' ? '#f0fdf4'  : fee.status === 'partial' ? '#fffbeb'  : '#fef2f2'
                            return (
                              <div className="text-right">
                                <div className="text-xs font-semibold" style={{ color: '#1c1917' }}>
                                  ₹{Number(fee.total_fee).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                </div>
                                <span className="inline-flex mt-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold capitalize" style={{ backgroundColor: statusBg, color: statusColor }}>
                                  {fee.status}
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => setEditingBatch(b)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DISTRIBUTIONS TAB */}
      {activeTab === 'Distributions' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Distribution History ({distributions.length})</h2>
            <button
              onClick={() => setDistModal(true)}
              className="rounded-lg bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              + Record Distribution
            </button>
          </div>

          {/* Filter toggle bar */}
          <div className="flex gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
            {['all', 'feed', 'medicine'].map(f => (
              <button key={f} onClick={() => setDistFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  distFilter === f ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {filteredDists.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <p className="text-4xl mb-2">📦</p>
              <p className="text-sm">No distributions recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3 text-right">Quantity</th>
                    <th className="px-5 py-3 text-right">Cost</th>
                    <th className="px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredDists.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 text-gray-600">{fmtDate(d.date)}</td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {d.batches?.start_date ? `Batch ${fmtDate(d.batches.start_date)}` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
                          ${d.type === 'feed'     ? 'bg-green-100 text-green-700' :
                            d.type === 'medicine' ? 'bg-blue-100  text-blue-700'  :
                            'bg-gray-100 text-gray-600'}`}>
                          {d.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-gray-800">{d.item_name}</td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {Number(d.quantity).toLocaleString('en-IN')} {d.unit}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700">
                        {fmt(distCostMap[d.id] || 0)}
                      </td>
                      <td className="px-5 py-3 text-gray-400 italic text-xs">{d.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-gray-700 text-right">Total Cost</td>
                    <td className="px-5 py-3 text-right font-bold text-red-600">{fmt(feedCost + medicineCost)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SALES TAB */}
      {activeTab === 'Sales' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Sales ({sales.length})</h2>
            <button
              onClick={() => setSaleModal(true)}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              + Record Sale
            </button>
          </div>

          {sales.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <p className="text-4xl mb-2">💰</p>
              <p className="text-sm">No sales recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Vendor</th>
                    <th className="px-5 py-3 text-right">Kg Sold</th>
                    <th className="px-5 py-3 text-right">Price / kg</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sales.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 text-gray-600">{fmtDate(s.date)}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">{s.vendors?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-right text-gray-700">{Number(s.kg_sold).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{fmt(s.price_per_kg)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-green-700">{fmt(s.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-gray-700 text-right">Total Revenue</td>
                    <td className="px-5 py-3 text-right font-bold text-green-700">{fmt(revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* FARM STOCK TAB */}
      {activeTab === 'Farm Stock' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden max-w-[900px] mx-auto w-full">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Stock at Farm</h2>
              <p className="text-xs text-gray-400 mt-0.5">Items physically present at this farm. Updated automatically on distribution. Adjust after physical stocktake.</p>
            </div>
            <button
              onClick={() => setDistModal(true)}
              className="rounded-lg bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              + Distribute More
            </button>
          </div>

          {farmStock.length === 0 ? (
            <div className="py-14 text-center text-gray-400">
              <p className="text-4xl mb-2">📦</p>
              <p className="text-sm font-medium text-gray-500 mb-1">No stock at this farm yet</p>
              <p className="text-xs">Record a distribution to add items to this farm's stock.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-5 py-3 text-right">On Hand</th>
                    <th className="px-5 py-3 text-right">Last Updated</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {farmStock.map(fs => {
                    const low = Number(fs.quantity_on_hand) <= 0
                    return (
                      <tr key={fs.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-4 font-medium text-gray-800">{fs.item_name}</td>
                        <td className="px-5 py-4 text-right">
                          <span className={`font-semibold text-base ${low ? 'text-red-600' : 'text-gray-900'}`}>
                            {Number(fs.quantity_on_hand).toLocaleString('en-IN')}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{fs.unit}</span>
                          {low && <span className="ml-2 text-xs text-red-500 font-medium">⚠ Empty</span>}
                        </td>
                        <td className="px-5 py-4 text-right text-xs text-gray-400">
                          {fmtDate(fs.updated_at)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={() => setEditingFarmStock(fs)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────────── */}
      {editModal    && <FarmEditModal  farm={farm}          onClose={() => setEditModal(false)}    onSaved={() => { setEditModal(false);    refresh() }} />}
      {batchModal   && <NewBatchModal farmId={id}          onClose={() => setBatchModal(false)}   onSaved={() => { setBatchModal(false);   refresh() }} />}
      {editingBatch && <EditBatchModal batch={editingBatch} onClose={() => setEditingBatch(null)} onSaved={() => { setEditingBatch(null); refresh() }} />}
      {distModal  && <DistributionModal farmId={id} stock={stock} onClose={() => setDistModal(false)} onSaved={() => { setDistModal(false); refresh() }} />}
      {saleModal  && <SaleModal        activeBatch={activeBatch} vendors={vendors} onClose={() => setSaleModal(false)} onSaved={() => { setSaleModal(false); refresh() }} />}
      {editingFarmStock && (
        <FarmStockAdjustModal
          item={editingFarmStock}
          onClose={() => setEditingFarmStock(null)}
          onSaved={() => { setEditingFarmStock(null); refresh() }}
        />
      )}
      {advanceModal && (
        <GiveAdvanceModal
          farm={farm}
          batches={batches}
          initialBatchId={advanceBatchId}
          onClose={() => { setAdvanceModal(false); setAdvanceBatchId(null) }}
          onSaved={() => { setAdvanceModal(false); setAdvanceBatchId(null); fetchAll() }}
        />
      )}
    </div>
  )
}
