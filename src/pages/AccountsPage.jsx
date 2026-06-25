import { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import AuditInfo from '../components/AuditInfo'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthRange(offset = 0) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offset
  const start = new Date(y, m, 1).toISOString().slice(0, 10)
  const end   = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function quarterRange() {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const start = new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10)
  return { start, end }
}

function yearRange() {
  const y = new Date().getFullYear()
  return { start: `${y}-01-01`, end: `${y}-12-31` }
}

const ACCOUNT_ICON = { cash: '💵', bank: '🏦', wallet: '📱' }

function getCategoryLabels(t) {
  return {
    vendor_payment:      t('accounts.categories.vendorPayment'),
    supplier_payment:    t('accounts.categories.supplierPayment'),
    expense:             t('accounts.categories.expense'),
    procurement:         t('accounts.categories.procurement'),
    growing_fee_payment: t('accounts.categories.growingFeePayment'),
    growing_fee_advance: t('accounts.categories.growingFeeAdvance'),
    other:               t('accounts.categories.other'),
  }
}

const CATEGORY_STYLES = {
  vendor_payment:      'bg-green-100  text-green-700',
  supplier_payment:    'bg-red-100    text-red-700',
  expense:             'bg-orange-100 text-orange-700',
  procurement:         'bg-blue-100   text-blue-700',
  growing_fee_payment: 'bg-purple-100 text-purple-700',
  growing_fee_advance: 'bg-amber-100  text-amber-700',
  other:               'bg-gray-100   text-gray-600',
}

// ─── Add Account Modal ────────────────────────────────────────────────────────

function AddAccountModal({ onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', type: 'cash', opening_balance: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const { error: err } = await supabase.from('accounts').insert({
      organization_id: organization.id,
      name:            form.name.trim(),
      type:            form.type,
      opening_balance: Number(form.opening_balance) || 0,
      created_by_id:   user?.id,
      created_by_name: userName,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('accounts.addAccount')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountName')} *</label>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Petty Cash"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountType')} *</label>
              <select value={form.type} onChange={set('type')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="cash">💵 {t('accounts.types.cash')}</option>
                <option value="bank">🏦 {t('accounts.types.bank')}</option>
                <option value="wallet">📱 {t('accounts.types.wallet')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.openingBalance')} (₹)</label>
              <input type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('accounts.addAccount')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Account Modal ───────────────────────────────────────────────────────

function EditAccountModal({ account, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({
    name:            account.name,
    type:            account.type,
    opening_balance: String(account.opening_balance ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const { error: err } = await supabase.from('accounts').update({
      name:            form.name.trim(),
      type:            form.type,
      opening_balance: Number(form.opening_balance) || 0,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('organization_id', organization.id).eq('id', account.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('accounts.editAccount')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountName')} *</label>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Petty Cash"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountType')} *</label>
              <select value={form.type} onChange={set('type')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="cash">💵 {t('accounts.types.cash')}</option>
                <option value="bank">🏦 {t('accounts.types.bank')}</option>
                <option value="wallet">📱 {t('accounts.types.wallet')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.openingBalance')} (₹)</label>
              <input type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('accounts.openingBalanceHint')}
          </p>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Manual Entry Modal ───────────────────────────────────────────────────────

function ManualEntryModal({ accounts, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({
    account_id:       accounts[0]?.id ?? '',
    transaction_type: 'in',
    category:         'other',
    description:      '',
    amount:           '',
    transaction_date: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.account_id) { setError('Select an account'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const { error: err } = await supabase.from('transactions').insert({
      organization_id:  organization.id,
      account_id:       form.account_id,
      transaction_type: form.transaction_type,
      category:         form.category,
      description:      form.description.trim(),
      amount:           amt,
      transaction_date: form.transaction_date,
      created_by_id:    user?.id,
      created_by_name:  userName,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('accounts.manualEntry')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.selectAccount')} *</label>
            <select value={form.account_id} onChange={set('account_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountType')} *</label>
              <div className="flex gap-2">
                {['in', 'out'].map(txType => (
                  <button key={txType} type="button" onClick={() => setForm(p => ({ ...p, transaction_type: txType }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      form.transaction_type === txType
                        ? txType === 'in' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {txType === 'in' ? `▲ ${t('accounts.moneyIn')}` : `▼ ${t('accounts.moneyOut')}`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('expenses.category')}</label>
              <select value={form.category} onChange={set('category')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                {Object.entries(getCategoryLabels(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')} *</label>
            <input required value={form.description} onChange={set('description')} placeholder="e.g. Petty cash withdrawal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountLabel')} *</label>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={form.transaction_date} onChange={set('transaction_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({ account, txns, selected, onClick, onEdit }) {
  const { t } = useTranslation()
  const { start: ms, end: me } = monthRange()

  const totalIn  = txns.filter(txn => txn.transaction_type === 'in').reduce((s, txn) => s + Number(txn.amount), 0)
  const totalOut = txns.filter(txn => txn.transaction_type === 'out').reduce((s, txn) => s + Number(txn.amount), 0)
  const balance  = Number(account.opening_balance) + totalIn - totalOut

  const monthIn  = txns.filter(txn => txn.transaction_type === 'in'  && txn.transaction_date >= ms && txn.transaction_date <= me)
                       .reduce((s, txn) => s + Number(txn.amount), 0)
  const monthOut = txns.filter(txn => txn.transaction_type === 'out' && txn.transaction_date >= ms && txn.transaction_date <= me)
                       .reduce((s, txn) => s + Number(txn.amount), 0)

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border shadow-sm px-5 py-4 cursor-pointer transition-all min-w-[220px] flex-shrink-0 ${
        selected ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-100 hover:shadow-md'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{ACCOUNT_ICON[account.type]}</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">{account.name}</p>
          <p className="text-xs text-gray-400 capitalize">{t(`accounts.types.${account.type}`)}</p>
        </div>
      </div>
      <p className={`text-2xl font-bold leading-none ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(balance)}</p>
      <p className="text-xs text-gray-400 mt-1">{t('accounts.openingBalance')}: {formatCurrency(account.opening_balance)}</p>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-3">
          <span className="text-xs text-green-600 font-medium">▲ {formatCurrency(monthIn)}</span>
          <span className="text-xs text-red-500 font-medium">▼ {formatCurrency(monthOut)}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="text-xs text-gray-400 hover:text-amber-600 transition"
        >✏️ {t('common.edit')}</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const { organization, canViewFinancials, canEdit } = useAuth()
  const { t } = useTranslation()

  const DATE_PRESETS = [
    { key: 'thisMonth',    label: t('common.thisMonth'),     fn: () => monthRange(0) },
    { key: 'lastMonth',    label: t('common.lastMonth'),     fn: () => monthRange(-1) },
    { key: 'thisQuarter',  label: t('accounts.thisQuarter'), fn: quarterRange },
    { key: 'thisYear',     label: t('common.thisYear'),      fn: yearRange },
  ]
  const [accounts,     setAccounts]     = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [addAccModal,    setAddAccModal]    = useState(false)
  const [manualModal,    setManualModal]    = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)

  // Filters
  const [activePreset,   setActivePreset]   = useState('thisMonth')
  const [dateRange,      setDateRange]      = useState(monthRange(0))
  const [accountFilter,  setAccountFilter]  = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search,         setSearch]         = useState('')

  async function fetchData() {
    setLoading(true)
    const [{ data: accs }, { data: txns }] = await Promise.all([
      supabase.from('accounts').select('*').eq('organization_id', organization.id).eq('is_active', true).order('created_at'),
      supabase.from('transactions').select('*, created_by_name, created_at, updated_by_name, updated_at').eq('organization_id', organization.id).order('transaction_date', { ascending: false }),
    ])
    setAccounts(accs || [])
    setTransactions(txns || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Guard — after all hooks
  if (!canViewFinancials) return <Navigate to="/dashboard" replace />

  function applyPreset(preset) {
    setActivePreset(preset.key)
    setDateRange(preset.fn())
  }

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(txn => {
      if (txn.transaction_date < dateRange.start || txn.transaction_date > dateRange.end) return false
      if (accountFilter !== 'all' && txn.account_id !== accountFilter) return false
      if (categoryFilter !== 'all' && txn.category !== categoryFilter) return false
      if (search && !txn.description?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, dateRange, accountFilter, categoryFilter, search])

  const totalIn  = filtered.filter(txn => txn.transaction_type === 'in').reduce((s, txn) => s + Number(txn.amount), 0)
  const totalOut = filtered.filter(txn => txn.transaction_type === 'out').reduce((s, txn) => s + Number(txn.amount), 0)
  const net      = totalIn - totalOut

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('accounts.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('accounts.subtitle')}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setManualModal(true)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('accounts.manualEntry')}
            </button>
            <button onClick={() => setAddAccModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition">
              <span>+</span> {t('accounts.addAccount')}
            </button>
          </div>
        )}
      </div>

      {/* Account cards */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">💵</p>
          <p className="text-sm">{t('accounts.noAccounts')}</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          <div
            onClick={() => setAccountFilter('all')}
            className={`bg-white rounded-2xl border shadow-sm px-5 py-4 cursor-pointer transition-all min-w-[180px] flex-shrink-0 ${
              accountFilter === 'all' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-100 hover:shadow-md'
            }`}
          >
            <p className="text-sm font-semibold text-gray-700 mb-1">{t('accounts.allAccounts')}</p>
            <p className="text-xl font-bold text-gray-800">
              {formatCurrency(accounts.reduce((sum, a) => {
                const txns = transactions.filter(tr => tr.account_id === a.id)
                const i = txns.filter(tr => tr.transaction_type === 'in').reduce((s, tr) => s + Number(tr.amount), 0)
                const o = txns.filter(tr => tr.transaction_type === 'out').reduce((s, tr) => s + Number(tr.amount), 0)
                return sum + Number(a.opening_balance) + i - o
              }, 0))}
            </p>
            <p className="text-xs text-gray-400 mt-1">{t('accounts.totalBalance')}</p>
          </div>
          {accounts.map(a => (
            <AccountCard
              key={a.id}
              account={a}
              txns={transactions.filter(t => t.account_id === a.id)}
              selected={accountFilter === a.id}
              onClick={() => setAccountFilter(accountFilter === a.id ? 'all' : a.id)}
              onEdit={() => setEditingAccount(a)}
            />
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        {/* Date presets */}
        <div className="flex items-center gap-2 flex-wrap">
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${
                activePreset === p.key ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 text-xs">|</span>
          <input type="date" value={dateRange.start}
            onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <span className="text-gray-400 text-xs">{t('common.to')}</span>
          <input type="date" value={dateRange.end}
            onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
        </div>

        {/* Category + Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs bg-white">
            <option value="all">{t('accounts.allCategories')}</option>
            {Object.entries(getCategoryLabels(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('accounts.searchPlaceholder')}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs flex-1 min-w-[160px]" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl border border-green-100 px-4 py-3">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide">{t('accounts.moneyIn')}</p>
          <p className="text-xl font-bold text-green-700 mt-0.5">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 px-4 py-3">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">{t('accounts.moneyOut')}</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">{formatCurrency(totalOut)}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${net >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{t('accounts.netFlow')}</p>
          <p className={`text-xl font-bold mt-0.5 ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(Math.abs(net))}</p>
        </div>
      </div>

      {/* Transaction table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="text-4xl mb-3">📒</span>
            <p className="text-sm font-medium">{t('accounts.noTransactions')}</p>
            <p className="text-xs mt-1">{t('accounts.adjustFilters')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">{t('common.date')}</th>
                  <th className="px-5 py-3">{t('common.description')}</th>
                  <th className="px-5 py-3">{t('expenses.category')}</th>
                  {accountFilter === 'all' && <th className="px-5 py-3">{t('accounts.account')}</th>}
                  <th className="px-5 py-3 text-right">{t('expenses.amount')}</th>
                  <th className="px-5 py-3">🕐</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.slice(0, 100).map(txn => (
                  <tr key={txn.id} className="hover:bg-gray-50/60 transition">
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmtDate(txn.transaction_date)}</td>
                    <td className="px-5 py-3.5 text-gray-800 max-w-[280px] truncate" title={txn.description}>{txn.description || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_STYLES[txn.category] ?? CATEGORY_STYLES.other}`}>
                        {getCategoryLabels(t)[txn.category] ?? txn.category}
                      </span>
                    </td>
                    {accountFilter === 'all' && (
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {ACCOUNT_ICON[accountMap[txn.account_id]?.type]} {accountMap[txn.account_id]?.name ?? '—'}
                      </td>
                    )}
                    <td className={`px-5 py-3.5 text-right font-semibold ${txn.transaction_type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                      {txn.transaction_type === 'in' ? '▲ ' : '▼ '}{formatCurrency(txn.amount)}
                    </td>
                    <td className="px-5 py-3.5">
                      <AuditInfo createdByName={txn.created_by_name} createdAt={txn.created_at} updatedByName={txn.updated_by_name} updatedAt={txn.updated_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50">
                {t('accounts.showingTransactions', { shown: 100, total: filtered.length })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {addAccModal && (
        <AddAccountModal onClose={() => setAddAccModal(false)} onSaved={() => { setAddAccModal(false); fetchData() }} />
      )}
      {manualModal && accounts.length > 0 && (
        <ManualEntryModal accounts={accounts} onClose={() => setManualModal(false)} onSaved={() => { setManualModal(false); fetchData() }} />
      )}
      {editingAccount && (
        <EditAccountModal account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={() => { setEditingAccount(null); fetchData() }} />
      )}
    </div>
  )
}
