import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { roundCurrency, formatCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

export default function EditDistributionModal({ distribution, onClose, onSaved }) {
  const { organization, user } = useAuth()

  const [form, setForm] = useState({
    quantity: String(distribution.quantity),
    date:     distribution.date,
    notes:    distribution.notes || '',
  })
  const [costPerUnit,      setCostPerUnit]      = useState(null)
  const [extraPerUnit,     setExtraPerUnit]     = useState('')   // ancillary per unit
  const [farmExpenseId,    setFarmExpenseId]    = useState(null)

  // Return state — one entry per farm_expense_return row for this distribution
  const [returns,     setReturns]     = useState([])  // { fer, sr, qty, handling }[]
  const [returnsLoading, setReturnsLoading] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    const orgId = organization?.id
    Promise.all([
      supabase.from('farm_expenses')
        .select('id, cost_per_unit, extra_cost_per_unit')
        .eq('distribution_id', distribution.id)
        .eq('organization_id', orgId)
        .maybeSingle(),
      supabase.from('farm_expense_returns')
        .select('id, stock_return_id, quantity, cost_per_unit, total_cost, handling_charges, unit, item_name')
        .eq('distribution_id', distribution.id)
        .eq('organization_id', orgId),
    ]).then(async ([{ data: feData }, { data: ferRows }]) => {
      setCostPerUnit(Number(feData?.cost_per_unit || 0))
      setFarmExpenseId(feData?.id || null)
      const epu = Number(feData?.extra_cost_per_unit || 0)
      setExtraPerUnit(epu > 0 ? String(epu) : '')

      const rows = ferRows || []
      // For each fer, also load the linked stock_return (for return_to_stock flag)
      const enhanced = await Promise.all(rows.map(async fer => {
        let sr = null
        if (fer.stock_return_id) {
          const { data } = await supabase.from('stock_returns')
            .select('id, quantity, handling_charges, return_to_stock, date, reason')
            .eq('id', fer.stock_return_id)
            .maybeSingle()
          sr = data
        }
        return {
          fer,
          sr,
          qty:      String(fer.quantity),
          handling: fer.handling_charges > 0 ? String(fer.handling_charges) : '',
        }
      }))
      setReturns(enhanced)
      setReturnsLoading(false)
    })
  }, [distribution.id, organization?.id])

  function updateReturn(i, field, value) {
    setReturns(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleSave(e) {
    e.preventDefault()
    const newQty = parseFloat(form.quantity)
    const oldQty = Number(distribution.quantity)
    if (!newQty || newQty <= 0) { setError('Quantity must be greater than 0'); return }

    setSaving(true)
    setError('')
    const qtyDiff  = newQty - oldQty
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const orgId    = organization?.id

    // 1. Update distributions row
    const { error: distErr } = await supabase.from('distributions').update({
      quantity:        newQty,
      date:            form.date,
      notes:           form.notes.trim() || null,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('id', distribution.id).eq('organization_id', orgId)

    if (distErr) { setError(distErr.message); setSaving(false); return }

    const newExtraPerUnit = parseFloat(extraPerUnit) || 0

    if (qtyDiff !== 0) {
      // 2. Update farm_expenses quantity + total_cost + ancillary
      if (costPerUnit !== null && costPerUnit >= 0) {
        await supabase.from('farm_expenses').update({
          quantity:          newQty,
          total_cost:        roundCurrency(newQty * costPerUnit),
          extra_cost_per_unit: newExtraPerUnit,
          extra_total_cost:  newExtraPerUnit > 0 ? roundCurrency(newQty * newExtraPerUnit) : 0,
          date:              form.date,
        }).eq('distribution_id', distribution.id).eq('organization_id', orgId)
      }

      // 3. Update stock_ledger OUT entry
      await supabase.from('stock_ledger').update({ quantity: newQty })
        .eq('reference_type', 'distribution')
        .eq('reference_id', distribution.id)
        .eq('organization_id', orgId)

      // 4. Adjust central stock
      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity')
        .ilike('item_name', distribution.item_name)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (stockRow) {
        await supabase.from('stock').update({
          quantity: Math.max(0, Number(stockRow.quantity) - qtyDiff),
        }).eq('id', stockRow.id)
      }

      // 5. Adjust farm_stock
      if (distribution.farm_id) {
        const { data: fsRow } = await supabase.from('farm_stock')
          .select('id, quantity_on_hand')
          .eq('farm_id', distribution.farm_id)
          .ilike('item_name', distribution.item_name)
          .eq('organization_id', orgId)
          .maybeSingle()
        if (fsRow) {
          await supabase.from('farm_stock').update({
            quantity_on_hand: Math.max(0, Number(fsRow.quantity_on_hand) + qtyDiff),
          }).eq('id', fsRow.id)
        }
      }
    } else {
      // No qty change — still update ancillary + date
      if (farmExpenseId) {
        await supabase.from('farm_expenses').update({
          date:                form.date,
          extra_cost_per_unit: newExtraPerUnit,
          extra_total_cost:    newExtraPerUnit > 0 ? roundCurrency(newQty * newExtraPerUnit) : 0,
        }).eq('id', farmExpenseId).eq('organization_id', orgId)
      }
    }

    // 6. Save each return edit
    for (const r of returns) {
      const newRetQty  = parseFloat(r.qty)
      const newHandling = parseFloat(r.handling) || 0
      if (!newRetQty || newRetQty <= 0) continue

      const oldRetQty     = Number(r.fer.quantity)
      const retQtyDiff    = newRetQty - oldRetQty
      const ferCpu        = Number(r.fer.cost_per_unit || costPerUnit || 0)
      const newNetCredit  = roundCurrency(newRetQty * ferCpu - newHandling)

      // Update farm_expense_returns
      await supabase.from('farm_expense_returns').update({
        quantity:         newRetQty,
        handling_charges: newHandling,
        total_cost:       newNetCredit,
      }).eq('id', r.fer.id).eq('organization_id', orgId)

      // Update stock_returns if linked
      if (r.sr) {
        await supabase.from('stock_returns').update({
          quantity:         newRetQty,
          handling_charges: newHandling,
        }).eq('id', r.sr.id)
      }

      // Update distributions.returned_quantity
      await supabase.from('distributions').update({
        returned_quantity: newRetQty,
      }).eq('id', distribution.id).eq('organization_id', orgId)

      // Adjust stock if return_to_stock — retQtyDiff > 0 means more returned (add to stock)
      if (retQtyDiff !== 0 && r.sr?.return_to_stock) {
        const { data: stockRow2 } = await supabase.from('stock')
          .select('id, quantity')
          .ilike('item_name', distribution.item_name)
          .eq('organization_id', orgId)
          .maybeSingle()
        if (stockRow2) {
          await supabase.from('stock').update({
            quantity: Math.max(0, Number(stockRow2.quantity) + retQtyDiff),
          }).eq('id', stockRow2.id)
        }
        // Update stock_ledger for the return entry
        if (r.sr) {
          await supabase.from('stock_ledger').update({ quantity: newRetQty })
            .eq('reference_type', 'stock_return')
            .eq('reference_id', r.sr.id)
            .eq('organization_id', orgId)
        }
      }
    }

    setSaving(false)
    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
  const newQty   = Number(form.quantity) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Edit Distribution</h2>
            <p className="text-xs text-gray-400 mt-0.5">{distribution.item_name} · {distribution.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
            <div className="flex items-center gap-2">
              <input required type="number" min="0.01" step="any"
                value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                className={inputCls}
              />
              <span className="text-sm text-gray-500 shrink-0">{distribution.unit}</span>
            </div>
            {costPerUnit > 0 && newQty > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Total cost: {formatCurrency(roundCurrency(newQty * costPerUnit))}
                <span className="ml-1 text-gray-300">@ {formatCurrency(costPerUnit)}/{distribution.unit}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input required type="date" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Optional"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ancillary per {distribution.unit}
              <span className="text-xs font-normal text-gray-400 ml-1">(transport, loading…)</span>
            </label>
            <input type="number" min="0" step="any"
              value={extraPerUnit}
              onChange={e => setExtraPerUnit(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
            {parseFloat(extraPerUnit) > 0 && costPerUnit > 0 && newQty > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Ancillary total: {formatCurrency(roundCurrency(newQty * (parseFloat(extraPerUnit) || 0)))}
              </p>
            )}
          </div>

          {/* Return section */}
          {!returnsLoading && returns.length > 0 && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Return{returns.length > 1 ? 's' : ''}
              </p>
              {returns.map((r, i) => {
                const ferCpu = Number(r.fer.cost_per_unit || costPerUnit || 0)
                const retQty = parseFloat(r.qty) || 0
                const handling = parseFloat(r.handling) || 0
                const netCredit = retQty > 0 ? roundCurrency(retQty * ferCpu - handling) : 0
                return (
                  <div key={r.fer.id} className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Returned Quantity *
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="number" min="0.01" step="any"
                          value={r.qty}
                          onChange={e => updateReturn(i, 'qty', e.target.value)}
                          className={inputCls}
                        />
                        <span className="text-sm text-gray-500 shrink-0">{r.fer.unit}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Handling Charges
                      </label>
                      <input type="number" min="0" step="any"
                        value={r.handling}
                        onChange={e => updateReturn(i, 'handling', e.target.value)}
                        placeholder="0"
                        className={inputCls}
                      />
                    </div>
                    {retQty > 0 && ferCpu > 0 && (
                      <p className="text-xs text-gray-400">
                        Net credit: {formatCurrency(netCredit)}
                        {handling > 0 && (
                          <span className="ml-1 text-gray-300">
                            ({formatCurrency(retQty * ferCpu)} − ₹{handling} handling)
                          </span>
                        )}
                      </p>
                    )}
                    {r.sr?.return_to_stock && (
                      <p className="text-xs text-green-600">↩ Stock returned to warehouse</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
