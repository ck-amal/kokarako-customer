import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── FIFO status computation ──────────────────────────────────────────────────

function computePaymentStatus(procurements, totalPaid) {
  // procurements sorted oldest-first
  const sorted = [...procurements].sort((a, b) => new Date(a.date) - new Date(b.date))
  let remaining = totalPaid

  return sorted.map(p => {
    const cost = Number(p.cost)
    if (remaining >= cost) {
      remaining -= cost
      return { ...p, payStatus: 'Paid', paidAmount: cost }
    } else if (remaining > 0) {
      const paidAmount = remaining
      remaining = 0
      return { ...p, payStatus: 'Partial', paidAmount }
    } else {
      return { ...p, payStatus: 'Unpaid', paidAmount: 0 }
    }
  })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const styles = {
    Paid:    'bg-green-100 text-green-700',
    Partial: 'bg-amber-100 text-amber-700',
    Unpaid:  'bg-red-100   text-red-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ supplier, outstanding, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount:           '',
    payment_method:   'Cash',
    reference_number: '',
    payment_date:     new Date().toISOString().slice(0, 10),
    notes:            '',
    account_id:       '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = data || []
        setAccounts(list)
        const cash = list.find(a => a.type === 'cash')
        if (cash) setForm(f => ({ ...f, account_id: cash.id }))
      })
  }, [])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const overpaying = outstanding !== null && parseFloat(form.amount) > outstanding + 0.01

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)

    const { data: inserted, error: err } = await supabase.from('supplier_payments').insert({
      supplier_id:      supplier.id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      notes:            form.notes.trim() || null,
    }).select('id').single()

    if (err) { setError(err.message); setSaving(false); return }

    if (form.account_id && inserted) {
      await supabase.from('transactions').insert({
        account_id:       form.account_id,
        transaction_type: 'out',
        category:         'supplier_payment',
        description:      `Payment to ${supplier.name}`,
        amount:           amt,
        transaction_date: form.payment_date,
        reference_type:   'supplier_payment',
        reference_id:     inserted.id,
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Outstanding */}
        <div className={`rounded-lg px-4 py-3 mb-4 flex items-center justify-between ${
          outstanding > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
        }`}>
          <span className="text-sm font-medium text-gray-700">Outstanding Balance</span>
          <span className={`text-xl font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(outstanding)}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <input
              required type="number" min="0.01" step="0.01"
              value={form.amount} onChange={set('amount')}
              placeholder="e.g. 5000"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                overpaying ? 'border-orange-400 bg-orange-50' : 'border-gray-300'
              }`}
            />
            {overpaying && (
              <p className="text-xs text-orange-600 mt-1">⚠ This exceeds the outstanding balance</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
              <select
                value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>UPI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                required type="date"
                value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              value={form.reference_number} onChange={set('reference_number')}
              placeholder="Cheque no. or UTR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay from Account</label>
              <select
                value={form.account_id} onChange={set('account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">— don't record in ledger —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Purchases Tab ────────────────────────────────────────────────────────────

function PurchasesTab({ procurements, totalPaid }) {
  const [statusFilter, setStatusFilter] = useState('All')

  const withStatus = computePaymentStatus(procurements, totalPaid)
  const filtered = statusFilter === 'All' ? withStatus : withStatus.filter(p => p.payStatus === statusFilter)

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['All', 'Unpaid', 'Partial', 'Paid'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
              statusFilter === s ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === 'All' ? `All (${withStatus.length})` : s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-4xl mb-2">🛒</span>
          <p className="text-sm">No purchases {statusFilter !== 'All' ? `with status "${statusFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[650px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3">Unit</th>
                  <th className="px-5 py-3 text-right">Cost</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-amber-50/30 transition">
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(p.date)}</td>
                    <td className="px-5 py-3.5 font-medium text-gray-800">{p.item_name}</td>
                    <td className="px-5 py-3.5 text-gray-500 capitalize">{p.type}</td>
                    <td className="px-5 py-3.5 text-right text-gray-700">{Number(p.quantity).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3.5 text-gray-500">{p.unit}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-gray-800">{formatCurrency(p.cost)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={p.payStatus} />
                        {p.payStatus === 'Partial' && (
                          <span className="text-xs text-gray-400">
                            Paid {formatCurrency(p.paidAmount)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ payments }) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl mb-2">💳</span>
        <p className="text-sm">No payments recorded yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[550px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Amount</th>
              <th className="px-5 py-3">Method</th>
              <th className="px-5 py-3">Reference</th>
              <th className="px-5 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-green-50/30 transition">
                <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(p.payment_date)}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                <td className="px-5 py-3.5 text-gray-600">{p.payment_method || '—'}</td>
                <td className="px-5 py-3.5 text-gray-500">{p.reference_number || '—'}</td>
                <td className="px-5 py-3.5 text-gray-400 max-w-[160px] truncate" title={p.notes || ''}>{p.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-100">
              <td className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Paid</td>
              <td className="px-5 py-3 text-right font-bold text-green-600">
                {formatCurrency(payments.reduce((s, p) => s + Number(p.amount), 0))}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

function LedgerTab({ procurements, payments }) {
  // Merge and sort by date ascending
  const entries = [
    ...procurements.map(p => ({
      id:      p.id,
      date:    p.date,
      type:    'purchase',
      label:   p.item_name,
      sub:     p.type,
      debit:   Number(p.cost),
      credit:  0,
    })),
    ...payments.map(p => ({
      id:     p.id,
      date:   p.payment_date,
      type:   'payment',
      label:  `Payment — ${p.payment_method || 'Cash'}`,
      sub:    p.reference_number || '',
      debit:  0,
      credit: Number(p.amount),
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  // Running balance
  let balance = 0
  const rows = entries.map(e => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-4xl mb-2">📒</span>
        <p className="text-sm">No transactions yet</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[550px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3 text-right">Debit (You owe)</th>
              <th className="px-5 py-3 text-right">Credit (You paid)</th>
              <th className="px-5 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(r => (
              <tr key={`${r.type}-${r.id}`} className={`transition ${r.type === 'payment' ? 'hover:bg-green-50/30' : 'hover:bg-red-50/20'}`}>
                <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-gray-800">{r.label}</p>
                  {r.sub && <p className="text-xs text-gray-400 capitalize">{r.sub}</p>}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-red-500">
                  {r.debit > 0 ? formatCurrency(r.debit) : '—'}
                </td>
                <td className="px-5 py-3.5 text-right font-semibold text-green-600">
                  {r.credit > 0 ? formatCurrency(r.credit) : '—'}
                </td>
                <td className={`px-5 py-3.5 text-right font-bold ${r.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(r.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SupplierDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()

  const [supplier,      setSupplier]      = useState(null)
  const [procurements,  setProcurements]  = useState([])
  const [payments,      setPayments]      = useState([])
  const [loading,       setLoading]       = useState(true)
  const [activeTab,     setActiveTab]     = useState('Purchases')
  const [payModal,      setPayModal]      = useState(false)

  async function fetchAll() {
    setLoading(true)
    const [{ data: sup }, { data: procs }, { data: pays }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('id', id).single(),
      supabase.from('procurement').select('*').eq('supplier_id', id).order('date', { ascending: false }),
      supabase.from('supplier_payments').select('*').eq('supplier_id', id).order('payment_date', { ascending: false }),
    ])
    setSupplier(sup)
    setProcurements(procs || [])
    setPayments(pays || [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [id])

  const totalPurchased = procurements.reduce((s, p) => s + Number(p.cost), 0)
  const totalPaid      = payments.reduce((s, p) => s + Number(p.amount), 0)
  const outstanding    = Math.max(0, totalPurchased - totalPaid)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <span className="text-5xl mb-3">🤝</span>
        <p className="text-sm font-medium">Supplier not found</p>
        <button onClick={() => navigate('/suppliers')} className="text-xs text-amber-500 hover:underline mt-1">← Back to Suppliers</button>
      </div>
    )
  }

  const TABS = ['Purchases', 'Payments', 'Ledger']

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button
            onClick={() => navigate('/suppliers')}
            className="text-sm text-gray-500 hover:text-amber-600 flex items-center gap-1 mb-2 transition"
          >
            ← Suppliers
          </button>
          <h1 className="text-2xl font-bold text-gray-800">{supplier.name}</h1>
          {supplier.business_name && (
            <p className="text-sm text-gray-500 mt-0.5">{supplier.business_name}</p>
          )}
          {supplier.phone && (
            <p className="text-sm text-gray-500 mt-0.5">📞 {supplier.phone}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-base font-bold ${
            outstanding > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {outstanding > 0 ? `${formatCurrency(outstanding)} owed` : '✓ All cleared'}
          </span>
          {outstanding > 0 && (
            <button
              onClick={() => setPayModal(true)}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition"
            >
              💳 Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Purchased</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{formatCurrency(totalPurchased)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-100 shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Paid</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${outstanding > 0 ? 'border-red-200' : 'border-gray-100'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Outstanding</p>
          <p className={`text-xl font-bold mt-1 ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(outstanding)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Purchases' && (
        <PurchasesTab procurements={procurements} totalPaid={totalPaid} />
      )}
      {activeTab === 'Payments' && (
        <PaymentsTab payments={payments} />
      )}
      {activeTab === 'Ledger' && (
        <LedgerTab procurements={procurements} payments={payments} />
      )}

      {/* Payment modal */}
      {payModal && (
        <RecordPaymentModal
          supplier={supplier}
          outstanding={outstanding}
          onClose={() => setPayModal(false)}
          onSaved={() => { setPayModal(false); fetchAll() }}
        />
      )}
    </div>
  )
}
