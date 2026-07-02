import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn } from '../lib/stockLedger'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function StockReturnModal({ distribution, onClose, onSaved }) {
  const { organization } = useAuth()
  const [farmExpense,     setFarmExpense]     = useState(null)
  const [alreadyReturned, setAlreadyReturned] = useState(0)
  const [factor,          setFactor]          = useState(0)  // kg_per_unit or ml_per_unit
  const [subLabel,        setSubLabel]        = useState('') // 'KG' or 'ml'
  const [loading,         setLoading]         = useState(true)
  const [canonCount,      setCanonCount]      = useState('') // bags / bottles / units
  const [subCount,        setSubCount]        = useState('') // kg / ml
  const [form, setForm] = useState({
    return_to_stock: true,
    date:            new Date().toISOString().slice(0, 10),
    reason:          '',
    notes:           '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    async function loadData() {
      const [{ data: feData }, { data: retData }, { data: itemData }] = await Promise.all([
        supabase.from('farm_expenses')
          .select('id, cost_per_unit, total_cost, quantity')
          .eq('distribution_id', distribution.id)
          .maybeSingle(),
        supabase.from('stock_returns')
          .select('quantity')
          .eq('distribution_id', distribution.id),
        supabase.from('items')
          .select('kg_per_unit, ml_per_unit')
          .ilike('name', distribution.item_name)
          .maybeSingle(),
      ])
      setFarmExpense(feData)
      setAlreadyReturned(
        (retData || []).reduce((s, r) => s + Number(r.quantity || 0), 0)
      )
      // Set conversion factor for Bag/Bottle items
      if (distribution.unit === 'Bag' && Number(itemData?.kg_per_unit) > 0) {
        setFactor(Number(itemData.kg_per_unit))
        setSubLabel('KG')
      } else if (distribution.unit === 'Bottle' && Number(itemData?.ml_per_unit) > 0) {
        setFactor(Number(itemData.ml_per_unit))
        setSubLabel('ml')
      }
      setLoading(false)
    }
    loadData()
  }, [distribution.id])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const hasSubUnit   = factor > 0 && subLabel !== ''
  const canonLabel   = distribution.unit

  // returnQty in canonical units (bags/bottles/units)
  const returnQty    = hasSubUnit
    ? (parseFloat(canonCount) || 0) + (parseFloat(subCount) || 0) / factor
    : (parseFloat(canonCount) || 0)

  const maxReturnable  = Math.max(0, Number(distribution.quantity) - alreadyReturned)
  const costPerUnit    = farmExpense ? Number(farmExpense.cost_per_unit || 0) : 0
  const costCredit     = roundCurrency(returnQty * costPerUnit)
  const netAfterReturn = roundCurrency(Math.max(0, maxReturnable - returnQty))

  async function handleSubmit(e) {
    e.preventDefault()
    if (returnQty <= 0)           { setError('Enter a valid quantity'); return }
    if (returnQty > maxReturnable) {
      const maxStr = hasSubUnit
        ? `${maxReturnable} ${canonLabel} (${(maxReturnable * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`
        : `${maxReturnable.toLocaleString('en-IN')} ${canonLabel}`
      setError(`Max returnable: ${maxStr}`)
      return
    }
    setSaving(true)
    setError('')

    const { data: srRow, error: srErr } = await supabase
      .from('stock_returns')
      .insert({
        organization_id: organization?.id,
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

    if (form.return_to_stock) {
      await ledgerIn({
        itemName: distribution.item_name, itemType: distribution.type,
        quantity: returnQty, unit: distribution.unit,
        referenceType: 'stock_return', referenceId: srRow.id,
        date: form.date, organizationId: organization?.id,
      })
      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity').eq('organization_id', organization?.id).ilike('item_name', distribution.item_name).maybeSingle()
      if (stockRow) {
        await supabase.from('stock')
          .update({ quantity: Number(stockRow.quantity) + returnQty }).eq('id', stockRow.id).eq('organization_id', organization?.id)
      } else {
        await supabase.from('stock').insert({
          organization_id: organization?.id, item_name: distribution.item_name, unit: distribution.unit, quantity: returnQty,
        })
      }
    }

    if (farmExpense) {
      await supabase.from('farm_expense_returns').insert({
        organization_id: organization?.id,
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

    await supabase.from('distributions')
      .update({ returned_quantity: alreadyReturned + returnQty })
      .eq('id', distribution.id)
      .eq('organization_id', organization?.id)

    const { data: fsRow } = await supabase.from('farm_stock')
      .select('id, quantity_on_hand').eq('farm_id', distribution.farm_id)
      .ilike('item_name', distribution.item_name).maybeSingle()
    if (fsRow) {
      await supabase.from('farm_stock')
        .update({ quantity_on_hand: Math.max(0, Number(fsRow.quantity_on_hand) - returnQty), updated_at: new Date().toISOString() })
        .eq('id', fsRow.id)
    }

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 my-auto">

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
            {/* Distribution context */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 mb-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-500">Item</span>
                <span className="font-medium text-gray-800">{distribution.item_name}</span>
                <span className="text-gray-500">Originally distributed</span>
                <span className="text-gray-700">
                  {Number(distribution.quantity).toLocaleString('en-IN')} {distribution.unit}
                  {hasSubUnit && ` (${(Number(distribution.quantity) * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`}
                </span>
                {alreadyReturned > 0 && (
                  <>
                    <span className="text-gray-500">Already returned</span>
                    <span className="text-orange-600 font-medium">
                      {alreadyReturned.toLocaleString('en-IN')} {canonLabel}
                    </span>
                  </>
                )}
                <span className="text-gray-500">Max returnable</span>
                <span className={`font-semibold ${maxReturnable <= 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {maxReturnable.toLocaleString('en-IN')} {canonLabel}
                  {hasSubUnit && maxReturnable > 0 && ` (${(maxReturnable * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Quantity *</label>
                  {hasSubUnit ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                          <input
                            type="number" min="0" step="1"
                            value={canonCount} onChange={e => setCanonCount(e.target.value)}
                            placeholder="0" className={inputCls + ' pr-14'}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                            {canonLabel}
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number" min="0" step="any"
                            value={subCount} onChange={e => setSubCount(e.target.value)}
                            placeholder="0" className={inputCls + ' pr-10'}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                            {subLabel}
                          </span>
                        </div>
                      </div>
                      {returnQty > 0 && (
                        <p className="text-xs mt-1.5 text-gray-500 font-medium">
                          Total = {returnQty % 1 === 0 ? returnQty : returnQty.toFixed(3)} {canonLabel}
                          {' '}({(returnQty * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} {subLabel})
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="relative">
                      <input
                        type="number" min="0.01" step="any" max={maxReturnable}
                        value={canonCount} onChange={e => setCanonCount(e.target.value)}
                        placeholder={`Max ${maxReturnable}`} className={inputCls + ' pr-16'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                        {canonLabel}
                      </span>
                    </div>
                  )}
                </div>

                {/* Condition */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condition</label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, return_to_stock: true }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        form.return_to_stock ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>
                      ✅ Usable — return to stock
                    </button>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, return_to_stock: false }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        !form.return_to_stock ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>
                      🗑 Waste — write off
                    </button>
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                  <input type="date" value={form.date} onChange={set('date')} className={inputCls} />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input type="text" value={form.reason} onChange={set('reason')}
                    placeholder="e.g. Batch ended, excess stock" className={inputCls} />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={set('notes')} rows={2}
                    placeholder="Optional additional notes"
                    className={inputCls + ' resize-none'} />
                </div>

                {/* Summary */}
                {returnQty > 0 && (
                  <div className="rounded-xl border px-4 py-3 text-sm space-y-1.5"
                    style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <p className="font-semibold text-gray-700 mb-2">Return Summary</p>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Returning</span>
                      <span className="font-medium">
                        {returnQty % 1 === 0 ? returnQty : returnQty.toFixed(3)} {canonLabel}
                        {hasSubUnit && ` (${(returnQty * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`}
                        {' '}of {distribution.item_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cost credit</span>
                      <span className="font-semibold text-green-700">− {formatCurrency(costCredit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Net remaining at farm</span>
                      <span className="font-medium text-gray-700">
                        {netAfterReturn % 1 === 0 ? netAfterReturn : netAfterReturn.toFixed(3)} {canonLabel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Stock impact</span>
                      <span className={form.return_to_stock ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                        {form.return_to_stock
                          ? `+ ${returnQty % 1 === 0 ? returnQty : returnQty.toFixed(3)} back to warehouse`
                          : 'Waste — no stock increase'}
                      </span>
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={onClose}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving || returnQty <= 0}
                    className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition">
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
