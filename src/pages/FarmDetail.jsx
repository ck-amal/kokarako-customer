import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ledgerOut, getAverageCostPerUnit } from '../lib/stockLedger'

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

// ─── Farm Edit Modal ──────────────────────────────────────────────────────────

function FarmEditModal({ farm, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:         farm.name         ?? '',
    location:     farm.location     ?? '',
    capacity:     farm.capacity     ?? '',
    phone_number: farm.phone_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('farms').update({
      name:         form.name.trim(),
      location:     form.location.trim() || null,
      capacity:     Number(form.capacity),
      phone_number: form.phone_number.trim() || null,
    }).eq('id', farm.id)
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Edit Farm</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
    status:          batch.status,
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
      status:          form.status,
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
            <select value={form.status} onChange={set('status')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="active">Active</option>
              <option value="sold">Sold</option>
              <option value="closed">Closed</option>
            </select>
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
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('batches').insert({
      farm_id:     farmId,
      chick_count: Number(form.chick_count),
      start_date:  form.start_date,
      status:      'active',
    })
    setSaving(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Start New Batch</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Chicks *</label>
            <input required type="number" min="1" value={form.chick_count} onChange={set('chick_count')}
              placeholder="e.g. 2000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
            <input required type="date" value={form.start_date} onChange={set('start_date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Start Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Distribution Modal ───────────────────────────────────────────────────────

function DistributionModal({ farmId, stock, onClose, onSaved }) {
  const [form, setForm] = useState({
    type:     'feed',
    stock_id: stock.length ? stock[0].id : '',
    quantity: '',
    date:     new Date().toISOString().slice(0, 10),
    notes:    '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const selectedStock = stock.find(s => s.id === form.stock_id)

  async function handleSubmit(e) {
    e.preventDefault()
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
      distribution_id: distInserted.id,
      item_name:       selectedStock.item_name,
      item_type:       form.type,
      quantity:        qty,
      unit:            selectedStock.unit,
      cost_per_unit:   avgCpu,
      total_cost:      qty * avgCpu,
      date:            form.date,
    })

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
    vendor_id:    vendors.length ? vendors[0].id : '',
    kg_sold:      '',
    price_per_kg: '',
    date:         new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const total = form.kg_sold && form.price_per_kg
    ? (parseFloat(form.kg_sold) * parseFloat(form.price_per_kg)).toFixed(2)
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('sales').insert({
      batch_id:     activeBatch.id,
      vendor_id:    form.vendor_id,
      kg_sold:      parseFloat(form.kg_sold),
      price_per_kg: parseFloat(form.price_per_kg),
      date:         form.date,
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

          <div className="grid grid-cols-2 gap-3">
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FarmDetail() {
  const { id } = useParams()

  const [farm,                 setFarm]                = useState(null)
  const [batches,              setBatches]             = useState([])
  const [distributions,        setDistributions]       = useState([])
  const [sales,                setSales]               = useState([])
  const [farmExpenses,         setFarmExpenses]        = useState([])
  const [allChickProcurement,  setAllChickProcurement] = useState([])
  const [allBatchesChickTotal, setAllBatchesChickTotal]= useState(0)
  const [stock,                setStock]               = useState([])
  const [vendors,              setVendors]             = useState([])
  const [loading,              setLoading]             = useState(true)

  const [editModal,      setEditModal]      = useState(false)
  const [batchModal,     setBatchModal]     = useState(false)
  const [editingBatch,   setEditingBatch]   = useState(null)
  const [distModal,      setDistModal]      = useState(false)
  const [saleModal,      setSaleModal]      = useState(false)

  async function fetchAll() {
    // Phase 1: farm + this farm's batches
    const [{ data: farmData }, { data: batchData }] = await Promise.all([
      supabase.from('farms').select('*').eq('id', id).single(),
      supabase.from('batches')
        .select('id, start_date, chick_count, status, mortality_count')
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
      salesResult,
    ] = await Promise.all([
      supabase.from('distributions').select('*').eq('farm_id', id).order('date', { ascending: false }),
      supabase.from('stock').select('id, item_name, quantity, unit').gt('quantity', 0).order('item_name'),
      supabase.from('vendors').select('id, name').order('name'),
      supabase.from('procurement').select('cost, quantity').eq('type', 'chicks'),
      supabase.from('batches').select('chick_count'),
      supabase.from('farm_expenses').select('*').eq('farm_id', id),
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
    setSales(salesResult.data || [])
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

  // Per-batch feed kg and medicine qty from distributions
  const batchFeedKg  = {}
  const batchMedQty  = {}
  for (const d of distributions) {
    if (d.type === 'feed')     batchFeedKg['farm']  = (batchFeedKg['farm']  || 0) + Number(d.quantity || 0)
    if (d.type === 'medicine') batchMedQty['farm']  = (batchMedQty['farm']  || 0) + Number(d.quantity || 0)
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/farms" className="hover:text-amber-600 transition">Farms</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{farm.name}</span>
      </div>

      {/* ─── Farm Profile Card ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center text-3xl flex-shrink-0">
              🏡
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{farm.name}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5 text-sm text-gray-500">
                {farm.location     && <span>📍 {farm.location}</span>}
                <span>🐔 {Number(farm.capacity).toLocaleString('en-IN')} bird capacity</span>
                {farm.phone_number && <span>📞 {farm.phone_number}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditModal(true)}
            className="flex-shrink-0 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Edit
          </button>
        </div>
      </div>

      {/* ─── Active Batch Quick Stats ────────────────────────────────────── */}
      {activeBatch && (() => {
        const elapsed   = daysElapsed(activeBatch.start_date)
        const remaining = 45 - elapsed
        const alive     = Number(activeBatch.chick_count) - Number(activeBatch.mortality_count || 0)
        const harvestDate = new Date(new Date(activeBatch.start_date).getTime() + 45 * 86400000)
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🔥</span>
              <h2 className="text-base font-semibold text-amber-900">Active Batch — Live Stats</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Chicks Alive',  value: alive.toLocaleString('en-IN'), color: 'text-amber-900' },
                { label: 'Days Elapsed',  value: `${elapsed}d`,                 color: 'text-amber-900' },
                {
                  label: remaining >= 0 ? 'Days Remaining' : 'Days Overdue',
                  value: `${Math.abs(remaining)}d`,
                  color: remaining < 0 ? 'text-red-600' : remaining <= 5 ? 'text-orange-600' : 'text-green-700',
                },
                {
                  label: 'Harvest Date',
                  value: harvestDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                  color: 'text-amber-900',
                },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-xl px-4 py-3 border border-amber-100">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">{stat.label}</p>
                  <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ─── Batches ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Batches ({batches.length})</h2>
          <button
            onClick={() => setBatchModal(true)}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
          >
            + Start New Batch
          </button>
        </div>

        {batches.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <p className="text-4xl mb-2">🐣</p>
            <p className="text-sm">No batches yet. Click "Start New Batch" to begin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Start Date</th>
                  <th className="px-5 py-3 text-right">Chicks</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Days Left / Overdue</th>
                  <th className="px-5 py-3 text-right">Feed (kg)</th>
                  <th className="px-5 py-3 text-right">Medicine</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {batches.map(b => {
                  const elapsed   = daysElapsed(b.start_date)
                  const remaining = 45 - elapsed
                  const isActive  = b.status === 'active'
                  return (
                    <tr key={b.id} className="hover:bg-amber-50/30 transition">
                      <td className="px-5 py-4 font-medium text-gray-800">{fmtDate(b.start_date)}</td>
                      <td className="px-5 py-4 text-right text-gray-700">{Number(b.chick_count).toLocaleString('en-IN')}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                          ${b.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {isActive ? (
                          <span className={`text-xs font-semibold
                            ${remaining < 0 ? 'text-red-600' : remaining <= 5 ? 'text-orange-500' : 'text-gray-600'}`}>
                            {remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d left`}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">{elapsed}d elapsed</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">
                        {(batchFeedKg[b.id] || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-4 text-right text-gray-600">
                        {(batchMedQty[b.id] || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-green-700">
                        {batchRevenue[b.id] ? fmt(batchRevenue[b.id]) : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setEditingBatch(b)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                        >
                          Edit
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

      {/* ─── Distribution History ────────────────────────────────────────── */}
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

        {distributions.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <p className="text-4xl mb-2">📦</p>
            <p className="text-sm">No distributions recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3 text-right">Quantity</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {distributions.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3 text-gray-600">{fmtDate(d.date)}</td>
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
                    <td className="px-5 py-3 text-gray-400 italic text-xs">{d.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Sales ──────────────────────────────────────────────────────── */}
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

      {/* ─── Profit & Loss ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Farm Profit & Loss</h2>

        <div className="space-y-1">
          {/* Revenue */}
          <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">💰 Total Revenue</span>
            <span className="text-base font-bold text-green-700">{fmt(revenue)}</span>
          </div>

          {/* Costs */}
          {[
            { label: '🐣 Chick Cost',        value: chickCost,    note: `${farmTotalChicks.toLocaleString('en-IN')} chicks (proportional)` },
            { label: '🌾 Feed Cost',     value: feedCost,     note: 'from distributions recorded to this farm' },
            { label: '💊 Medicine Cost', value: medicineCost, note: 'from distributions recorded to this farm' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-50">
              <div>
                <span className="text-sm text-gray-600">{row.label}</span>
                <p className="text-xs text-gray-400 mt-0.5">{row.note}</p>
              </div>
              <span className="text-sm font-semibold text-red-500">− {fmt(row.value)}</span>
            </div>
          ))}

          {/* Total cost */}
          <div className="flex items-center justify-between py-2.5 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">Total Cost</span>
            <span className="text-sm font-bold text-gray-700">− {fmt(totalCost)}</span>
          </div>

          {/* Gross profit */}
          <div className="flex items-center justify-between pt-3">
            <span className="text-base font-bold text-gray-800">Gross Profit</span>
            <span className={`text-2xl font-extrabold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {grossProfit < 0 ? '− ' : ''}{fmt(Math.abs(grossProfit))}
            </span>
          </div>
        </div>

        {/* Margin strip */}
        <div className={`mt-4 rounded-xl px-5 py-3 text-center text-sm font-bold
          ${grossProfit >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          Profit Margin: {margin.toFixed(1)}%
          {grossProfit < 0 && '  ⚠ Loss'}
        </div>
      </div>

      {/* ─── Modals ─────────────────────────────────────────────────────── */}
      {editModal    && <FarmEditModal  farm={farm}          onClose={() => setEditModal(false)}    onSaved={() => { setEditModal(false);    refresh() }} />}
      {batchModal   && <NewBatchModal farmId={id}          onClose={() => setBatchModal(false)}   onSaved={() => { setBatchModal(false);   refresh() }} />}
      {editingBatch && <EditBatchModal batch={editingBatch} onClose={() => setEditingBatch(null)} onSaved={() => { setEditingBatch(null); refresh() }} />}
      {distModal  && <DistributionModal farmId={id} stock={stock} onClose={() => setDistModal(false)} onSaved={() => { setDistModal(false); refresh() }} />}
      {saleModal  && <SaleModal        activeBatch={activeBatch} vendors={vendors} onClose={() => setSaleModal(false)} onSaved={() => { setSaleModal(false); refresh() }} />}
    </div>
  )
}
