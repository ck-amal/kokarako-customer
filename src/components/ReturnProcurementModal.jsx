import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, roundCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { ledgerOut } from '../lib/stockLedger'
import { useAuth } from '../contexts/AuthContext'

/**
 * Return items from a purchase group back to the supplier.
 *
 * group shape:
 *   { purchase_group_id, date, supplierName, invoice_number, items: [...procurement rows] }
 */
export default function ReturnProcurementModal({ group, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { i18n } = useTranslation()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

  // Only show original purchase rows (not any existing return rows in the group)
  const purchasableItems = (group.items || []).filter(r => !r.is_return)

  const [returnDate, setReturnDate]         = useState(new Date().toISOString().slice(0, 10))
  const [returnReason, setReturnReason]     = useState('')
  const [quantities, setQuantities]         = useState(() =>
    Object.fromEntries(purchasableItems.map(item => [item.id, '']))
  )
  // alreadyReturned[itemId] = total qty already returned in previous return transactions
  const [alreadyReturned, setAlreadyReturned] = useState({})
  // stockQty[itemName.toLowerCase()] = current stock quantity
  const [stockQty, setStockQty]               = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Fetch already-returned quantities + current stock quantities
  useEffect(() => {
    const ids = purchasableItems.map(i => i.id)
    if (!ids.length) return
    Promise.all([
      supabase
        .from('procurement')
        .select('original_procurement_id, quantity')
        .in('original_procurement_id', ids)
        .eq('is_return', true)
        .eq('organization_id', organization.id),
      supabase
        .from('stock')
        .select('item_name, quantity')
        .eq('organization_id', organization.id),
    ]).then(([{ data: returnRows }, { data: stockRows }]) => {
      const returnMap = {}
      for (const row of (returnRows || [])) {
        returnMap[row.original_procurement_id] =
          (returnMap[row.original_procurement_id] || 0) + Number(row.quantity)
      }
      setAlreadyReturned(returnMap)

      const sMap = {}
      for (const row of (stockRows || [])) {
        sMap[row.item_name.toLowerCase()] = Number(row.quantity)
      }
      setStockQty(sMap)
    })
  }, [])

  function maxReturnQty(item) {
    const purchaseRemaining = Math.max(0, Number(item.quantity) - (alreadyReturned[item.id] || 0))
    const inStock           = stockQty[item.item_name.toLowerCase()] ?? Infinity
    return Math.min(purchaseRemaining, inStock)
  }

  function cpuOf(item) {
    return Number(item.cost_per_unit) ||
      (Number(item.quantity) > 0 ? roundCurrency(Number(item.cost) / Number(item.quantity)) : 0)
  }

  const totalReturnValue = purchasableItems.reduce((s, item) => {
    const qty = parseFloat(quantities[item.id]) || 0
    return s + qty * cpuOf(item)
  }, 0)

  async function handleSave() {
    setError('')

    const toReturn = purchasableItems.filter(item => parseFloat(quantities[item.id]) > 0)
    if (toReturn.length === 0) { setError('Enter at least one quantity to return'); return }

    for (const item of toReturn) {
      const returnQty = parseFloat(quantities[item.id])
      const maxQty    = maxReturnQty(item)
      if (returnQty > maxQty) {
        setError(`Return qty for "${item.item_name}" exceeds available stock (${maxQty} ${item.unit} available to return)`)
        return
      }
    }

    setSaving(true)
    const returnGroupId = crypto.randomUUID()

    for (const item of toReturn) {
      const returnQty  = parseFloat(quantities[item.id])
      const cpu        = cpuOf(item)
      const returnCost = roundCurrency(-(returnQty * cpu))

      const { data: inserted, error: insErr } = await supabase
        .from('procurement')
        .insert({
          organization_id:         organization.id,
          type:                    item.type,
          item_name:               item.item_name,
          item_id:                 item.item_id || null,
          quantity:                returnQty,
          unit:                    item.unit,
          cost:                    returnCost,
          cost_per_unit:           cpu,
          supplier_id:             item.supplier_id || null,
          date:                    returnDate,
          invoice_number:          item.invoice_number ? `${item.invoice_number}-RET` : null,
          notes:                   returnReason.trim() || null,
          is_return:               true,
          original_procurement_id: item.id,
          purchase_group_id:       returnGroupId,
          return_reason:           returnReason.trim() || null,
          created_by_id:           user?.id,
          created_by_name:         userName,
        })
        .select('id')
        .single()

      if (insErr) { setError(insErr.message); setSaving(false); return }

      // Reduce stock quantity
      const { data: stockRow } = await supabase
        .from('stock')
        .select('id, quantity')
        .ilike('item_name', item.item_name)
        .eq('organization_id', organization.id)
        .maybeSingle()

      if (!stockRow) { setError(`Stock record not found for "${item.item_name}"`); setSaving(false); return }

      const { error: stockErr } = await supabase
        .from('stock')
        .update({ quantity: Math.max(0, Number(stockRow.quantity) - returnQty) })
        .eq('id', stockRow.id)
      if (stockErr) { setError(stockErr.message); setSaving(false); return }

      // Stock ledger: record as an outflow
      await ledgerOut({
        itemName:       item.item_name,
        itemType:       item.type,
        quantity:       returnQty,
        unit:           item.unit,
        referenceType:  'procurement_return',
        referenceId:    inserted.id,
        date:           returnDate,
        organizationId: organization.id,
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Return to Supplier</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {group.supplierName}
            {group.invoice_number ? ` · Invoice ${group.invoice_number}` : ''}
            {' · '}{formatDate(group.date, i18n.language)}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto space-y-5 flex-1">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Return Date</label>
              <input
                type="date"
                value={returnDate}
                onChange={e => setReturnDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Reason <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder="e.g. Damaged goods"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">Quantities to Return</p>
            <div className="space-y-2">
              {purchasableItems.map(item => {
                const returnQty   = parseFloat(quantities[item.id]) || 0
                const returnValue = returnQty * cpuOf(item)
                const maxQty       = maxReturnQty(item)
                const prevReturned = alreadyReturned[item.id] || 0
                const inStock      = stockQty[item.item_name.toLowerCase()] ?? null
                const fullyReturned = maxQty <= 0 && prevReturned >= Number(item.quantity)
                return (
                  <div key={item.id} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${fullyReturned ? 'bg-gray-100 opacity-60' : 'bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{item.item_name}</p>
                      <p className="text-xs text-gray-400">
                        Purchased: {Number(item.quantity).toLocaleString('en-IN')} {item.unit}
                        {' · '}{formatCurrency(Number(item.cost))}
                      </p>
                      {prevReturned > 0 && (
                        <p className="text-xs text-teal-600 mt-0.5">
                          Already returned: {prevReturned.toLocaleString('en-IN')} {item.unit}
                        </p>
                      )}
                      {!fullyReturned && (
                        <p className={`text-xs mt-0.5 ${maxQty === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                          {maxQty > 0
                            ? `${maxQty.toLocaleString('en-IN')} ${item.unit} in stock · returnable`
                            : 'None in stock — all distributed'}
                        </p>
                      )}
                      {fullyReturned && (
                        <p className="text-xs text-teal-600 mt-0.5">Fully returned</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        max={maxQty}
                        value={quantities[item.id]}
                        disabled={fullyReturned}
                        onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                        placeholder="0"
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      />
                      <span className="text-xs text-gray-400 w-8 shrink-0">{item.unit}</span>
                      <span className={`text-xs font-semibold w-20 text-right shrink-0 ${returnValue > 0 ? 'text-teal-600' : 'text-gray-300'}`}>
                        {returnValue > 0 ? `−${formatCurrency(returnValue)}` : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {totalReturnValue > 0 && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-teal-700">Total Credit</span>
                <span className="text-base font-bold text-teal-700">−{formatCurrency(totalReturnValue)}</span>
              </div>
              <p className="text-xs text-teal-600 mt-0.5">
                Reduces this supplier's outstanding balance. No cash refund is recorded — adjust via a payment entry if needed.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
          >
            {saving ? 'Processing…' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>
  )
}
