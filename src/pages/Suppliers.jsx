import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

// ─── Add/Edit Supplier Modal ──────────────────────────────────────────────────

function SupplierModal({ supplier, onClose, onSaved }) {
  const { organization } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name:            supplier?.name            ?? '',
    phone:           supplier?.phone           ?? '',
    address:         supplier?.address         ?? '',
    notes:           supplier?.notes           ?? '',
    opening_balance: supplier?.opening_balance != null ? String(supplier.opening_balance) : '0',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const isEdit = !!supplier

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError(t('errors.required')); return }
    setSaving(true)

    const openingBal = parseFloat(form.opening_balance) || 0
    const payload = {
      name:            form.name.trim(),
      phone:           form.phone.trim()   || null,
      address:         form.address.trim() || null,
      notes:           form.notes.trim()   || null,
      opening_balance: openingBal,
    }

    const { error: err } = isEdit
      ? await supabase.from('suppliers').update(payload).eq('organization_id', organization.id).eq('id', supplier.id)
      : await supabase.from('suppliers').insert({ ...payload, organization_id: organization.id })

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {isEdit ? t('suppliers.editSupplier') : t('suppliers.addSupplier')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.name')} *</label>
            <input
              required value={form.name} onChange={set('name')}
              placeholder="e.g. Rajan Feed Suppliers"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.phone')}</label>
            <input
              value={form.phone} onChange={set('phone')}
              placeholder="e.g. 9876543210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.address')}</label>
            <textarea
              rows={2} value={form.address} onChange={set('address')}
              placeholder="Street, City…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
            <textarea
              rows={2} value={form.notes} onChange={set('notes')}
              placeholder="Any notes…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opening Balance (₹) <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <input
                type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Positive = amount owed to supplier before using this system. Negative = advance already given to supplier.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? t('common.loading') : isEdit ? t('common.save') : t('suppliers.addSupplier')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({ suppliers, initialSupplierId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({
    supplier_id:      initialSupplierId ?? '',
    amount:           '',
    payment_method:   'Cash',
    reference_number: '',
    payment_date:     new Date().toISOString().slice(0, 10),
    notes:            '',
    account_id:       '',
  })
  const [accounts, setAccounts]       = useState([])
  const [outstanding, setOutstanding] = useState(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('organization_id', organization.id).eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = data || []
        setAccounts(list)
        const cash = list.find(a => a.type === 'cash')
        if (cash) setForm(f => ({ ...f, account_id: cash.id }))
      })
  }, [])

  // Recompute outstanding when supplier changes
  useEffect(() => {
    if (!form.supplier_id) { setOutstanding(null); return }
    async function load() {
      const [{ data: sup }, { data: procs }, { data: pays }] = await Promise.all([
        supabase.from('suppliers').select('opening_balance').eq('organization_id', organization.id).eq('id', form.supplier_id).single(),
        supabase.from('procurement').select('cost').eq('organization_id', organization.id).eq('supplier_id', form.supplier_id),
        supabase.from('supplier_payments').select('amount').eq('organization_id', organization.id).eq('supplier_id', form.supplier_id),
      ])
      const openingBal = Number(sup?.opening_balance || 0)
      const totalCost  = (procs || []).reduce((s, r) => s + Number(r.cost), 0)
      const totalPaid  = (pays  || []).reduce((s, r) => s + Number(r.amount), 0)
      setOutstanding(openingBal + totalCost - totalPaid)
    }
    load()
  }, [form.supplier_id])

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.supplier_id)  { setError('Select a supplier'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0)   { setError('Enter a valid amount'); return }
    if (outstanding !== null && amt > outstanding + 0.01) {
      setError(`Amount (${formatCurrency(amt)}) exceeds outstanding balance (${formatCurrency(outstanding)}). Are you sure?`)
      // Allow submit anyway — just a warning shown in error area
    }
    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    const { data: inserted, error: err } = await supabase.from('supplier_payments').insert({
      organization_id:  organization.id,
      supplier_id:      form.supplier_id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      notes:            form.notes.trim() || null,
      created_by_id:    user?.id,
      created_by_name:  userName,
    }).select('id').single()

    if (err) { setError(err.message); setSaving(false); return }

    if (form.account_id && inserted) {
      const supplierName = suppliers.find(s => s.id === form.supplier_id)?.name ?? 'Supplier'
      await supabase.from('transactions').insert({
        organization_id:  organization.id,
        account_id:       form.account_id,
        transaction_type: 'out',
        category:         'supplier_payment',
        description:      `Payment to ${supplierName}`,
        amount:           amt,
        transaction_date: form.payment_date,
        reference_type:   'supplier_payment',
        reference_id:     inserted.id,
      })
    }

    onSaved()
  }

  const overpaying = outstanding !== null && parseFloat(form.amount) > outstanding + 0.01

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('suppliers.recordPayment')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('nav.suppliers')} *</label>
            <select
              required value={form.supplier_id} onChange={set('supplier_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Select a supplier…</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.business_name ? ` — ${s.business_name}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Outstanding balance display */}
          {outstanding !== null && (
            <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
              outstanding > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
            }`}>
              <span className="text-sm font-medium text-gray-700">{t('suppliers.outstandingBalance')}</span>
              <span className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(outstanding)}
              </span>
            </div>
          )}

          {/* Amount */}
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

          {/* Payment Method + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('suppliers.paymentMethod')}</label>
              <select
                value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option>{t('suppliers.methods.cash')}</option>
                <option>{t('suppliers.methods.bankTransfer')}</option>
                <option>{t('suppliers.methods.cheque')}</option>
                <option>UPI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input
                required type="date"
                value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('suppliers.referenceNumber')} <span className="text-gray-400 font-normal">({t('common.optional')})</span>
            </label>
            <input
              value={form.reference_number} onChange={set('reference_number')}
              placeholder="e.g. Cheque no. or UTR"
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

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.notes')} <span className="text-gray-400 font-normal">({t('common.optional')})</span>
            </label>
            <textarea
              rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
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
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {saving ? t('common.loading') : t('suppliers.recordPayment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Supplier card ────────────────────────────────────────────────────────────

function SupplierCard({ supplier, onEdit, onPayment, onClick, canEdit, canDelete }) {
  const { t } = useTranslation()
  const { outstanding } = supplier
  const isPaid   = outstanding <= 0
  const isCredit = outstanding < 0

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start justify-between gap-4 hover:shadow-md transition cursor-pointer"
      onClick={onClick}
    >
      {/* Left: info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-base font-semibold text-gray-800 truncate">{supplier.name}</p>
          {supplier.business_name && (
            <span className="text-xs text-gray-400 truncate">— {supplier.business_name}</span>
          )}
        </div>
        {supplier.phone && (
          <p className="text-sm text-gray-500 mt-0.5">📞 {supplier.phone}</p>
        )}
        {supplier.address && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {supplier.address}</p>
        )}
      </div>

      {/* Right: balance + actions */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${
          isCredit ? 'bg-blue-100 text-blue-700' : isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {isCredit ? `Credit ${formatCurrency(Math.abs(outstanding))}` : isPaid ? '✓ Cleared' : formatCurrency(outstanding)}
        </span>
        <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t('common.edit')}
            </button>
          )}
          {!isPaid && canEdit && (
            <button
              onClick={onPayment}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition"
            >
              Pay
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Suppliers() {
  const navigate = useNavigate()
  const { organization, canViewFinancials, canEdit, canDelete } = useAuth()
  const { t } = useTranslation()
  const { currentStep, stepDone } = useOnboarding()
  const [suppliers, setSuppliers]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [addModal, setAddModal]           = useState(false)
  const [editSupplier, setEditSupplier]   = useState(null)
  const [paySupplier, setPaySupplier]     = useState(null) // supplier id to pre-fill
  const [payModalOpen, setPayModalOpen]   = useState(false)
  const [paidThisMonth, setPaidThisMonth] = useState(0)

  async function fetchData() {
    setLoading(true)
    const { start, end } = currentMonthRange()

    const [{ data: sups }, { data: procs }, { data: pays }, { data: monthPays }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('organization_id', organization.id).eq('is_active', true).order('name'),
      supabase.from('procurement').select('supplier_id, cost').eq('organization_id', organization.id).not('supplier_id', 'is', null),
      supabase.from('supplier_payments').select('supplier_id, amount').eq('organization_id', organization.id),
      supabase.from('supplier_payments').select('amount').eq('organization_id', organization.id).gte('payment_date', start).lte('payment_date', end),
    ])

    // Build outstanding per supplier
    const costMap = {}
    for (const r of procs || []) {
      costMap[r.supplier_id] = (costMap[r.supplier_id] || 0) + Number(r.cost)
    }
    const paidMap = {}
    for (const r of pays || []) {
      paidMap[r.supplier_id] = (paidMap[r.supplier_id] || 0) + Number(r.amount)
    }

    const enriched = (sups || []).map(s => ({
      ...s,
      totalPurchased: costMap[s.id] || 0,
      totalPaid:      paidMap[s.id] || 0,
      outstanding:    Number(s.opening_balance || 0) + (costMap[s.id] || 0) - (paidMap[s.id] || 0),
    }))

    setSuppliers(enriched)
    setPaidThisMonth((monthPays || []).reduce((s, r) => s + Number(r.amount), 0))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Guard — after all hooks
  if (!canViewFinancials) return <Navigate to="/dashboard" replace />

  const totalOutstanding = suppliers.reduce((s, sup) => s + sup.outstanding, 0)

  function openPayment(supplierId) {
    setPaySupplier(supplierId)
    setPayModalOpen(true)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('suppliers.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your suppliers and outstanding payments</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPaySupplier(null); setPayModalOpen(true) }}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 px-4 py-2 text-sm font-semibold transition"
            >
              💳 {t('suppliers.recordPayment')}
            </button>
            <button
              data-tour="suppliers"
              onClick={() => setAddModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
            >
              <span className="text-base leading-none">+</span> {t('suppliers.addSupplier')}
            </button>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Suppliers</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{suppliers.length}</p>
          </div>
          <div className={`bg-white rounded-2xl border shadow-sm px-5 py-4 ${totalOutstanding > 0 ? 'border-red-200' : 'border-gray-100'}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Outstanding</p>
            <p className={`text-2xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(totalOutstanding)}
            </p>
            {totalOutstanding === 0 && <p className="text-xs text-gray-400 mt-0.5">All cleared</p>}
          </div>
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid This Month</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(paidThisMonth)}</p>
          </div>
        </div>
      )}

      {/* Supplier list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <span className="text-5xl mb-3">🤝</span>
          <p className="text-sm font-medium">{t('suppliers.noSuppliers')}</p>
          <p className="text-xs mt-1">Click "+ {t('suppliers.addSupplier')}" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => (
            <SupplierCard
              key={s.id}
              supplier={s}
              onClick={() => navigate(`/suppliers/${s.id}`)}
              onEdit={e => { e.stopPropagation?.(); setEditSupplier(s) }}
              onPayment={e => { e.stopPropagation?.(); openPayment(s.id) }}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {addModal && (
        <SupplierModal
          onClose={() => setAddModal(false)}
          onSaved={() => { setAddModal(false); fetchData(); if (currentStep?.id === 'suppliers') stepDone('suppliers') }}
        />
      )}
      {editSupplier && (
        <SupplierModal
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSaved={() => { setEditSupplier(null); fetchData() }}
        />
      )}
      {payModalOpen && (
        <RecordPaymentModal
          suppliers={suppliers}
          initialSupplierId={paySupplier}
          onClose={() => { setPayModalOpen(false); setPaySupplier(null) }}
          onSaved={() => { setPayModalOpen(false); setPaySupplier(null); fetchData() }}
        />
      )}
    </div>
  )
}
