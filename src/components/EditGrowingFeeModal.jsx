import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, roundCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

/**
 * Edit Growing Fee modal.
 *
 * entry shape (pass the growing_fee_ledger row + batch_id):
 *   { id, batch_id, total_fee, other_expenses, total_advances, amount_paid }
 *
 * other_expenses is an array of { id, description, amount } items.
 * The stored total_fee = base_fee + sum(other_expenses.amounts).
 */
export default function EditGrowingFeeModal({ entry, onClose, onSaved }) {
  const { user } = useAuth()

  const existingOthers = (entry.other_expenses || []).map(e => ({ ...e }))
  const othersSum = existingOthers.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const initBase = roundCurrency(Number(entry.total_fee || 0) - othersSum)

  const [baseFee, setBaseFee]           = useState(String(initBase > 0 ? initBase : Number(entry.total_fee || 0)))
  const [extras, setExtras]             = useState(
    existingOthers.length > 0 ? existingOthers : []
  )
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  function addExtra() {
    setExtras(prev => [...prev, { id: `new-${Date.now()}`, description: '', amount: '' }])
  }

  function removeExtra(id) {
    setExtras(prev => prev.filter(e => e.id !== id))
  }

  function updateExtra(id, field, value) {
    setExtras(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e))
  }

  const baseNum   = parseFloat(baseFee) || 0
  const extrasTotal = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const newTotal  = roundCurrency(baseNum + extrasTotal)

  const totalPaid   = Number(entry.total_advances || 0) + Number(entry.amount_paid || 0)
  const newBalance  = roundCurrency(Math.max(0, newTotal - totalPaid))
  const newOverpaid = roundCurrency(Math.max(0, totalPaid - newTotal))
  const newStatus   = newBalance === 0
    ? (newOverpaid > 0 ? 'overpaid' : 'paid')
    : totalPaid > 0 ? 'partial' : 'pending'

  async function handleSave() {
    if (isNaN(baseNum) || baseNum < 0) { setError('Enter a valid base fee'); return }

    const invalidExtra = extras.find(e => !e.description.trim() || isNaN(parseFloat(e.amount)))
    if (invalidExtra) { setError('Each extra expense needs a description and a valid amount'); return }

    setError('')
    setSaving(true)
    try {
      const cleanExtras = extras.map(e => ({
        id:          e.id,
        description: e.description.trim(),
        amount:      roundCurrency(parseFloat(e.amount)),
      }))
      const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

      const { error: lErr } = await supabase
        .from('growing_fee_ledger')
        .update({
          total_fee:      newTotal,
          other_expenses: cleanExtras,
          balance_due:    newBalance,
          overpaid_amount: newOverpaid,
          status:         newStatus,
        })
        .eq('id', entry.id)
      if (lErr) throw lErr

      const { error: bErr } = await supabase
        .from('batches')
        .update({
          growing_fee_total: newTotal,
          updated_by_id:     user?.id,
          updated_by_name:   userName,
          updated_at:        new Date().toISOString(),
        })
        .eq('id', entry.batch_id)
      if (bErr) throw bErr

      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Edit Growing Fee</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Adjust the base fee and add any extra farm-owner expenses. The total will be recalculated.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto space-y-5 flex-1">

          {/* Base fee */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Base Growing Fee (₹)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={baseFee}
              onChange={e => setBaseFee(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="0.00"
            />
          </div>

          {/* Other expenses */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-semibold text-gray-600">Other Expenses</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Expenses paid by the farm owner (e.g. medicines, equipment)
                </p>
              </div>
              <button
                type="button"
                onClick={addExtra}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 border border-orange-300 hover:bg-orange-50 rounded-lg px-2.5 py-1.5 transition"
              >
                <span className="text-base leading-none">+</span> Add Item
              </button>
            </div>

            {extras.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                No extra expenses added yet
              </div>
            )}

            <div className="space-y-2">
              {extras.map((item, idx) => (
                <div key={item.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => updateExtra(item.id, 'description', e.target.value)}
                      placeholder="Description (e.g. Medicines bought by owner)"
                      className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 mb-1.5"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400 shrink-0">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount}
                        onChange={e => updateExtra(item.id, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExtra(item.id)}
                    className="text-gray-300 hover:text-red-400 transition mt-0.5 shrink-0"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Base Fee</span>
              <span className="font-medium text-gray-700">{formatCurrency(baseNum)}</span>
            </div>
            {extras.length > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Other Expenses ({extras.length} item{extras.length > 1 ? 's' : ''})</span>
                <span className="font-medium text-gray-700">+ {formatCurrency(extrasTotal)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-800">
              <span>Total Growing Fee</span>
              <span>{formatCurrency(newTotal)}</span>
            </div>
            {totalPaid > 0 && (
              <>
                <div className="flex justify-between text-gray-500 text-xs">
                  <span>Already Paid (advances + post-close)</span>
                  <span>− {formatCurrency(totalPaid)}</span>
                </div>
                <div className={`flex justify-between text-xs font-semibold ${newBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <span>{newOverpaid > 0 ? 'Overpaid Credit' : 'New Balance Due'}</span>
                  <span>{newOverpaid > 0 ? `+ ${formatCurrency(newOverpaid)}` : formatCurrency(newBalance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-gray-100">
          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
          <div className="flex gap-3">
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
              className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
