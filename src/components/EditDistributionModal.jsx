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
  const [costPerUnit, setCostPerUnit] = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    supabase.from('farm_expenses')
      .select('cost_per_unit')
      .eq('distribution_id', distribution.id)
      .eq('organization_id', organization?.id)
      .maybeSingle()
      .then(({ data }) => setCostPerUnit(Number(data?.cost_per_unit || 0)))
  }, [distribution.id])

  async function handleSave(e) {
    e.preventDefault()
    const newQty = parseFloat(form.quantity)
    const oldQty = Number(distribution.quantity)
    if (!newQty || newQty <= 0) { setError('Quantity must be greater than 0'); return }

    setSaving(true)
    setError('')
    const qtyDiff  = newQty - oldQty
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    // 1. Update distributions row
    const { error: distErr } = await supabase.from('distributions').update({
      quantity:        newQty,
      date:            form.date,
      notes:           form.notes.trim() || null,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('id', distribution.id).eq('organization_id', organization?.id)

    if (distErr) { setError(distErr.message); setSaving(false); return }

    if (qtyDiff !== 0) {
      // 2. Update farm_expenses quantity + total_cost
      if (costPerUnit !== null && costPerUnit >= 0) {
        await supabase.from('farm_expenses').update({
          quantity:   newQty,
          total_cost: roundCurrency(newQty * costPerUnit),
          date:       form.date,
        }).eq('distribution_id', distribution.id).eq('organization_id', organization?.id)
      }

      // 3. Update stock_ledger OUT entry
      await supabase.from('stock_ledger').update({ quantity: newQty })
        .eq('reference_type', 'distribution')
        .eq('reference_id', distribution.id)
        .eq('organization_id', organization?.id)

      // 4. Adjust central stock (more distributed = less stock)
      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity')
        .ilike('item_name', distribution.item_name)
        .eq('organization_id', organization?.id)
        .maybeSingle()
      if (stockRow) {
        await supabase.from('stock').update({
          quantity: Math.max(0, Number(stockRow.quantity) - qtyDiff),
        }).eq('id', stockRow.id)
      }

      // 5. Adjust farm_stock (more distributed = more on-farm)
      if (distribution.farm_id) {
        const { data: fsRow } = await supabase.from('farm_stock')
          .select('id, quantity_on_hand')
          .eq('farm_id', distribution.farm_id)
          .ilike('item_name', distribution.item_name)
          .eq('organization_id', organization?.id)
          .maybeSingle()
        if (fsRow) {
          await supabase.from('farm_stock').update({
            quantity_on_hand: Math.max(0, Number(fsRow.quantity_on_hand) + qtyDiff),
          }).eq('id', fsRow.id)
        }
      }
    } else if (form.date !== distribution.date) {
      // Date-only change — update farm_expenses date too
      await supabase.from('farm_expenses').update({ date: form.date })
        .eq('distribution_id', distribution.id).eq('organization_id', organization?.id)
    }

    setSaving(false)
    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
  const newQty   = Number(form.quantity) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
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
