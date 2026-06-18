import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { subtractFromStock } from '../lib/stockHelpers'

const UNITS = ['kg', 'bags', 'litres', 'units', 'bottles', 'boxes', 'tonnes']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stockStatus(qty, reorder) {
  const q = Number(qty)
  const r = Number(reorder)
  if (q <= 0)        return 'empty'
  if (q <= r)        return 'low'
  if (q <= r * 1.25) return 'warning'
  return 'ok'
}

const STATUS_CONFIG = {
  ok:      { bar: 'bg-green-400',  label: 'In Stock',   text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  warning: { bar: 'bg-yellow-400', label: 'Low Soon',   text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  low:     { bar: 'bg-red-400',    label: 'Low Stock',  text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  empty:   { bar: 'bg-gray-300',   label: 'Out of Stock', text: 'text-gray-500', bg: 'bg-gray-50',   border: 'border-gray-200' },
}

function stockPercent(qty, reorder) {
  const q = Number(qty)
  const r = Number(reorder)
  if (r <= 0) return q > 0 ? 100 : 0
  // fill bar relative to 2× reorder level
  return Math.min(100, Math.round((q / (r * 2)) * 100))
}

// ─── Add stock modal ──────────────────────────────────────────────────────────

function AddStockModal({ item, onClose, onSaved }) {
  const [qty, setQty]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!qty || Number(qty) <= 0) { setError('Enter a valid quantity'); return }
    setSaving(true)

    const newQty = Number(item.quantity) + Number(qty)
    const { error } = await supabase
      .from('stock')
      .update({ quantity: newQty })
      .eq('id', item.id)

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Add Stock</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Adding to <span className="font-semibold text-gray-700">{item.item_name}</span>
          &nbsp;(current: <span className="font-semibold">{Number(item.quantity).toLocaleString('en-IN')} {item.unit}</span>)
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity to add ({item.unit}) *
            </label>
            <input
              required autoFocus type="number" min="0.01" step="0.01"
              value={qty} onChange={e => setQty(e.target.value)}
              placeholder="e.g. 50"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {qty > 0 && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              New total: <span className="font-bold">{(Number(item.quantity) + Number(qty)).toLocaleString('en-IN')} {item.unit}</span>
            </p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Distribute (subtract) modal ──────────────────────────────────────────────

function DistributeModal({ item, onClose, onSaved }) {
  const [qty, setQty]     = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!qty || Number(qty) <= 0) { setError('Enter a valid quantity'); return }
    setSaving(true)

    const { error } = await subtractFromStock(item.id, item.quantity, qty)
    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  const preview = Math.max(0, Number(item.quantity) - (Number(qty) || 0))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Distribute / Use</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Using from <span className="font-semibold text-gray-700">{item.item_name}</span>
          &nbsp;(available: <span className="font-semibold">{Number(item.quantity).toLocaleString('en-IN')} {item.unit}</span>)
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity to use ({item.unit}) *
            </label>
            <input
              required autoFocus type="number" min="0.01" step="0.01"
              value={qty} onChange={e => setQty(e.target.value)}
              placeholder="e.g. 20"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {qty > 0 && (
            <p className={`text-xs rounded-lg px-3 py-2 border font-medium
              ${preview === 0
                ? 'text-red-700 bg-red-50 border-red-200'
                : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
              Remaining after use: <span className="font-bold">{preview.toLocaleString('en-IN')} {item.unit}</span>
              {preview === 0 && ' — stock will be empty'}
            </p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Confirm Use'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add new item modal ───────────────────────────────────────────────────────

function NewItemModal({ onClose, onSaved }) {
  const [form, setForm]     = useState({ item_name: '', quantity: '', unit: 'kg', reorder_level: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('stock').insert({
      item_name:     form.item_name.trim(),
      quantity:      Number(form.quantity),
      unit:          form.unit,
      reorder_level: Number(form.reorder_level) || 0,
    })
    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Add Stock Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
            <input required value={form.item_name} onChange={set('item_name')}
              placeholder="e.g. Starter Feed"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Quantity *</label>
              <input required type="number" min="0" step="0.01" value={form.quantity} onChange={set('quantity')}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
              <select required value={form.unit} onChange={set('unit')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reorder Level <span className="text-gray-400 font-normal">(alert threshold)</span>
            </label>
            <input type="number" min="0" step="0.01" value={form.reorder_level} onChange={set('reorder_level')}
              placeholder="e.g. 100"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Stock card ───────────────────────────────────────────────────────────────

function StockCard({ item, onAdd, onDistribute }) {
  const status  = stockStatus(item.quantity, item.reorder_level)
  const config  = STATUS_CONFIG[status]
  const percent = stockPercent(item.quantity, item.reorder_level)

  return (
    <div className={`bg-white rounded-2xl border ${config.border} shadow-sm p-5 flex flex-col gap-3`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-800 text-sm leading-snug">{item.item_name}</h3>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${config.bg} ${config.text}`}>
          {config.label}
        </span>
      </div>

      {/* Quantity */}
      <div>
        <p className="text-2xl font-bold text-gray-800 leading-none">
          {Number(item.quantity).toLocaleString('en-IN')}
          <span className="text-sm font-normal text-gray-400 ml-1">{item.unit}</span>
        </p>
        {Number(item.reorder_level) > 0 && (
          <p className="text-xs text-gray-400 mt-1">
            Reorder at {Number(item.reorder_level).toLocaleString('en-IN')} {item.unit}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${config.bar}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onAdd(item)}
          className="flex-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold py-1.5 transition"
        >
          + Add
        </button>
        <button
          onClick={() => onDistribute(item)}
          disabled={Number(item.quantity) <= 0}
          className="flex-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          − Use / Distribute
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Stock() {
  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [newModal, setNewModal]     = useState(false)
  const [addItem, setAddItem]       = useState(null)
  const [distItem, setDistItem]     = useState(null)
  const [search, setSearch]         = useState('')

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('stock')
      .select('*')
      .order('item_name')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function refresh() {
    setAddItem(null)
    setDistItem(null)
    setNewModal(false)
    fetchData()
  }

  const filtered = search.trim()
    ? items.filter(i => i.item_name.toLowerCase().includes(search.trim().toLowerCase()))
    : items

  const lowCount   = items.filter(i => stockStatus(i.quantity, i.reorder_level) === 'low').length
  const emptyCount = items.filter(i => stockStatus(i.quantity, i.reorder_level) === 'empty').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inventory levels across all items</p>
        </div>
        <button
          onClick={() => setNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> Add Item
        </button>
      </div>

      {/* Alert banners */}
      {(lowCount > 0 || emptyCount > 0) && (
        <div className="flex flex-wrap gap-3 mb-5">
          {emptyCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              <span className="font-bold">⚠</span>
              <span><span className="font-semibold">{emptyCount} item{emptyCount > 1 ? 's' : ''}</span> out of stock</span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-2.5 text-sm text-yellow-700">
              <span className="font-bold">↓</span>
              <span><span className="font-semibold">{lowCount} item{lowCount > 1 ? 's' : ''}</span> below reorder level</span>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Items',  value: items.length,                                color: 'text-gray-800' },
            { label: 'In Stock',     value: items.filter(i => stockStatus(i.quantity, i.reorder_level) === 'ok').length,      color: 'text-green-600' },
            { label: 'Low Stock',    value: lowCount,   color: 'text-red-500' },
            { label: 'Out of Stock', value: emptyCount, color: 'text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {items.length > 4 && (
        <div className="mb-4">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full sm:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      )}

      {/* Card grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <span className="text-5xl mb-3">📦</span>
          <p className="text-sm font-medium">{search ? 'No items match your search' : 'No stock items yet'}</p>
          <p className="text-xs mt-1">
            {!search && 'Add items manually or record a procurement to auto-create stock'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => (
            <StockCard
              key={item.id}
              item={item}
              onAdd={setAddItem}
              onDistribute={setDistItem}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {newModal  && <NewItemModal    onClose={() => setNewModal(false)} onSaved={refresh} />}
      {addItem   && <AddStockModal   item={addItem}  onClose={() => setAddItem(null)}  onSaved={refresh} />}
      {distItem  && <DistributeModal item={distItem} onClose={() => setDistItem(null)} onSaved={refresh} />}
    </div>
  )
}
