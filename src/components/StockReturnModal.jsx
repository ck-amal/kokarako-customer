import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn } from '../lib/stockLedger'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * StockReturnModal — records a return of distributed feed/medicine back to main stock.
 *
 * Props:
 *   distribution  — the distributions row being returned (id, farm_id, batch_id, item_name, type, quantity, unit)
 *   onClose       — called when modal is dismissed without saving
 *   onSaved       — called after a successful save (triggers parent refresh)
 */
export default function StockReturnModal({ distribution, onClose, onSaved }) {
  const { organization } = useAuth()
  const [farmExpense,     setFarmExpense]     = useState(null)
  const [alreadyReturned, setAlreadyReturned] = useState(0)
  const [loading,         setLoading]         = useState(true)
  const [form, setForm] = useState({
    quantity:        '',
    return_to_stock: true,
    date:            new Date().toISOString().slice(0, 10),
    reason:          '',
    notes:           '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    async function loadData() {
      const [{ data: feData }, { data: retData }] = await Promise.all([
        supabase.from('farm_expenses')
          .select('id, cost_per_unit, total_cost, quantity')
          .eq('distribution_id', distribution.id)
          .maybeSingle(),
        supabase.from('stock_returns')
          .select('quantity')
          .eq('distribution_id', distribution.id),
      ])
      setFarmExpense(feData)
      setAlreadyReturned(
        (retData || []).reduce((s, r) => s + Number(r.quantity || 0), 0)
      )
      setLoading(false)
    }
    loadData()
  }, [distribution.id])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const maxReturnable = Math.max(0, Number(distribution.quantity) - alreadyReturned)
  const returnQty     = parseFloat(form.quantity) || 0
  const costPerUnit   = farmExpense ? Number(farmExpense.cost_per_unit || 0) : 0
  const costCredit    = roundCurrency(returnQty * costPerUnit)
  const netAfterReturn = roundCurrency(Math.max(0, Number(distribution.quantity) - alreadyReturned - returnQty))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!returnQty || returnQty <= 0) {
      setError('Enter a valid quantity'); return
    }
    if (returnQty > maxReturnable) {
      setError(`Max returnable: ${maxReturnable.toLocaleString('en-IN')} ${distribution.unit}`); return
    }
    setSaving(true)
    setError('')

    // 1. Insert stock_returns
    const { data: srRow, error: srErr } = await supabase
      .from('stock_returns')
      .insert({
        farm_id:         distribution.farm_id,
        batch_id:        distribution.batch_id || null,
        distribution_id: distribution.id,
        item_name:       distribution.item_name,
        item_type:       distribution.type,
        quantity:        returnQty,
        unit:            distribution.unit,
        return_to_stock: form.return_to_stock,
        date:            form.date,
        reason:          form.reason.trim() || null,
        notes:           form.notes.trim() || null,
      })
      .select('id')
      .single()
    if (srErr) { setError(srErr.message); setSaving(false); return }

    // 2. If return_to_stock: ledger IN entry + update stock table
    if (form.return_to_stock) {
      await ledgerIn({
        itemName:       distribution.item_name,
        itemType:       distribution.type,
        quantity:       returnQty,
        unit:           distribution.unit,
        referenceType:  'stock_return',
        referenceId:    srRow.id,
        date:           form.date,
        organizationId: organization?.id,
      })
      const { data: stockRow } = await supabase
        .from('stock')
        .select('id, quantity')
        .ilike('item_name', distribution.item_name)
        .maybeSingle()
      if (stockRow) {
        await supabase.from('stock')
          .update({ quantity: Number(stockRow.quantity) + returnQty })
          .eq('id', stockRow.id)
      } else {
        await supabase.from('stock').insert({
          item_name: distribution.item_name,
          unit:      distribution.unit,
          quantity:  returnQty,
        })
      }
    }

    // 3. Insert farm_expense_returns (cost credit)
    if (farmExpense) {
      await supabase.from('farm_expense_returns').insert({
        stock_return_id: srRow.id,
        distribution_id: distribution.id,
        farm_id:         distribution.farm_id,
        batch_id:        distribution.batch_id || null,
        item_name:       distribution.item_name,
        item_type:       distribution.type,
        quantity:        returnQty,
        unit:            distribution.unit,
        cost_per_unit:   costPerUnit,
        total_cost:      costCredit,
        date:            form.date,
      })
    }

    // 4. Update distributions.returned_quantity (denormalised)
    await supabase.from('distributions')
      .update({ returned_quantity: alreadyReturned + returnQty })
      .eq('id', distribution.id)

    // 5. Update farm_stock (reduce qty at farm)
    const { data: fsRow } = await supabase
      .from('farm_stock')
      .select('id, quantity_on_hand')
      .eq('farm_id', distribution.farm_id)
      .ilike('item_name', distribution.item_name)
      .maybeSingle()
    if (fsRow) {
      await supabase.from('farm_stock')
        .update({
          quantity_on_hand: Math.max(0, Number(fsRow.quantity_on_hand) - returnQty),
          updated_at:       new Date().toISOString(),
        })
        .eq('id', fsRow.id)
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Return Stock to Warehouse</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Distribution context (read-only) */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 mb-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-500">Item</span>
                <span className="font-medium text-gray-800">{distribution.item_name}</span>
                <span className="text-gray-500">Type</span>
                <span className="capitalize text-gray-700">{distribution.type}</span>
                <span className="text-gray-500">Originally distributed</span>
                <span className="text-gray-700">{Number(distribution.quantity).toLocaleString('en-IN')} {distribution.unit}</span>
                {alreadyReturned > 0 && (
                  <>
                    <span className="text-gray-500">Already returned</span>
                    <span className="text-orange-600 font-medium">{alreadyReturned.toLocaleString('en-IN')} {distribution.unit}</span>
                  </>
                )}
                <span className="text-gray-500">Max returnable</span>
                <span className={`font-semibold ${maxReturnable <= 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {maxReturnable.toLocaleString('en-IN')} {distribution.unit}
                </span>
              </div>
            </div>

            {maxReturnable <= 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-4">
                ⚠ All distributed quantity has already been returned.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Return Quantity * <span className="text-gray-400 font-normal">({distribution.unit})</span>
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    max={maxReturnable}
                    value={form.quantity}
                    onChange={set('quantity')}
                    placeholder={`Max ${maxReturnable}`}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Condition toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, return_to_stock: true }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        form.return_to_stock
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      ✅ Usable — return to stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, return_to_stock: false }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        !form.return_to_stock
                          ? 'bg-red-600 border-red-600 text-white'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      🗑 Waste — write off
                    </button>
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={set('date')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={form.reason}
                    onChange={set('reason')}
                    placeholder="e.g. Batch ended, excess stock"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={set('notes')}
                    rows={2}
                    placeholder="Optional additional notes"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>

                {/* Summary card */}
                {returnQty > 0 && (
                  <div className="rounded-xl border px-4 py-3 text-sm space-y-1.5"
                    style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <p className="font-semibold text-gray-700 mb-2">Return Summary</p>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Returning</span>
                      <span className="font-medium">{returnQty.toLocaleString('en-IN')} {distribution.unit} of {distribution.item_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cost credit</span>
                      <span className="font-semibold text-green-700">− {formatCurrency(costCredit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Net remaining at farm</span>
                      <span className="font-medium text-gray-700">{netAfterReturn.toLocaleString('en-IN')} {distribution.unit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Stock impact</span>
                      <span className={form.return_to_stock ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                        {form.return_to_stock ? `+ ${returnQty.toLocaleString('en-IN')} back to warehouse` : 'Waste — no stock increase'}
                      </span>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || returnQty <= 0}
                    className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    {saving ? 'Saving…' : 'Record Return'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
