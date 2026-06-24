import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn, ledgerOut, getChickBalance } from '../lib/stockLedger'
import { formatCurrency } from '../utils/format'

const GROW_OUT_DAYS = 45

function daysElapsed(startDate) {
  const start = new Date(startDate + 'T00:00:00')
  return Math.floor((Date.now() - start.getTime()) / 86400000)
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function urgency(status, startDate) {
  if (status !== 'active') return 'inactive'
  const e = daysElapsed(startDate)
  if (e > GROW_OUT_DAYS) return 'overdue'
  if (e >= 40)           return 'approaching'
  return 'ok'
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active: 'bg-green-100 text-green-700',
    sold:   'bg-blue-100  text-blue-600',
    closed: 'bg-gray-100  text-gray-500',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? map.closed}`}>
      {status}
    </span>
  )
}

// ─── Day badge ────────────────────────────────────────────────────────────────

function DayBadge({ status, startDate }) {
  if (status !== 'active') return <span className="text-gray-400 text-sm">—</span>

  const elapsed  = daysElapsed(startDate)
  const u        = urgency(status, startDate)
  const bg    = u === 'overdue' ? '#fef2f2' : u === 'approaching' ? '#fffbeb' : '#f0fdf4'
  const color = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : '#15803d'

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold"
      style={{ backgroundColor: bg, color }}>
      {u === 'overdue'     && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />}
      {u === 'approaching' && '⚠️ '}
      Day {elapsed}
    </span>
  )
}

// ─── Harvest status label ─────────────────────────────────────────────────────

function HarvestLabel({ status, startDate }) {
  if (status !== 'active') return <span className="text-gray-400 text-xs">—</span>
  const elapsed   = daysElapsed(startDate)
  const daysLeft  = GROW_OUT_DAYS - elapsed
  const u         = urgency(status, startDate)
  const color     = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : '#6b7280'
  const label     = u === 'overdue'
    ? `${Math.abs(daysLeft)}d overdue`
    : `${daysLeft}d to harvest`
  return <span className="text-xs font-semibold" style={{ color }}>{label}</span>
}

// ─── New batch modal ──────────────────────────────────────────────────────────

function NewBatchModal({ farms, onClose, onSaved }) {
  const [form, setForm] = useState({
    farm_id:     farms[0]?.id ?? '',
    chick_count: '',
    start_date:  new Date().toISOString().slice(0, 10),
  })
  // Purchase fields (shown when stock is insufficient)
  const [pricePerChick, setPricePerChick] = useState('')
  const [supplierId,    setSupplierId]    = useState('')
  const [payNow,        setPayNow]        = useState(false)
  const [accountId,     setAccountId]     = useState('')

  const [chickBalance,    setChickBalance]    = useState(null)  // null = loading
  const [suppliers,       setSuppliers]       = useState([])
  const [accounts,        setAccounts]        = useState([])
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => {
    async function load() {
      const [balance, { data: sups }, { data: accs }] = await Promise.all([
        getChickBalance(),
        supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).order('name'),
      ])
      setChickBalance(balance)
      setSuppliers(sups || [])
      const accList = accs || []
      setAccounts(accList)
      const cash = accList.find(a => a.type === 'cash')
      if (cash) setAccountId(cash.id)
    }
    load()
  }, [])

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const chickCount    = Number(form.chick_count) || 0
  const needsPurchase = chickBalance !== null && chickCount > 0 && chickBalance < chickCount
  const totalCost     = needsPurchase ? chickCount * (parseFloat(pricePerChick) || 0) : 0

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (needsPurchase && !pricePerChick) {
      setError('Enter price per chick to record the purchase')
      return
    }

    setSaving(true)

    // If not enough chicks in stock: auto-create procurement record first
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

      // Add to stock ledger (IN)
      await ledgerIn({
        itemName:      'Chicks',
        itemType:      'chicks',
        quantity:      chickCount,
        unit:          'birds',
        referenceType: 'procurement',
        referenceId:   proc.id,
        date:          form.start_date,
      })

      // Record cash outflow only if Pay now is checked
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
      // If not paying now: procurement is unpaid → auto-appears in Supplier Dues
    }

    // Create the batch
    const { data: inserted, error: batchErr } = await supabase.from('batches').insert({
      farm_id:     form.farm_id,
      chick_count: chickCount,
      start_date:  form.start_date,
      status:      'active',
    }).select('id').single()

    if (batchErr) { setError(batchErr.message); setSaving(false); return }

    // Deduct chicks from stock ledger (OUT)
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

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Start New Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
            <select
              required
              value={form.farm_id}
              onChange={set('farm_id')}
              className={inputCls + ' bg-white'}
            >
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chick Count *</label>
            <input
              required
              type="number"
              min="1"
              value={form.chick_count}
              onChange={set('chick_count')}
              placeholder="e.g. 3000"
              className={inputCls}
            />
            {/* Stock availability indicator */}
            {chickBalance !== null && (
              <p className={`text-xs mt-1 font-medium ${
                chickBalance === 0
                  ? 'text-red-600'
                  : chickCount > chickBalance
                  ? 'text-orange-600'
                  : 'text-green-600'
              }`}>
                {chickBalance === 0
                  ? '⚠ No chicks in stock — purchase details required below'
                  : chickCount > chickBalance
                  ? `⚠ Only ${chickBalance.toLocaleString('en-IN')} chicks in stock — ${(chickCount - chickBalance).toLocaleString('en-IN')} will be purchased`
                  : `✓ ${chickBalance.toLocaleString('en-IN')} chicks available in stock`}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input
              required
              type="date"
              value={form.start_date}
              onChange={set('start_date')}
              className={inputCls}
            />
          </div>

          {/* ── Purchase section (shown when stock is insufficient) ── */}
          {needsPurchase && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Chick Purchase Details
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price per Chick (₹) *</label>
                  <input
                    required={needsPurchase}
                    type="number" min="0.01" step="0.01"
                    value={pricePerChick}
                    onChange={e => setPricePerChick(e.target.value)}
                    placeholder="e.g. 28.50"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost</label>
                  <div className="flex items-center h-[38px] rounded-lg bg-white border border-gray-200 px-3 text-sm font-semibold text-amber-700">
                    {totalCost > 0 ? formatCurrency(totalCost) : '—'}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier <span className="text-gray-400 font-normal">(optional)</span></label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  className={inputCls + ' bg-white'}
                >
                  <option value="">No supplier / unknown</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  If no supplier is selected, the cost won't appear in Supplier Dues.
                </p>
              </div>

              {/* Pay now checkbox */}
              {accounts.length > 0 && (
                <div className="rounded-lg border border-amber-100 bg-white px-3 py-3 space-y-3">
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
                  {payNow && (
                    <select
                      value={accountId}
                      onChange={e => setAccountId(e.target.value)}
                      className={inputCls + ' bg-white'}
                    >
                      <option value="">— select account —</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving || chickBalance === null}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? 'Saving…' : chickBalance === null ? 'Loading…' : 'Start Batch'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Mark as sold confirmation ────────────────────────────────────────────────

function SoldModal({ batch, onClose, onSaved }) {
  const [mortality,   setMortality]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [salesCount,  setSalesCount]  = useState(null) // null = loading

  useEffect(() => {
    supabase.from('sales').select('id', { count: 'exact', head: true }).eq('batch_id', batch.id)
      .then(({ count }) => setSalesCount(count ?? 0))
  }, [batch.id])

  async function handleConfirm() {
    if (salesCount === 0) {
      setError('Cannot mark as sold — record at least one sale for this batch first.')
      return
    }
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('batches')
      .update({
        status:          'sold',
        mortality_count: mortality !== '' ? Number(mortality) : 0,
        sold_at:         today,
      })
      .eq('id', batch.id)

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  const loadingSales = salesCount === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Mark as Sold</h2>
        <p className="text-sm text-gray-600 mb-4">
          Batch at <span className="font-semibold">{batch.farms?.name}</span> · started {formatDate(batch.start_date)}
        </p>

        {/* Sales check banner */}
        {!loadingSales && salesCount === 0 && (
          <div className="mb-4 rounded-lg px-3 py-2 bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            ⚠ No sales recorded for this batch. Record at least one sale before marking as sold.
          </div>
        )}
        {!loadingSales && salesCount > 0 && (
          <div className="mb-4 rounded-lg px-3 py-2 bg-green-50 border border-green-200 text-sm text-green-700">
            ✓ {salesCount} sale{salesCount > 1 ? 's' : ''} recorded
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mortality Count <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="number" min="0" max={batch.chick_count}
            value={mortality} onChange={e => setMortality(e.target.value)}
            placeholder="0 birds lost"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {mortality !== '' && Number(mortality) > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Survival rate: {(((batch.chick_count - Number(mortality)) / batch.chick_count) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || loadingSales || salesCount === 0}
            className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
          >
            {saving ? 'Updating…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Batches() {
  const navigate = useNavigate()
  const [batches, setBatches]       = useState([])
  const [farms, setFarms]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [newModal, setNewModal]     = useState(false)
  const [soldBatch, setSoldBatch]   = useState(null)
  const [filter, setFilter]         = useState('active') // 'all' | 'active' | 'sold' | 'closed'
  const [sort, setSort]             = useState('chicks') // 'chicks' | 'days'

  async function fetchData() {
    setLoading(true)
    const [{ data: batchData }, { data: farmData }] = await Promise.all([
      supabase
        .from('batches')
        .select('*, farms(name), sold_at, closed_at')
        .order('start_date', { ascending: false }),
      supabase.from('farms').select('id, name').order('name'),
    ])
    setBatches(batchData || [])
    setFarms(farmData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const counts = {
    all:    batches.length,
    active: batches.filter(b => b.status === 'active').length,
    sold:   batches.filter(b => b.status === 'sold').length,
    closed: batches.filter(b => b.status === 'closed').length,
  }

  const visible = (filter === 'all' ? batches : batches.filter(b => b.status === filter))
    .slice()
    .sort((a, b) =>
      sort === 'days'
        ? daysElapsed(b.start_date) - daysElapsed(a.start_date)       // most urgent first
        : Number(b.chick_count || 0) - Number(a.chick_count || 0)     // most chicks first
    )

  const overdueCount = batches.filter(b => urgency(b.status, b.start_date) === 'overdue').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Batches</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all your grow-out cycles</p>
        </div>
        <button
          onClick={() => setNewModal(true)}
          disabled={farms.length === 0}
          title={farms.length === 0 ? 'Add a farm first' : ''}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> New Batch
        </button>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
          <span className="text-sm font-bold text-red-700">
            {overdueCount} batch{overdueCount > 1 ? 'es' : ''} overdue — harvest immediately
          </span>
        </div>
      )}

      {/* Filter + Sort bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',    label: `All (${counts.all})` },
            { key: 'active', label: `Active (${counts.active})` },
            { key: 'sold',   label: `Sold (${counts.sold})` },
            { key: 'closed', label: `Closed (${counts.closed})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
                filter === key
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <span className="text-xs text-gray-400 px-2 font-medium">Sort:</span>
          {[
            { key: 'chicks', label: '🐣 Chicks' },
            { key: 'days',   label: '📅 Days' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                sort === key
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🐣</span>
            <p className="text-sm font-medium">No batches found</p>
            <p className="text-xs mt-1">
              {filter !== 'all' ? 'Try switching the filter above' : 'Click "New Batch" to start one'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Farm</th>
                <th className="px-5 py-3">Start Date</th>
                {filter === 'sold'   && <th className="px-5 py-3">Sold On</th>}
                {filter === 'closed' && <th className="px-5 py-3">Closed On</th>}
                <th className="px-5 py-3 text-right">Chicks</th>
                <th className="px-5 py-3 text-center">Day</th>
                <th className="px-5 py-3 text-center">Harvest</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map(batch => {
                const u = urgency(batch.status, batch.start_date)
                const borderColor = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : u === 'ok' ? '#15803d' : 'transparent'
                return (
                  <tr
                    key={batch.id}
                    className="hover:bg-amber-50/40 transition cursor-pointer"
                    style={{ borderLeft: `4px solid ${borderColor}` }}
                    onClick={() => navigate(`/farms/${batch.farm_id}/batches/${batch.id}`)}
                  >
                    <td className="px-5 py-4 font-medium text-gray-800">
                      {batch.farms?.name ?? '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {formatDate(batch.start_date)}
                    </td>
                    {filter === 'sold'   && <td className="px-5 py-4 text-gray-600">{batch.sold_at   ? formatDate(batch.sold_at)   : '—'}</td>}
                    {filter === 'closed' && <td className="px-5 py-4 text-gray-600">{batch.closed_at ? formatDate(batch.closed_at) : '—'}</td>}
                    <td className="px-5 py-4 text-right text-gray-700 font-medium">
                      {Number(batch.chick_count).toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <DayBadge status={batch.status} startDate={batch.start_date} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <HarvestLabel status={batch.status} startDate={batch.start_date} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-2" onClick={e => e.stopPropagation()}>
                        {batch.status === 'active' ? (
                          <button
                            onClick={() => setSoldBatch(batch)}
                            className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 transition"
                          >
                            Mark as Sold
                          </button>
                        ) : (
                          <Link
                            to={`/batches/${batch.id}/report`}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                          >
                            View Report
                          </Link>
                        )}
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

      {/* Modals */}
      {newModal && (
        <NewBatchModal
          farms={farms}
          onClose={() => setNewModal(false)}
          onSaved={() => { setNewModal(false); fetchData() }}
        />
      )}
      {soldBatch && (
        <SoldModal
          batch={soldBatch}
          onClose={() => setSoldBatch(null)}
          onSaved={() => { setSoldBatch(null); fetchData() }}
        />
      )}
    </div>
  )
}
