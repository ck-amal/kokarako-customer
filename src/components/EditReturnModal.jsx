import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

export default function EditReturnModal({ returnRow, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

  const cpu = Number(returnRow.cost_per_unit) ||
    (Number(returnRow.quantity) > 0
      ? roundCurrency(Math.abs(Number(returnRow.cost)) / Number(returnRow.quantity))
      : 0)

  const [form, setForm] = useState({
    quantity:      String(returnRow.quantity),
    date:          returnRow.date,
    return_reason: returnRow.return_reason || returnRow.notes || '',
  })
  const [maxQty, setMaxQty] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Compute max returnable qty: original purchase qty minus all OTHER return rows
  useEffect(() => {
    if (!returnRow.original_procurement_id) return
    Promise.all([
      supabase.from('procurement')
        .select('quantity')
        .eq('id', returnRow.original_procurement_id)
        .single(),
      supabase.from('procurement')
        .select('quantity')
        .eq('original_procurement_id', returnRow.original_procurement_id)
        .eq('is_return', true)
        .neq('id', returnRow.id)
        .eq('organization_id', organization.id),
    ]).then(([{ data: orig }, { data: others }]) => {
      const origQty    = Number(orig?.quantity || 0)
      const otherQty   = (others || []).reduce((s, r) => s + Number(r.quantity), 0)
      setMaxQty(Math.max(0, origQty - otherQty))
    })
  }, [])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const newQty = parseFloat(form.quantity)
    if (!newQty || newQty <= 0) { setError('Quantity must be greater than 0'); return }
    if (maxQty !== null && newQty > maxQty) {
      setError(`Maximum returnable quantity is ${maxQty.toLocaleString('en-IN')} ${returnRow.unit}`)
      return
    }

    setSaving(true)
    const oldQty  = Number(returnRow.quantity)
    const newCost = roundCurrency(-(newQty * cpu))
    const qtyDiff = newQty - oldQty

    const { error: upErr } = await supabase.from('procurement').update({
      quantity:        newQty,
      cost:            newCost,
      date:            form.date,
      return_reason:   form.return_reason.trim() || null,
      notes:           form.return_reason.trim() || null,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('id', returnRow.id)

    if (upErr) { setError(upErr.message); setSaving(false); return }

    if (qtyDiff !== 0) {
      // Update stock_ledger entry for this return
      await supabase.from('stock_ledger')
        .update({ quantity: newQty })
        .eq('reference_type', 'procurement_return')
        .eq('reference_id', returnRow.id)
        .eq('organization_id', organization.id)

      // Adjust stock:
      //   qtyDiff > 0 → returning more → remove more from stock
      //   qtyDiff < 0 → returning less → add back to stock
      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity')
        .ilike('item_name', returnRow.item_name)
        .eq('organization_id', organization.id)
        .maybeSingle()

      if (stockRow) {
        await supabase.from('stock').update({
          quantity: Math.max(0, Number(stockRow.quantity) - qtyDiff),
        }).eq('id', stockRow.id)
      }
    }

    onSaved()
  }

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Edit Return</h2>
            <p className="text-xs text-gray-400 mt-0.5">{returnRow.item_name} · {returnRow.unit}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Return Quantity *
              {maxQty !== null && (
                <span className="text-gray-400 font-normal ml-1">
                  (max {maxQty.toLocaleString('en-IN')} {returnRow.unit})
                </span>
              )}
            </label>
            <input
              required type="number" min="0.01" step="any"
              max={maxQty ?? undefined}
              value={form.quantity}
              onChange={set('quantity')}
              className={inputCls}
            />
            {parseFloat(form.quantity) > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Credit value: −{formatCurrency(parseFloat(form.quantity) * cpu)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Return Date *</label>
            <input
              required type="date"
              value={form.date}
              onChange={set('date')}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.return_reason}
              onChange={set('return_reason')}
              placeholder="e.g. Damaged goods"
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
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
