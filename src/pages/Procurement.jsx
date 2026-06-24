import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { addToStock } from '../lib/stockHelpers'
import { ledgerIn } from '../lib/stockLedger'
import { formatCurrency, roundCurrency } from '../utils/format'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_STYLES = {
  chicks:    'bg-yellow-100 text-yellow-700',
  feed:      'bg-green-100  text-green-700',
  medicine:  'bg-blue-100   text-blue-700',
  equipment: 'bg-purple-100 text-purple-700',
  other:     'bg-gray-100   text-gray-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function currentMonthRange() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_STYLES[type] ?? TYPE_STYLES.other}`}>
      {type}
    </span>
  )
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ records }) {
  const { start, end } = currentMonthRange()

  const thisMonth = records.filter(r => r.date >= start && r.date <= end)
  const monthTotal = thisMonth.reduce((sum, r) => sum + Number(r.cost), 0)

  const byType = {}
  for (const r of thisMonth) {
    byType[r.type] = (byType[r.type] || 0) + Number(r.cost)
  }

  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]

  const monthName = new Date().toLocaleString('en-IN', { month: 'long' })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spent in {monthName}</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(monthTotal)}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Purchases this month</p>
        <p className="text-2xl font-bold text-gray-800 mt-1">{thisMonth.length}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top category</p>
        <p className="text-2xl font-bold text-gray-800 mt-1 capitalize">
          {topType ? topType[0] : '—'}
        </p>
        {topType && (
          <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(topType[1])}</p>
        )}
      </div>
    </div>
  )
}

// ─── New procurement modal ────────────────────────────────────────────────────

function ProcurementModal({ onClose, onSaved }) {
  const [itemTypes, setItemTypes]   = useState([])
  const [items, setItems]           = useState([])
  const [allItems, setAllItems]     = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [accounts, setAccounts]     = useState([])
  const [supplierOutstanding, setSupplierOutstanding] = useState(null)
  const [form, setForm] = useState({
    item_type_id: '',
    item_id: '',
    quantity: '',
    cost_per_unit: '',
    cost: '',
    supplier_id: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
    pay_now:    false,
    account_id: '',
  })
  const [selectedItem, setSelectedItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // On mount: load item types, items, and suppliers
  useEffect(() => {
    async function loadInitial() {
      const [{ data: types }, { data: sups }, { data: accs }] = await Promise.all([
        supabase.from('item_types').select('id, name').order('name'),
        supabase.from('suppliers').select('id, name, business_name').eq('is_active', true).order('name'),
        supabase.from('accounts').select('id, name, type').eq('is_active', true).order('name'),
      ])
      setItemTypes(types || [])
      setSuppliers(sups || [])
      const accList = accs || []
      setAccounts(accList)
      const cash = accList.find(a => a.type === 'cash')
      if (cash) setForm(f => ({ ...f, account_id: cash.id }))
      if (types?.length) {
        setForm(f => ({ ...f, item_type_id: types[0].id }))
        const { data: initialItems } = await supabase
          .from('items')
          .select('id, name, unit, item_type_id')
          .eq('item_type_id', types[0].id)
          .eq('is_active', true)
          .order('name')
        setItems(initialItems || [])
        setAllItems(initialItems || [])
      }
    }
    loadInitial()
  }, [])

  // When item_type_id changes: reload items for that type
  async function handleTypeChange(newTypeId) {
    setForm(f => ({ ...f, item_type_id: newTypeId, item_id: '', cost_per_unit: '', cost: '' }))
    setSelectedItem(null)
    if (!newTypeId) {
      setItems([])
      return
    }
    const { data } = await supabase
      .from('items')
      .select('id, name, unit, item_type_id')
      .eq('item_type_id', newTypeId)
      .eq('is_active', true)
      .order('name')
    setItems(data || [])
  }

  // When item_id changes: find item in local list
  function handleItemChange(newItemId) {
    const item = items.find(i => i.id === newItemId)
    setSelectedItem(item || null)
    setForm(f => ({ ...f, item_id: newItemId }))
  }

  // When supplier changes: fetch their outstanding balance
  async function handleSupplierChange(supplierId) {
    setForm(f => ({ ...f, supplier_id: supplierId }))
    if (!supplierId) { setSupplierOutstanding(null); return }
    const [{ data: procs }, { data: pays }] = await Promise.all([
      supabase.from('procurement').select('cost').eq('supplier_id', supplierId),
      supabase.from('supplier_payments').select('amount').eq('supplier_id', supplierId),
    ])
    const totalCost = (procs || []).reduce((s, r) => s + Number(r.cost), 0)
    const totalPaid = (pays  || []).reduce((s, r) => s + Number(r.amount), 0)
    setSupplierOutstanding(Math.max(0, totalCost - totalPaid))
  }

  // Generic field setter with auto-calculate for quantity/cost_per_unit
  function set(field) {
    return e => {
      const value = e.target.value
      setForm(prev => {
        const next = { ...prev, [field]: value }
        if (field === 'quantity' || field === 'cost_per_unit') {
          const qty = parseFloat(field === 'quantity' ? value : prev.quantity) || 0
          const cpu = parseFloat(field === 'cost_per_unit' ? value : prev.cost_per_unit) || 0
          next.cost = qty && cpu ? String(roundCurrency(qty * cpu)) : prev.cost
        }
        return next
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.item_type_id) { setError('Select an item type'); return }
    if (!form.item_id) { setError('Select an item'); return }
    if (!selectedItem) { setError('Invalid item'); return }
    setSaving(true)

    const qty = Number(form.quantity)
    const cpu = parseFloat(form.cost_per_unit) || (qty > 0 ? roundCurrency(Number(form.cost) / qty) : 0)

    const { data: inserted, error: insertErr } = await supabase.from('procurement').insert({
      type:          itemTypes.find(t => t.id === form.item_type_id)?.name?.toLowerCase() ?? 'other',
      item_name:     selectedItem.name,
      item_id:       form.item_id,
      quantity:      qty,
      unit:          selectedItem.unit,
      cost:          Number(form.cost),
      cost_per_unit: cpu,
      supplier_id:   form.supplier_id || null,
      date:          form.date,
      notes:         form.notes.trim() || null,
    }).select('id').single()

    if (insertErr) { setError(insertErr.message); setSaving(false); return }

    // Auto-record payment transaction if "Pay now" is checked
    if (form.pay_now && form.account_id) {
      await supabase.from('transactions').insert({
        account_id:       form.account_id,
        transaction_type: 'out',
        category:         'procurement',
        description:      `Purchase — ${selectedItem.name}`,
        amount:           Number(form.cost),
        transaction_date: form.date,
        reference_type:   'procurement',
        reference_id:     inserted.id,
      })
    }

    // Write to stock ledger
    await ledgerIn({
      itemName:      selectedItem.name,
      itemType:      itemTypes.find(t => t.id === form.item_type_id)?.name?.toLowerCase() ?? 'other',
      quantity:      qty,
      unit:          selectedItem.unit,
      referenceType: 'procurement',
      referenceId:   inserted.id,
      date:          form.date,
    })

    await addToStock(selectedItem.name, qty, selectedItem.unit, cpu)

    onSaved()
  }

  const totalPreview = parseFloat(form.cost) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Record Purchase</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Item Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Type *</label>
            <select
              required
              value={form.item_type_id}
              onChange={e => handleTypeChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Select a type…</option>
              {itemTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Item */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
            <select
              required
              value={form.item_id}
              onChange={e => handleItemChange(e.target.value)}
              disabled={!form.item_type_id}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {form.item_type_id ? 'Select an item…' : 'Select an item type first'}
              </option>
              {items.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
          </div>

          {/* Unit — read-only badge */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <span className="inline-flex items-center rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-600 font-medium min-w-[80px]">
              {selectedItem?.unit ?? '—'}
            </span>
          </div>

          {/* Quantity + Cost per unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                required type="number" min="0.01" step="0.01"
                value={form.quantity} onChange={set('quantity')}
                placeholder="e.g. 100"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit (₹)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.cost_per_unit} onChange={set('cost_per_unit')}
                placeholder="e.g. 28.50"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Total Cost */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Cost (₹) *</label>
            <input
              required type="number" min="0" step="0.01"
              value={form.cost} onChange={set('cost')}
              placeholder="Auto-calculated"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Total preview pill */}
          {totalPreview > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
              <span className="text-xs text-amber-700 font-medium">Total:</span>
              <span className="text-sm font-bold text-amber-700">{formatCurrency(totalPreview)}</span>
            </div>
          )}

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
            <select
              value={form.supplier_id}
              onChange={e => handleSupplierChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">No supplier / unknown</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.business_name ? ` — ${s.business_name}` : ''}
                </option>
              ))}
            </select>
            {supplierOutstanding !== null && form.supplier_id && (
              <p className={`text-xs mt-1 font-medium ${supplierOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                Current outstanding: {formatCurrency(supplierOutstanding)}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              required type="date"
              value={form.date} onChange={set('date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={2}
              value={form.notes} onChange={set('notes')}
              placeholder="Any additional details…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Pay now */}
          {accounts.length > 0 && (
            <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.pay_now}
                  onChange={e => setForm(f => ({ ...f, pay_now: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                />
                <span className="text-sm font-medium text-gray-700">Pay now (record cash outflow)</span>
              </label>
              {form.pay_now && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pay from Account</label>
                  <select
                    value={form.account_id}
                    onChange={set('account_id')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">— select account —</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
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
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? 'Saving…' : 'Record Purchase'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Procurement() {
  const [records, setRecords]       = useState([])
  const [itemTypes, setItemTypes]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')

  async function fetchData() {
    setLoading(true)
    const [{ data: batchData }, { data: typesData }] = await Promise.all([
      supabase.from('procurement').select('*, suppliers(name)').order('date', { ascending: false }),
      supabase.from('item_types').select('id, name'),
    ])
    setRecords(batchData || [])
    setItemTypes(typesData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const visible = typeFilter === 'all'
    ? records
    : records.filter(r => r.type === typeFilter)

  const grandTotal = records.reduce((sum, r) => sum + Number(r.cost), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Procurement</h1>
          <p className="text-sm text-gray-500 mt-0.5">All purchases — feed, chicks, medicine &amp; more</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> Record Purchase
        </button>
      </div>

      {/* Summary bar */}
      {!loading && <SummaryBar records={records} />}

      {/* Type filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', ...itemTypes.map(t => t.name.toLowerCase())].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border capitalize ${
              typeFilter === t
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t === 'all' ? `All (${records.length})` : t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🛒</span>
            <p className="text-sm font-medium">No purchases recorded</p>
            <p className="text-xs mt-1">
              {typeFilter !== 'all' ? 'Try a different filter' : 'Click "Record Purchase" to add one'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3 text-right">Total Cost</th>
                  <th className="px-5 py-3">Supplier</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(r => (
                  <tr key={r.id} className="hover:bg-amber-50/40 transition">
                    <td className="px-5 py-3.5">
                      <TypeBadge type={r.item_type_name?.toLowerCase() ?? r.type} />
                    </td>
                    <td className="px-5 py-3.5 font-medium text-gray-800">{r.item_name}</td>
                    <td className="px-5 py-3.5 text-right text-gray-700">
                      {Number(r.quantity).toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{r.unit}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-800">
                      {formatCurrency(r.cost)}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{r.suppliers?.name || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-5 py-3.5 text-gray-400 max-w-[140px] truncate" title={r.notes || ''}>
                      {r.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {typeFilter === 'all' ? 'Grand Total' : `${typeFilter} total`}
              </span>
              <span className="text-sm font-bold text-gray-800">
                {formatCurrency(visible.reduce((s, r) => s + Number(r.cost), 0))}
              </span>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <ProcurementModal
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}
