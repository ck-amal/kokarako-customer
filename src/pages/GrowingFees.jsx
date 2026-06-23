import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    paid:    'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
    pending: 'bg-red-100 text-red-700',
  }
  const labels = {
    paid:    '✓ Paid',
    partial: 'Partial',
    pending: 'Pending',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ─── Give Advance Modal (reused from BatchDetail logic) ───────────────────────

function GiveAdvanceModal({ farms, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    farm_id:          '',
    batch_id:         '',
    account_id:       '',
    amount:           '',
    payment_date:     today,
    payment_method:   'Cash',
    reference_number: '',
    notes:            '',
  })
  const [accounts,      setAccounts]      = useState([])
  const [activeBatches, setActiveBatches] = useState([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('is_active', true).order('created_at')
      .then(({ data }) => {
        const accs = data || []
        setAccounts(accs)
        const cashAcc = accs.find(a => a.type === 'cash') ?? accs[0]
        if (cashAcc) setForm(f => ({ ...f, account_id: cashAcc.id }))
      })
  }, [])

  useEffect(() => {
    if (!form.farm_id) { setActiveBatches([]); setForm(f => ({ ...f, batch_id: '' })); return }
    supabase.from('batches').select('id, start_date, chick_count').eq('farm_id', form.farm_id).eq('status', 'active').order('start_date')
      .then(({ data }) => {
        const bs = data || []
        setActiveBatches(bs)
        setForm(f => ({ ...f, batch_id: bs[0]?.id ?? '' }))
      })
  }, [form.farm_id])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  const selectedFarm = farms.find(f => f.id === form.farm_id)

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')
    if (!form.farm_id) { setError('Select a farm'); return }
    if (!form.batch_id) { setError('Select a batch'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!form.account_id) { setError('Select an account'); return }

    setSaving(true)

    const { data: adv, error: advErr } = await supabase.from('growing_fee_advances').insert({
      farm_id:          form.farm_id,
      batch_id:         form.batch_id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      account_id:       form.account_id,
      notes:            form.notes.trim() || null,
    }).select('id').single()

    if (advErr) { setError(advErr.message); setSaving(false); return }

    const { data: currentBatch } = await supabase.from('batches').select('total_advances').eq('id', form.batch_id).single()
    await supabase.from('batches').update({
      total_advances: Number(currentBatch?.total_advances || 0) + amt,
    }).eq('id', form.batch_id)

    const selectedBatch = activeBatches.find(b => b.id === form.batch_id)
    const batchStartDate = selectedBatch ? new Date(selectedBatch.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
    await supabase.from('transactions').insert({
      account_id:       form.account_id,
      transaction_type: 'out',
      category:         'growing_fee_advance',
      description:      `Growing fee advance — ${selectedFarm?.owner_name || selectedFarm?.name || 'Farm owner'}${batchStartDate ? ', Batch ' + batchStartDate : ''}`,
      amount:           amt,
      transaction_date: form.payment_date,
      reference_type:   'growing_fee_advance',
      reference_id:     adv.id,
    })

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Growing Fee Advance Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Farm */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
            <select required value={form.farm_id} onChange={set('farm_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
              <option value="">Select a farm…</option>
              {farms.map(f => <option key={f.id} value={f.id}>{f.name}{f.owner_name ? ` — ${f.owner_name}` : ''}</option>)}
            </select>
          </div>

          {/* Batch */}
          {form.farm_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
              {activeBatches.length === 0 ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  No active batch for this farm. Advances can only be given during an active batch.
                </div>
              ) : activeBatches.length === 1 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 font-medium">
                  Batch {new Date(activeBatches[0].start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — Day {Math.floor((Date.now() - new Date(activeBatches[0].start_date + 'T00:00:00')) / 86400000)} — {Number(activeBatches[0].chick_count).toLocaleString('en-IN')} chicks
                </div>
              ) : (
                <select required value={form.batch_id} onChange={set('batch_id')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                  {activeBatches.map(b => {
                    const day = Math.floor((Date.now() - new Date(b.start_date + 'T00:00:00')) / 86400000)
                    const sd = new Date(b.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    return <option key={b.id} value={b.id}>Batch {sd} — Day {day} — {Number(b.chick_count).toLocaleString('en-IN')} chicks</option>
                  })}
                </select>
              )}
            </div>
          )}

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay From Account *</label>
              <select required value={form.account_id} onChange={set('account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">Select account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '📱'} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>

          {/* Date + Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
              <input required type="date" value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input value={form.reference_number} onChange={set('reference_number')} placeholder="e.g. Cheque no. or UTR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving || (form.farm_id && activeBatches.length === 0)}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Record Advance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ initialFarmId, farmGroups, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    farm_id:          initialFarmId ?? '',
    account_id:       '',
    amount:           '',
    payment_date:     today,
    payment_method:   'Cash',
    reference_number: '',
    notes:            '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('is_active', true).order('created_at')
      .then(({ data }) => {
        const accs = data || []
        setAccounts(accs)
        // Default to first cash account
        const cashAcc = accs.find(a => a.type === 'cash') ?? accs[0]
        if (cashAcc) setForm(f => ({ ...f, account_id: cashAcc.id }))
      })
  }, [])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  // Selected farm's pending/partial ledger entries
  const selectedGroup = farmGroups.find(g => g.farm_id === form.farm_id) ?? null

  const pendingEntries = selectedGroup
    ? selectedGroup.entries.filter(e => e.status !== 'paid').sort((a, b) => new Date(a.calculated_at) - new Date(b.calculated_at))
    : []

  const totalOutstanding = pendingEntries.reduce((s, e) => s + Number(e.balance_due), 0)

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')

    if (!form.farm_id) { setError('Please select a farm'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }

    setSaving(true)

    // 1. Insert payment record (general payment against farm)
    const { data: inserted, error: insertErr } = await supabase.from('growing_fee_payments').insert({
      farm_id:               form.farm_id,
      growing_fee_ledger_id: null,
      amount:                amt,
      payment_date:          form.payment_date,
      payment_method:        form.payment_method || null,
      reference_number:      form.reference_number.trim() || null,
      notes:                 form.notes.trim() || null,
    }).select('id').single()

    if (insertErr) { setError(insertErr.message); setSaving(false); return }

    // 2. Record transaction to deduct from Cash & Bank
    if (form.account_id && inserted?.id) {
      await supabase.from('transactions').insert({
        account_id:       form.account_id,
        transaction_type: 'out',
        category:         'growing_fee_payment',
        description:      `Growing fee payment — ${selectedGroup?.owner_name || selectedGroup?.farm_name || 'Farm owner'}`,
        amount:           amt,
        transaction_date: form.payment_date,
        reference_type:   'growing_fee_payment',
        reference_id:     inserted.id,
      })
    }

    // 3. Distribute payment FIFO across pending/partial entries (oldest first)
    let remaining = amt
    for (const entry of pendingEntries) {
      if (remaining <= 0) break

      const entryBalance = Number(entry.balance_due)
      const applied = Math.min(remaining, entryBalance)
      remaining -= applied

      const newAmountPaid  = Number(entry.amount_paid) + applied
      const newBalanceDue  = entryBalance - applied
      const newStatus      = newBalanceDue <= 0.001 ? 'paid' : 'partial'

      const { error: updateErr } = await supabase
        .from('growing_fee_ledger')
        .update({
          amount_paid: newAmountPaid,
          balance_due: newBalanceDue,
          status:      newStatus,
        })
        .eq('id', entry.id)

      if (updateErr) {
        setError(`Failed to update ledger entry: ${updateErr.message}`)
        setSaving(false)
        return
      }
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Record Growing Fee Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Farm selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
            <select
              required value={form.farm_id} onChange={set('farm_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Select a farm…</option>
              {farmGroups.map(g => {
                const outstanding = g.entries.filter(e => e.status !== 'paid').reduce((s, e) => s + Number(e.balance_due), 0)
                return (
                  <option key={g.farm_id} value={g.farm_id}>
                    {g.farm_name} — Outstanding: {formatCurrency(outstanding)}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Account selector */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay From Account *</label>
              <select
                required value={form.account_id} onChange={set('account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select account…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '📱'} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pending ledger entries for selected farm */}
          {selectedGroup && pendingEntries.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending Fee Records</p>
              <div className="space-y-2">
                {pendingEntries.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        {e.fcr_tier_description || `FCR ${Number(e.fcr).toFixed(2)}`}
                        {e.batch_start_date ? ` — Batch ${formatDate(e.batch_start_date)}` : ''}
                      </p>
                      <p className="text-xs text-gray-400">
                        Rate {formatCurrency(e.rate_per_kg)}/kg · {Number(e.total_sale_kg).toLocaleString('en-IN')} kg
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={e.status} />
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(e.balance_due)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 mt-3 pt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-600">Total Outstanding</span>
                <span className="text-base font-bold text-red-600">{formatCurrency(totalOutstanding)}</span>
              </div>
            </div>
          )}

          {selectedGroup && pendingEntries.length === 0 && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
              All fees for this farm are fully paid.
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input
                required type="number" min="0.01" step="0.01"
                value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            {form.amount && totalOutstanding > 0 && parseFloat(form.amount) > totalOutstanding + 0.01 && (
              <p className="text-xs text-orange-600 mt-1">This exceeds the total outstanding balance</p>
            )}
          </div>

          {/* Payment Date + Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
              <input
                required type="date"
                value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference Number <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.reference_number} onChange={set('reference_number')}
              placeholder="e.g. Cheque no. or UTR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

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
              className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Farm Group Card ──────────────────────────────────────────────────────────

function FarmGroup({ group, onPayment }) {
  const { farm_name, owner_name, owner_phone, entries } = group

  const outstanding = entries
    .filter(e => e.status !== 'paid')
    .reduce((s, e) => s + Number(e.balance_due), 0)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Farm header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 bg-gray-50 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-800 truncate">{farm_name}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {owner_name}
            {owner_phone && (
              <span>
                {' · '}
                <a
                  href={`tel:${owner_phone}`}
                  className="text-blue-600 hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  {owner_phone}
                </a>
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-sm text-gray-500">
          {entries.length} batch{entries.length !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Batch rows table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="px-5 py-2.5">Batch</th>
              <th className="px-5 py-2.5 text-right">FCR</th>
              <th className="px-5 py-2.5">Tier</th>
              <th className="px-5 py-2.5 text-right">Rate/kg</th>
              <th className="px-5 py-2.5 text-right">Gross Fee</th>
              <th className="px-5 py-2.5 text-right">Advances</th>
              <th className="px-5 py-2.5 text-right">Post-close</th>
              <th className="px-5 py-2.5 text-right">Balance</th>
              <th className="px-5 py-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50/60 transition">
                <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                  {entry.batch_start_date ? formatDate(entry.batch_start_date) : '—'}
                </td>
                <td className="px-5 py-3 text-right font-medium text-gray-700">
                  {Number(entry.fcr).toFixed(2)}
                </td>
                <td className="px-5 py-3 text-gray-600 max-w-[160px] truncate" title={entry.fcr_tier_description || ''}>
                  {entry.fcr_tier_description || '—'}
                </td>
                <td className="px-5 py-3 text-right text-gray-700">
                  {formatCurrency(entry.rate_per_kg)}
                </td>
                <td className="px-5 py-3 text-right font-semibold text-gray-800">
                  {formatCurrency(entry.total_fee)}
                </td>
                <td className="px-5 py-3 text-right text-amber-600 font-medium">
                  {Number(entry.total_advances) > 0 ? formatCurrency(entry.total_advances) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-5 py-3 text-right text-green-600 font-medium">
                  {Number(entry.amount_paid) > 0 ? formatCurrency(entry.amount_paid) : <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-5 py-3 text-right font-semibold ${Number(entry.balance_due) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {Number(entry.balance_due) > 0 ? formatCurrency(entry.balance_due) : '—'}
                </td>
                <td className="px-5 py-3 text-center">
                  <StatusBadge status={entry.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Farm footer */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        <div className="text-sm">
          <span className="text-gray-500">Outstanding: </span>
          <span className={`font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {outstanding > 0 ? formatCurrency(outstanding) : 'Fully paid'}
          </span>
        </div>
        {outstanding > 0 && (
          <button
            onClick={() => onPayment(group.farm_id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white transition"
          >
            Record Payment
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GrowingFees() {
  const [ledger, setLedger]               = useState([])
  const [farms, setFarms]                 = useState([])
  const [activeBatchFarms, setActiveBatchFarms] = useState([]) // farms with active batches + advance totals
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [statusFilter, setStatusFilter]   = useState('All')
  const [farmFilter, setFarmFilter]       = useState('')
  const [payModal, setPayModal]           = useState(false)
  const [payFarmId, setPayFarmId]         = useState(null)
  const [advModal, setAdvModal]           = useState(false)
  const [paidThisMonth, setPaidThisMonth] = useState(0)

  async function fetchData() {
    setLoading(true)
    setError('')
    const { start, end } = currentMonthRange()

    const [
      { data: ledgerRows, error: ledgerErr },
      { data: farmRows,   error: farmErr   },
      { data: batchRows,  error: batchErr  },
      { data: monthPays,  error: monthErr  },
      { data: activeBatches },
    ] = await Promise.all([
      supabase
        .from('growing_fee_ledger')
        .select('id, farm_id, batch_id, owner_name, fcr, fcr_tier_description, rate_per_kg, total_sale_kg, total_fee, total_advances, status, amount_paid, balance_due, calculated_at, created_at')
        .order('calculated_at', { ascending: false }),
      supabase
        .from('farms')
        .select('id, name, owner_name, owner_phone'),
      supabase
        .from('batches')
        .select('id, start_date'),
      supabase
        .from('growing_fee_payments')
        .select('amount')
        .gte('payment_date', start)
        .lte('payment_date', end),
      supabase
        .from('batches')
        .select('id, farm_id, start_date, chick_count, total_advances')
        .eq('status', 'active'),
    ])

    if (ledgerErr || farmErr || batchErr || monthErr) {
      setError((ledgerErr || farmErr || batchErr || monthErr).message)
      setLoading(false)
      return
    }

    // Build lookup maps
    const farmMap  = Object.fromEntries((farmRows  || []).map(f => [f.id, f]))
    const batchMap = Object.fromEntries((batchRows || []).map(b => [b.id, b]))

    // Enrich ledger rows
    const enriched = (ledgerRows || []).map(row => ({
      ...row,
      farm_name:        farmMap[row.farm_id]?.name       ?? row.owner_name ?? '—',
      owner_name_disp:  farmMap[row.farm_id]?.owner_name ?? row.owner_name ?? '—',
      owner_phone:      farmMap[row.farm_id]?.owner_phone ?? null,
      batch_start_date: batchMap[row.batch_id]?.start_date ?? null,
    }))

    // Build active batch farms list (farms that have at least one active batch)
    const farmMap2 = Object.fromEntries((farmRows || []).map(f => [f.id, f]))
    const activeFarmMap = {}
    for (const b of (activeBatches || [])) {
      const f = farmMap2[b.farm_id]
      if (!f) continue
      if (!activeFarmMap[b.farm_id]) {
        activeFarmMap[b.farm_id] = {
          farm_id:    b.farm_id,
          farm_name:  f.name,
          owner_name: f.owner_name,
          batches:    [],
        }
      }
      activeFarmMap[b.farm_id].batches.push(b)
    }
    setActiveBatchFarms(Object.values(activeFarmMap))

    setLedger(enriched)
    setFarms(farmRows || [])
    setPaidThisMonth((monthPays || []).reduce((s, r) => s + Number(r.amount), 0))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // ── Summary stats ──
  const pendingRows       = ledger.filter(r => r.status !== 'paid')
  const totalPending      = pendingRows.reduce((s, r) => s + Number(r.balance_due), 0)
  const farmsWithPending  = new Set(pendingRows.map(r => r.farm_id)).size
  const totalGrossFees    = ledger.reduce((s, r) => s + Number(r.total_fee || 0), 0)
  const totalAdvancesGiven= ledger.reduce((s, r) => s + Number(r.total_advances || 0), 0)
  const totalPostClosePaid= ledger.reduce((s, r) => s + Number(r.amount_paid || 0), 0)

  // ── Filter ledger ──
  const filtered = ledger.filter(row => {
    const matchStatus = statusFilter === 'All' || row.status === statusFilter.toLowerCase()
    const matchFarm   = !farmFilter || row.farm_id === farmFilter
    return matchStatus && matchFarm
  })

  // ── Group by farm ──
  const farmGroupMap = {}
  for (const row of filtered) {
    if (!farmGroupMap[row.farm_id]) {
      farmGroupMap[row.farm_id] = {
        farm_id:   row.farm_id,
        farm_name: row.farm_name,
        owner_name: row.owner_name_disp,
        owner_phone: row.owner_phone,
        entries:   [],
      }
    }
    farmGroupMap[row.farm_id].entries.push(row)
  }
  const farmGroups = Object.values(farmGroupMap)

  // For the modal, always pass all ledger-having farm groups (unfiltered by status/farm)
  const allFarmGroups = (() => {
    const map = {}
    for (const row of ledger) {
      if (!map[row.farm_id]) {
        map[row.farm_id] = {
          farm_id:    row.farm_id,
          farm_name:  row.farm_name,
          owner_name: row.owner_name_disp,
          owner_phone: row.owner_phone,
          entries:    [],
        }
      }
      map[row.farm_id].entries.push(row)
    }
    return Object.values(map)
  })()

  // Unique farms in ledger for the filter dropdown
  const ledgerFarms = (() => {
    const seen = new Set()
    const result = []
    for (const row of ledger) {
      if (!seen.has(row.farm_id)) {
        seen.add(row.farm_id)
        result.push({ id: row.farm_id, name: row.farm_name })
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  })()

  function openPayment(farmId) {
    setPayFarmId(farmId)
    setPayModal(true)
  }

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Growing Fees</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track and manage growing fee payments to farm owners</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdvModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 px-4 py-2 text-sm font-semibold transition"
          >
            Give Advance
          </button>
          <button
            onClick={() => { setPayFarmId(null); setPayModal(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> Record Payment
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {/* Total Gross Fees */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Gross Fees</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(totalGrossFees)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{ledger.length} batch{ledger.length !== 1 ? 'es' : ''}</p>
          </div>

          {/* Total Advances Given */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Advances Given</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(totalAdvancesGiven)}</p>
            <p className="text-xs text-gray-400 mt-0.5">settled at batch close</p>
          </div>

          {/* Post-close Paid */}
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Post-close Paid</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalPostClosePaid)}</p>
            <p className="text-xs text-gray-400 mt-0.5">payments after batch close</p>
          </div>

          {/* Total Pending */}
          <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 ${totalPending > 0 ? 'border-red-200' : 'border-gray-100'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Balance Pending</p>
            <p className={`text-2xl font-bold mt-1 ${totalPending > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(totalPending)}
            </p>
            {totalPending === 0 && <p className="text-xs text-gray-400 mt-0.5">All cleared</p>}
          </div>

          {/* Paid This Month */}
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid This Month</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{formatCurrency(paidThisMonth)}</p>
          </div>

          {/* Farms with Pending */}
          <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 ${farmsWithPending > 0 ? 'border-amber-200' : 'border-gray-100'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Farms with Pending</p>
            <p className={`text-2xl font-bold mt-1 ${farmsWithPending > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
              {farmsWithPending}
            </p>
            {farmsWithPending === 0 && <p className="text-xs text-gray-400 mt-0.5">No outstanding fees</p>}
          </div>
        </div>
      )}

      {/* ── Active Batch Advances ── */}
      {!loading && activeBatchFarms.length > 0 && (
        <div className="bg-white border border-green-100 rounded-2xl shadow-sm overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 bg-green-50 border-b border-green-100">
            <div>
              <p className="text-sm font-bold text-green-800">Active Batch Advances</p>
              <p className="text-xs text-green-600 mt-0.5">Advance payments given during active batches</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-5 py-2.5">Farm</th>
                  <th className="px-5 py-2.5">Owner</th>
                  <th className="px-5 py-2.5">Active Batch</th>
                  <th className="px-5 py-2.5 text-right">Advances Given</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeBatchFarms.map(af => {
                  const totalAdv = af.batches.reduce((s, b) => s + Number(b.total_advances || 0), 0)
                  const newestBatch = af.batches.sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0]
                  const day = newestBatch ? Math.floor((Date.now() - new Date(newestBatch.start_date + 'T00:00:00')) / 86400000) : 0
                  return (
                    <tr key={af.farm_id} className="hover:bg-gray-50/60 transition">
                      <td className="px-5 py-3 font-medium text-gray-800">{af.farm_name}</td>
                      <td className="px-5 py-3 text-gray-500">{af.owner_name || '—'}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {newestBatch ? `Batch ${formatDate(newestBatch.start_date)} — Day ${day}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-amber-700">
                        {totalAdv > 0 ? formatCurrency(totalAdv) : <span className="text-gray-300 font-normal">None yet</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setAdvModal(true)}
                          className="rounded-lg border border-green-500 text-green-700 hover:bg-green-50 px-3 py-1.5 text-xs font-medium transition"
                        >
                          Give Advance
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Filter bar ── */}
      {!loading && ledger.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Status segmented buttons */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {['All', 'Pending', 'Partial', 'Paid'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === s
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Farm dropdown */}
          {ledgerFarms.length > 1 && (
            <select
              value={farmFilter} onChange={e => setFarmFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
            >
              <option value="">All Farms</option>
              {ledgerFarms.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-5 py-4 max-w-md">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : ledger.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <span className="text-5xl mb-3">🐔</span>
          <p className="text-sm font-medium text-gray-500">No growing fee records yet</p>
          <p className="text-xs mt-1 text-gray-400">Fee records are created when a batch is finalised</p>
        </div>
      ) : farmGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-4xl mb-2">🔍</span>
          <p className="text-sm">No records match the current filters</p>
          <button
            onClick={() => { setStatusFilter('All'); setFarmFilter('') }}
            className="text-xs text-blue-600 hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {farmGroups.map(group => (
            <FarmGroup key={group.farm_id} group={group} onPayment={openPayment} />
          ))}
        </div>
      )}

      {/* ── Advance modal ── */}
      {advModal && (
        <GiveAdvanceModal
          farms={farms}
          onClose={() => setAdvModal(false)}
          onSaved={() => { setAdvModal(false); fetchData() }}
        />
      )}

      {/* ── Payment modal ── */}
      {payModal && (
        <RecordPaymentModal
          initialFarmId={payFarmId}
          farmGroups={allFarmGroups}
          onClose={() => { setPayModal(false); setPayFarmId(null) }}
          onSaved={() => { setPayModal(false); setPayFarmId(null); fetchData() }}
        />
      )}
    </div>
  )
}
