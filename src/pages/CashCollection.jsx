import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import AuditInfo from '../components/AuditInfo'

// ─── Record payment modal ─────────────────────────────────────────────────────

function PaymentModal({ vendor, sales, onClose, onSaved }) {
  const { t, i18n } = useTranslation()
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [form, setForm] = useState({
    sale_id:     '',
    amount_paid: '',
    date:        new Date().toISOString().slice(0, 10),
    notes:       '',
    account_id:  '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('organization_id', organization.id).eq('is_active', true).order('name')
      .then(({ data }) => {
        const list = data || []
        setAccounts(list)
        const cash = list.find(a => a.type === 'cash')
        if (cash) setForm(f => ({ ...f, account_id: cash.id }))
      })
  }, [])

  function set(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  // balance remaining on selected sale
  const selectedSale = sales.find(s => s.id === form.sale_id)
  const balanceOnSale = selectedSale
    ? Number(selectedSale.total_amount) - Number(selectedSale.collected || 0)
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.sale_id) { setError(t('cashCollection.sale')); return }
    setError('')
    setSaving(true)

    const remaining = Math.max(
      0,
      (balanceOnSale ?? Number(form.amount_paid)) - Number(form.amount_paid)
    )

    const { data: inserted, error } = await supabase.from('cash_collection').insert({
      organization_id: organization.id,
      vendor_id:       vendor.vendor_id,
      sale_id:         form.sale_id,
      amount_paid:     Number(form.amount_paid),
      date:            form.date,
      balance_due:     remaining,
      notes:           form.notes.trim() || null,
      created_by_id:   user?.id,
      created_by_name: userName,
    }).select('id').single()

    if (error) { setError(error.message); setSaving(false); return }

    if (form.account_id && inserted) {
      await supabase.from('transactions').insert({
        organization_id:  organization.id,
        account_id:       form.account_id,
        transaction_type: 'in',
        category:         'vendor_payment',
        description:      `Payment from ${vendor.vendor_name}`,
        amount:           Number(form.amount_paid),
        transaction_date: form.date,
        reference_type:   'cash_collection',
        reference_id:     inserted.id,
        created_by_id:    user?.id,
        created_by_name:  userName,
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">{t('cashCollection.recordPayment')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <p className="text-sm text-gray-500 mb-5">
          {t('vendors.title')}: <span className="font-semibold text-gray-700">{vendor.vendor_name}</span>
          &ensp;·&ensp;{t('cashCollection.totalOutstanding')}:{' '}
          <span className="font-semibold text-red-600">{formatCurrency(vendor.outstanding_balance)}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Sale selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.sale')} *</label>
            <select
              required value={form.sale_id} onChange={set('sale_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">— select a sale —</option>
              {sales.map(s => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.date, i18n.language)} — {formatCurrency(s.total_amount)}
                  {Number(s.collected || 0) > 0 ? ` (paid: ${formatCurrency(s.collected)})` : ''}
                </option>
              ))}
            </select>
            {balanceOnSale !== null && (
              <p className="text-xs mt-1 text-gray-500">
                {t('cashCollection.balanceDue')}: <span className="font-semibold text-red-600">{formatCurrency(balanceOnSale)}</span>
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.amountPaid')} (₹) *</label>
            <input
              required type="number" min="0.01" step="0.01"
              value={form.amount_paid} onChange={set('amount_paid')}
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Remaining preview */}
          {form.amount_paid && balanceOnSale !== null && (
            <div className={`rounded-lg px-4 py-2.5 text-sm border ${
              balanceOnSale - Number(form.amount_paid) <= 0
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              {balanceOnSale - Number(form.amount_paid) <= 0
                ? '✓ This fully clears the sale balance'
                : `Remaining after payment: ${formatCurrency(Math.max(0, balanceOnSale - Number(form.amount_paid)))}`}
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.paymentDate')} *</label>
            <input
              required type="date" value={form.date} onChange={set('date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit to Account</label>
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
            <input
              type="text" value={form.notes} onChange={set('notes')}
              placeholder="e.g. Cash via hand"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? `${t('common.save')}…` : t('cashCollection.recordPayment')}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Payment history drawer ───────────────────────────────────────────────────

function HistoryModal({ vendor, onClose }) {
  const { t, i18n } = useTranslation()
  const { organization } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase
      .from('cash_collection')
      .select('*, sales(date, total_amount), created_by_name, created_at')
      .eq('organization_id', organization.id)
      .eq('vendor_id', vendor.vendor_id)
      .order('date', { ascending: false })
      .then(({ data }) => { setPayments(data || []); setLoading(false) })
  }, [vendor.vendor_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Payment History — {vendor.vendor_name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('cashCollection.noOutstanding')}</p>
        ) : (
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">{t('common.date')}</th>
                  <th className="px-4 py-2 text-right">{t('cashCollection.amountPaid')}</th>
                  <th className="px-4 py-2 text-right">{t('cashCollection.balanceDue')}</th>
                  <th className="px-4 py-2 text-left">{t('common.notes')}</th>
                  <th className="px-2 py-2 text-center">
                    <svg className="h-3.5 w-3.5 inline text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(p.date, i18n.language)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(p.amount_paid)}</td>
                    <td className="px-4 py-3 text-right">
                      {Number(p.balance_due) > 0
                        ? <span className="text-red-500 font-semibold">{formatCurrency(p.balance_due)}</span>
                        : <span className="text-green-600 font-semibold">{t('vendors.collected')}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{p.notes || '—'}</td>
                    <td className="px-2 py-3 text-center">
                      <AuditInfo createdByName={p.created_by_name} createdAt={p.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{t('common.total')}</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-800">
                    {formatCurrency(payments.reduce((s, p) => s + Number(p.amount_paid), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-4">
          <button onClick={onClose}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CashCollection() {
  const { t } = useTranslation()
  const { organization, canViewFinancials, canEdit } = useAuth()
  const [balances, setBalances]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [payVendor, setPayVendor]     = useState(null)  // vendor row for payment modal
  const [histVendor, setHistVendor]   = useState(null)  // vendor row for history modal
  const [vendorSales, setVendorSales] = useState([])    // sales for selected vendor

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase
      .from('vendor_balances')
      .select('*')
      .eq('organization_id', organization.id)
      .order('vendor_name')
    setBalances(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Guard — after all hooks
  if (!canViewFinancials) return <Navigate to="/dashboard" replace />

  async function openPayment(vendor) {
    // Fetch this vendor's sales with collected amounts
    const { data: salesData } = await supabase
      .from('sales')
      .select('id, date, total_amount')
      .eq('organization_id', organization.id)
      .eq('vendor_id', vendor.vendor_id)
      .order('date', { ascending: false })

    // For each sale, sum what's already been collected
    const { data: collData } = await supabase
      .from('cash_collection')
      .select('sale_id, amount_paid')
      .eq('organization_id', organization.id)
      .eq('vendor_id', vendor.vendor_id)

    const collectedBySale = {}
    for (const c of (collData || [])) {
      collectedBySale[c.sale_id] = (collectedBySale[c.sale_id] || 0) + Number(c.amount_paid)
    }

    const salesWithBalance = (salesData || []).map(s => ({
      ...s,
      collected: collectedBySale[s.id] || 0,
    }))

    setVendorSales(salesWithBalance)
    setPayVendor(vendor)
  }

  const totalOutstanding = balances.reduce((s, b) => s + Math.max(0, Number(b.outstanding_balance)), 0)
  const totalCollected   = balances.reduce((s, b) => s + Number(b.total_collected), 0)
  const totalSales       = balances.reduce((s, b) => s + Number(b.total_sales), 0)

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('cashCollection.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track payments and outstanding balances by vendor</p>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('vendors.totalSales')}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(totalSales)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('vendors.collected')}</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalCollected)}</p>
          </div>
          <div className={`rounded-2xl border shadow-sm px-5 py-4 ${
            totalOutstanding > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-gray-100'
          }`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('cashCollection.totalOutstanding')}</p>
            <p className={`text-2xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {formatCurrency(totalOutstanding)}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : balances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">💳</span>
            <p className="text-sm font-medium">{t('cashCollection.noOutstanding')}</p>
            <p className="text-xs mt-1">Add vendors and record sales to see balances here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">{t('vendors.title')}</th>
                <th className="px-5 py-3 text-right">{t('vendors.totalSales')}</th>
                <th className="px-5 py-3 text-right">{t('vendors.collected')}</th>
                <th className="px-5 py-3 text-right">{t('vendors.outstanding')}</th>
                <th className="px-5 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {balances.map(v => {
                const outstanding = Number(v.outstanding_balance)
                const isOverdue   = outstanding > 0
                return (
                  <tr key={v.vendor_id} className={`transition ${isOverdue ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-amber-50/40'}`}>
                    <td className="px-5 py-4 font-medium text-gray-800">{v.vendor_name}</td>
                    <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(v.total_sales)}</td>
                    <td className="px-5 py-4 text-right text-green-700 font-semibold">
                      {formatCurrency(v.total_collected)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {isOverdue ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                          {formatCurrency(outstanding)}
                        </span>
                      ) : (
                        <span className="text-green-600 font-semibold">{t('vendors.collected')}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-2">
                        {canEdit && (
                          <button
                            onClick={() => openPayment(v)}
                            disabled={!isOverdue}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {t('cashCollection.recordPayment')}
                          </button>
                        )}
                        <button
                          onClick={() => setHistVendor(v)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Footer totals */}
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <td className="px-5 py-3">{t('common.total')}</td>
                <td className="px-5 py-3 text-right text-gray-800">{formatCurrency(totalSales)}</td>
                <td className="px-5 py-3 text-right text-green-700">{formatCurrency(totalCollected)}</td>
                <td className="px-5 py-3 text-right text-red-600">{formatCurrency(totalOutstanding)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {payVendor && (
        <PaymentModal
          vendor={payVendor}
          sales={vendorSales}
          onClose={() => { setPayVendor(null); setVendorSales([]) }}
          onSaved={() => { setPayVendor(null); setVendorSales([]); fetchData() }}
        />
      )}
      {histVendor && (
        <HistoryModal
          vendor={histVendor}
          onClose={() => setHistVendor(null)}
        />
      )}
    </div>
  )
}
