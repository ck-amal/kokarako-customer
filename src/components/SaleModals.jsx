import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'

function batchLabel(batch, language) {
  if (!batch) return '—'
  return `${batch.farms?.name ?? 'Farm'} — ${formatDate(batch.start_date, language)} (${batch.chick_count?.toLocaleString()} chicks)`
}

// ─── Sale Type Picker ─────────────────────────────────────────────────────────

export function SaleTypePicker({ onChoose, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">New Sale</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-sm text-gray-500 mb-5">What are you selling?</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onChoose('chicken')}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 p-5 text-left transition"
          >
            <span className="text-3xl">🐔</span>
            <span className="font-semibold text-gray-800 text-sm">Chicken Sale</span>
            <span className="text-xs text-gray-500 text-center">Sell birds from a batch</span>
          </button>
          <button
            onClick={() => onChoose('goods')}
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 p-5 text-left transition"
          >
            <span className="text-3xl">📦</span>
            <span className="font-semibold text-gray-800 text-sm">Goods Sale</span>
            <span className="text-xs text-gray-500 text-center">Sell stock items</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Chicken Sale Modal ───────────────────────────────────────────────────────

export function ChickenSaleModal({ batches, vendors, onClose, onSaved, sale = null }) {
  const isEdit = !!sale
  const { t, i18n } = useTranslation()
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [form, setForm] = useState({
    batch_id:      isEdit ? sale.batch_id              : batches[0]?.id ?? '',
    vendor_id:     isEdit ? sale.vendor_id             : vendors[0]?.id ?? '',
    chicken_count: isEdit ? String(sale.chicken_count ?? '') : '',
    kg_sold:       isEdit ? String(sale.kg_sold ?? '')       : '',
    price_per_kg:  isEdit ? String(sale.price_per_kg ?? '')  : '',
    final_amount:  isEdit ? String(sale.final_amount ?? '')  : '',
    date:          isEdit ? sale.date                        : new Date().toISOString().slice(0, 10),
    notes:         isEdit ? (sale.notes ?? '')               : '',
  })
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [alreadySold,  setAlreadySold]  = useState(0)
  const [loadingBatch, setLoadingBatch] = useState(false)

  useEffect(() => {
    if (!form.batch_id) return
    setLoadingBatch(true)
    let q = supabase.from('sales').select('chicken_count').eq('batch_id', form.batch_id).neq('status', 'rejected')
    if (isEdit) q = q.neq('id', sale.id)
    q.then(({ data }) => {
      setAlreadySold((data || []).reduce((s, r) => s + Number(r.chicken_count || 0), 0))
      setLoadingBatch(false)
    })
  }, [form.batch_id])

  const selectedBatch   = batches.find(b => b.id === form.batch_id)
  const batchLive       = selectedBatch
    ? Math.max(0, Number(selectedBatch.chick_count || 0) - Number(selectedBatch.mortality_count || 0))
    : 0
  const available       = Math.max(0, batchLive - alreadySold)
  const chickensEntered = parseInt(form.chicken_count) || 0

  function set(field) { return e => setForm(prev => ({ ...prev, [field]: e.target.value })) }

  const calcTotal = form.kg_sold && form.price_per_kg
    ? parseFloat(form.kg_sold) * parseFloat(form.price_per_kg)
    : null
  const finalAmtVal = parseFloat(form.final_amount)
  const hasOverride = isEdit && calcTotal != null && !isNaN(finalAmtVal) && Math.abs(finalAmtVal - calcTotal) > 0.01

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const count = parseInt(form.chicken_count)
    if (!count || count <= 0) { setError('Enter number of chickens'); return }
    if (!isEdit && count > available) {
      setError(`Only ${available.toLocaleString('en-IN')} birds available (${batchLive.toLocaleString('en-IN')} live − ${alreadySold.toLocaleString('en-IN')} already sold)`)
      return
    }
    const kg    = parseFloat(form.kg_sold)
    const price = parseFloat(form.price_per_kg)
    const autoAmt  = kg * price
    const finalAmt = parseFloat(form.final_amount)
    const overrideAmt = isEdit && !isNaN(finalAmt) && Math.abs(finalAmt - autoAmt) > 0.01

    setSaving(true)
    let dbError
    if (isEdit) {
      const { error } = await supabase.from('sales').update({
        vendor_id:       form.vendor_id,
        chicken_count:   count,
        kg_sold:         kg,
        price_per_kg:    price,
        final_amount:    overrideAmt ? finalAmt : null,
        date:            form.date,
        notes:           form.notes.trim() || null,
        updated_by_id:   user?.id,
        updated_by_name: userName,
      }).eq('id', sale.id)
      dbError = error
    } else {
      const { error } = await supabase.from('sales').insert({
        organization_id: organization?.id,
        batch_id:        form.batch_id,
        vendor_id:       form.vendor_id,
        chicken_count:   count,
        kg_sold:         kg,
        price_per_kg:    price,
        sale_type:       'chicken',
        date:            form.date,
        notes:           form.notes.trim() || null,
        created_by_id:   user?.id,
        created_by_name: userName,
      })
      dbError = error
    }
    if (dbError) { setError(dbError.message); setSaving(false) }
    else          { onSaved() }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{isEdit ? 'Edit Chicken Sale' : '🐔 Chicken Sale'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {!isEdit && batches.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No active batches. Start a batch first before recording a sale.
          </p>
        ) : !isEdit && vendors.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No vendors found. Add a vendor first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.batch')} *</label>
              {isEdit ? (
                <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  {batchLabel(batches.find(b => b.id === form.batch_id) ?? sale.batches, i18n.language)}
                </p>
              ) : (
                <select required value={form.batch_id} onChange={set('batch_id')} className={inputCls}>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{batchLabel(b, i18n.language)}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.vendor')} *</label>
              {vendors.length === 1 ? (
                <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">{vendors[0].name}</p>
              ) : (
                <select required value={form.vendor_id} onChange={set('vendor_id')} className={inputCls}>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">No. of Chickens *</label>
                <input
                  required type="number" min="1" step="1"
                  value={form.chicken_count} onChange={set('chicken_count')}
                  placeholder="e.g. 500" className={inputCls}
                />
                {!isEdit && selectedBatch && !loadingBatch && (
                  <p className={`text-xs mt-1 font-medium ${chickensEntered > available ? 'text-red-600' : 'text-gray-400'}`}>
                    {chickensEntered > available
                      ? `⚠ Exceeds available (${available.toLocaleString('en-IN')})`
                      : `Available: ${available.toLocaleString('en-IN')} birds`}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.kgSold')} *</label>
                <input
                  required type="number" min="0.01" step="0.01"
                  value={form.kg_sold} onChange={set('kg_sold')}
                  placeholder="e.g. 120.5" className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.pricePerKg')} (₹) *</label>
                <input
                  required type="number" min="0.01" step="0.01"
                  value={form.price_per_kg} onChange={set('price_per_kg')}
                  placeholder="e.g. 95" className={inputCls}
                />
              </div>
            </div>

            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
              calcTotal ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'
            }`}>
              <span className="text-sm font-medium text-gray-600">
                {isEdit ? 'Calculated Amount' : t('sales.totalAmount')}
              </span>
              <span className={`text-lg font-bold ${calcTotal ? (hasOverride ? 'line-through text-gray-400 text-base' : 'text-green-700') : 'text-gray-300'}`}>
                {calcTotal ? formatCurrency(calcTotal) : '—'}
              </span>
            </div>

            {isEdit && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    Final Amount (₹) <span className="text-xs text-gray-400 font-normal">— override if needed</span>
                  </label>
                  {hasOverride && (
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, final_amount: calcTotal != null ? calcTotal.toFixed(2) : '' }))}
                      className="text-xs text-blue-500 hover:text-blue-700">
                      Reset to calculated
                    </button>
                  )}
                </div>
                <input
                  type="number" min="0" step="0.01"
                  value={form.final_amount} onChange={set('final_amount')}
                  placeholder={calcTotal ? calcTotal.toFixed(2) : '0.00'} className={inputCls}
                />
                {hasOverride && (
                  <p className="text-xs text-blue-600 mt-1">
                    Final amount adjusted: {formatCurrency(finalAmtVal)} (auto: {formatCurrency(calcTotal)})
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={form.date} onChange={set('date')} className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
              <input type="text" value={form.notes} onChange={set('notes')} placeholder={t('common.optional')} className={inputCls} />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : t('sales.recordSale')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Goods Sale Modal ─────────────────────────────────────────────────────────

export function GoodsSaleModal({ vendors, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [form, setForm] = useState({
    vendor_id:     vendors[0]?.id ?? '',
    item_id:       '',
    quantity:      '',
    selling_price: '',
    date:          new Date().toISOString().slice(0, 10),
    notes:         '',
    pay_now:       false,
    pay_amount:    '',
    pay_method:    'cash',
  })
  const [itemsWithStock, setItemsWithStock] = useState([])
  const [loadingItems,   setLoadingItems]   = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    async function loadItems() {
      setLoadingItems(true)
      const [{ data: stockData }, { data: itemsData }] = await Promise.all([
        supabase.from('stock').select('item_name, quantity, avg_cost').eq('organization_id', organization.id).gt('quantity', 0),
        supabase.from('items').select('id, name, unit, item_types(name)').eq('organization_id', organization.id).eq('is_active', true),
      ])
      const stockMap = {}
      for (const s of (stockData || [])) stockMap[s.item_name.toLowerCase()] = s
      const merged = (itemsData || [])
        .filter(item => stockMap[item.name.toLowerCase()])
        .map(item => ({
          ...item,
          stockQty: Number(stockMap[item.name.toLowerCase()].quantity),
          avgCost:  Number(stockMap[item.name.toLowerCase()].avg_cost || 0),
        }))
      setItemsWithStock(merged)
      if (merged.length > 0) setForm(f => ({ ...f, item_id: merged[0].id }))
      setLoadingItems(false)
    }
    loadItems()
  }, [organization])

  function set(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  const selectedItem  = itemsWithStock.find(i => i.id === form.item_id)
  const qty           = parseFloat(form.quantity) || 0
  const price         = parseFloat(form.selling_price) || 0
  const totalAmount   = qty * price
  const purchaseCost  = selectedItem ? selectedItem.avgCost * qty : 0
  const profit        = totalAmount - purchaseCost
  const profitPct     = totalAmount > 0 ? ((profit / totalAmount) * 100).toFixed(1) : null
  const payAmt        = parseFloat(form.pay_amount) || 0

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.item_id)              { setError('Select an item'); return }
    if (!qty || qty <= 0)           { setError('Enter quantity'); return }
    if (!price || price <= 0)       { setError('Enter selling price'); return }
    if (!form.vendor_id)            { setError('Select a vendor'); return }
    if (selectedItem && qty > selectedItem.stockQty) {
      setError(`Only ${selectedItem.stockQty.toLocaleString('en-IN')} ${selectedItem.unit} available in stock`)
      return
    }
    if (form.pay_now && (!payAmt || payAmt <= 0)) { setError('Enter payment amount'); return }

    setSaving(true)
    try {
      const { data: saleData, error: saleErr } = await supabase.from('sales').insert({
        organization_id:        organization.id,
        vendor_id:              form.vendor_id,
        sale_type:              'goods',
        item_id:                form.item_id,
        item_quantity:          qty,
        kg_sold:                qty,
        price_per_kg:           price,
        purchase_cost_per_unit: selectedItem?.avgCost || 0,
        date:                   form.date,
        notes:                  form.notes.trim() || null,
        status:                 'confirmed',
        created_by_id:          user.id,
        created_by_name:        userName,
        confirmed_by_id:        user.id,
        confirmed_by_name:      userName,
        confirmed_at:           new Date().toISOString(),
      }).select('id').single()
      if (saleErr) throw saleErr

      const { data: stockRow, error: stockFetchErr } = await supabase
        .from('stock').select('id, quantity')
        .eq('organization_id', organization.id)
        .ilike('item_name', selectedItem.name)
        .maybeSingle()
      if (stockFetchErr) throw stockFetchErr
      if (!stockRow) throw new Error(`Stock record not found for "${selectedItem.name}"`)
      const { error: stockUpdateErr } = await supabase.from('stock')
        .update({ quantity: Math.max(0, Number(stockRow.quantity) - qty) })
        .eq('id', stockRow.id)
      if (stockUpdateErr) throw stockUpdateErr

      const { error: ledgerErr } = await supabase.from('stock_ledger').insert({
        item_name:       selectedItem.name,
        item_type:       selectedItem.item_types?.name || '',
        change_type:     'out',
        quantity:        qty,
        unit:            selectedItem.unit,
        reference_type:  'goods_sale',
        reference_id:    saleData.id,
        date:            form.date,
        organization_id: organization.id,
      })
      if (ledgerErr) throw ledgerErr

      if (form.pay_now) {
        const { error: ccErr } = await supabase.from('cash_collection').insert({
          organization_id: organization.id,
          vendor_id:       form.vendor_id,
          sale_id:         saleData.id,
          amount_paid:     payAmt,
          method:          form.pay_method,
          date:            form.date,
          notes:           form.notes.trim() || null,
          status:          'pending',
          created_by_id:   user.id,
          created_by_name: userName,
        })
        if (ccErr) throw ccErr
      }

      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">📦 Goods Sale</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {vendors.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No vendors found. Add a vendor first.
          </p>
        ) : loadingItems ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
          </div>
        ) : itemsWithStock.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            No items in stock. Procure items before recording a goods sale.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              {vendors.length === 1 ? (
                <p className="text-sm text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">{vendors[0].name}</p>
              ) : (
                <select required value={form.vendor_id} onChange={set('vendor_id')} className={inputCls}>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
              <select required value={form.item_id} onChange={set('item_id')} className={inputCls}>
                {itemsWithStock.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {i.stockQty.toLocaleString('en-IN')} {i.unit} available
                  </option>
                ))}
              </select>
              {selectedItem && (
                <p className="text-xs text-gray-400 mt-1">
                  Avg purchase cost: ₹{selectedItem.avgCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / {selectedItem.unit}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity ({selectedItem?.unit ?? 'unit'}) *
                </label>
                <input
                  required type="number" min="0.001" step="any"
                  value={form.quantity} onChange={set('quantity')}
                  placeholder="e.g. 10" className={inputCls}
                />
                {selectedItem && qty > selectedItem.stockQty && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠ Exceeds available ({selectedItem.stockQty.toLocaleString('en-IN')})
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Selling Price / {selectedItem?.unit ?? 'unit'} (₹) *
                </label>
                <input
                  required type="number" min="0.01" step="0.01"
                  value={form.selling_price} onChange={set('selling_price')}
                  placeholder="e.g. 600" className={inputCls}
                />
              </div>
            </div>

            {totalAmount > 0 && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Total Amount</span>
                  <span className="text-lg font-bold text-blue-700">{formatCurrency(totalAmount)}</span>
                </div>
                {selectedItem?.avgCost > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Purchase cost ({qty} × ₹{selectedItem.avgCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })})</span>
                    <span>{formatCurrency(purchaseCost)}</span>
                  </div>
                )}
                {selectedItem?.avgCost > 0 && (
                  <div className={`flex items-center justify-between text-xs font-semibold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    <span>{profit >= 0 ? 'Profit' : 'Loss'}{profitPct ? ` (${profitPct}% margin)` : ''}</span>
                    <span>{formatCurrency(Math.abs(profit))}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input required type="date" value={form.date} onChange={set('date')} className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={set('notes')} placeholder="Optional" className={inputCls} />
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={form.pay_now}
                  onChange={e => setForm(p => ({ ...p, pay_now: e.target.checked, pay_amount: e.target.checked ? String(totalAmount.toFixed(2)) : '' }))}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                />
                <span className="text-sm font-medium text-gray-700">Payment received now</span>
              </label>

              {form.pay_now && (
                <div className="grid grid-cols-2 gap-3 pl-5">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
                    <input
                      required type="number" min="0.01" step="0.01"
                      value={form.pay_amount} onChange={set('pay_amount')}
                      placeholder={totalAmount ? totalAmount.toFixed(2) : '0.00'}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Method *</label>
                    <select value={form.pay_method} onChange={set('pay_method')} className={inputCls}>
                      <option value="cash">💵 Cash</option>
                      <option value="online">📱 Online / UPI</option>
                    </select>
                  </div>
                  <p className="col-span-2 text-xs text-gray-400">
                    A payment record will be created for the accountant to verify.
                  </p>
                </div>
              )}

              {!form.pay_now && (
                <p className="text-xs text-gray-400 pl-5">
                  Amount will be added to vendor's outstanding balance.
                </p>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? 'Saving…' : 'Record Goods Sale'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
