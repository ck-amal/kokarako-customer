import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'

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

const CATEGORY_LABELS = {
  vendor_payment:      'Vendor Payment',
  supplier_payment:    'Supplier Payment',
  expense:             'Expense',
  procurement:         'Procurement',
  growing_fee_payment: 'Growing Fee Payment',
  growing_fee_advance: 'Growing Fee Advance',
  other:               'Other',
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
  const [form, setForm] = useState({ name: '', type: 'cash', opening_balance: '0' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    const { error: err } = await supabase.from('accounts').insert({
      name:            form.name.trim(),
      type:            form.type,
      opening_balance: Number(form.opening_balance) || 0,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Add Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Petty Cash"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={set('type')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="cash">💵 Cash</option>
                <option value="bank">🏦 Bank</option>
                <option value="wallet">📱 Wallet</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (₹)</label>
              <input type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Account Modal ───────────────────────────────────────────────────────

function EditAccountModal({ account, onClose, onSaved }) {
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
    const { error: err } = await supabase.from('accounts').update({
      name:            form.name.trim(),
      type:            form.type,
      opening_balance: Number(form.opening_balance) || 0,
    }).eq('id', account.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Edit Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
            <input required value={form.name} onChange={set('name')} placeholder="e.g. Petty Cash"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select value={form.type} onChange={set('type')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="cash">💵 Cash</option>
                <option value="bank">🏦 Bank</option>
                <option value="wallet">📱 Wallet</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (₹)</label>
              <input type="number" step="0.01" value={form.opening_balance} onChange={set('opening_balance')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Opening balance = total money in this account before you started using this app
          </p>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Manual Entry Modal ───────────────────────────────────────────────────────

function ManualEntryModal({ accounts, onClose, onSaved }) {
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
    const { error: err } = await supabase.from('transactions').insert({
      account_id:       form.account_id,
      transaction_type: form.transaction_type,
      category:         form.category,
      description:      form.description.trim(),
      amount:           amt,
      transaction_date: form.transaction_date,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Manual Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account *</label>
            <select value={form.account_id} onChange={set('account_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <div className="flex gap-2">
                {['in', 'out'].map(t => (
                  <button key={t} type="button" onClick={() => setForm(p => ({ ...p, transaction_type: t }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      form.transaction_type === t
                        ? t === 'in' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {t === 'in' ? '▲ In' : '▼ Out'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={form.category} onChange={set('category')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <input required value={form.description} onChange={set('description')} placeholder="e.g. Petty cash withdrawal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input required type="date" value={form.transaction_date} onChange={set('transaction_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Account Card ─────────────────────────────────────────────────────────────

function AccountCard({ account, txns, selected, onClick, onEdit }) {
  const { start: ms, end: me } = monthRange()

  const totalIn  = txns.filter(t => t.transaction_type === 'in').reduce((s, t) => s + Number(t.amount), 0)
  const totalOut = txns.filter(t => t.transaction_type === 'out').reduce((s, t) => s + Number(t.amount), 0)
  const balance  = Number(account.opening_balance) + totalIn - totalOut

  const monthIn  = txns.filter(t => t.transaction_type === 'in'  && t.transaction_date >= ms && t.transaction_date <= me)
                       .reduce((s, t) => s + Number(t.amount), 0)
  const monthOut = txns.filter(t => t.transaction_type === 'out' && t.transaction_date >= ms && t.transaction_date <= me)
                       .reduce((s, t) => s + Number(t.amount), 0)

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
          <p className="text-xs text-gray-400 capitalize">{account.type}</p>
        </div>
      </div>
      <p className={`text-2xl font-bold leading-none ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(balance)}</p>
      <p className="text-xs text-gray-400 mt-1">Opening: {formatCurrency(account.opening_balance)}</p>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-3">
          <span className="text-xs text-green-600 font-medium">▲ {formatCurrency(monthIn)}</span>
          <span className="text-xs text-red-500 font-medium">▼ {formatCurrency(monthOut)}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="text-xs text-gray-400 hover:text-amber-600 transition"
        >✏️ Edit</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: 'This Month',  fn: () => monthRange(0) },
  { label: 'Last Month',  fn: () => monthRange(-1) },
  { label: 'This Quarter', fn: quarterRange },
  { label: 'This Year',   fn: yearRange },
]

export default function AccountsPage() {
  const [accounts,     setAccounts]     = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [addAccModal,    setAddAccModal]    = useState(false)
  const [manualModal,    setManualModal]    = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)

  // Filters
  const [activePreset,   setActivePreset]   = useState('This Month')
  const [dateRange,      setDateRange]      = useState(monthRange(0))
  const [accountFilter,  setAccountFilter]  = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search,         setSearch]         = useState('')

  async function fetchData() {
    setLoading(true)
    const [{ data: accs }, { data: txns }] = await Promise.all([
      supabase.from('accounts').select('*').eq('is_active', true).order('created_at'),
      supabase.from('transactions').select('*').order('transaction_date', { ascending: false }),
    ])
    setAccounts(accs || [])
    setTransactions(txns || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function applyPreset(preset) {
    setActivePreset(preset.label)
    setDateRange(preset.fn())
  }

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (t.transaction_date < dateRange.start || t.transaction_date > dateRange.end) return false
      if (accountFilter !== 'all' && t.account_id !== accountFilter) return false
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, dateRange, accountFilter, categoryFilter, search])

  const totalIn  = filtered.filter(t => t.transaction_type === 'in').reduce((s, t) => s + Number(t.amount), 0)
  const totalOut = filtered.filter(t => t.transaction_type === 'out').reduce((s, t) => s + Number(t.amount), 0)
  const net      = totalIn - totalOut

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cash & Bank</h1>
          <p className="text-sm text-gray-500 mt-0.5">Account balances and transaction ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setManualModal(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Manual Entry
          </button>
          <button onClick={() => setAddAccModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition">
            <span>+</span> Add Account
          </button>
        </div>
      </div>

      {/* Account cards */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-7 w-7 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">💵</p>
          <p className="text-sm">No accounts yet. Add one to start tracking cash flow.</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          <div
            onClick={() => setAccountFilter('all')}
            className={`bg-white rounded-2xl border shadow-sm px-5 py-4 cursor-pointer transition-all min-w-[180px] flex-shrink-0 ${
              accountFilter === 'all' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-100 hover:shadow-md'
            }`}
          >
            <p className="text-sm font-semibold text-gray-700 mb-1">All Accounts</p>
            <p className="text-xl font-bold text-gray-800">
              {formatCurrency(accounts.reduce((sum, a) => {
                const txns = transactions.filter(t => t.account_id === a.id)
                const i = txns.filter(t => t.transaction_type === 'in').reduce((s, t) => s + Number(t.amount), 0)
                const o = txns.filter(t => t.transaction_type === 'out').reduce((s, t) => s + Number(t.amount), 0)
                return sum + Number(a.opening_balance) + i - o
              }, 0))}
            </p>
            <p className="text-xs text-gray-400 mt-1">total balance</p>
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
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition border ${
                activePreset === p.label ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {p.label}
            </button>
          ))}
          <span className="text-gray-300 text-xs">|</span>
          <input type="date" value={dateRange.start}
            onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={dateRange.end}
            onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setActivePreset('') }}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
        </div>

        {/* Category + Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs bg-white">
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description…"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs flex-1 min-w-[160px]" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl border border-green-100 px-4 py-3">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide">Total In</p>
          <p className="text-xl font-bold text-green-700 mt-0.5">{formatCurrency(totalIn)}</p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 px-4 py-3">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Total Out</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">{formatCurrency(totalOut)}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${net >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>Net</p>
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
            <p className="text-sm font-medium">No transactions found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Category</th>
                  {accountFilter === 'all' && <th className="px-5 py-3">Account</th>}
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.slice(0, 100).map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/60 transition">
                    <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmtDate(t.transaction_date)}</td>
                    <td className="px-5 py-3.5 text-gray-800 max-w-[280px] truncate" title={t.description}>{t.description || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_STYLES[t.category] ?? CATEGORY_STYLES.other}`}>
                        {CATEGORY_LABELS[t.category] ?? t.category}
                      </span>
                    </td>
                    {accountFilter === 'all' && (
                      <td className="px-5 py-3.5 text-gray-500 text-xs">
                        {ACCOUNT_ICON[accountMap[t.account_id]?.type]} {accountMap[t.account_id]?.name ?? '—'}
                      </td>
                    )}
                    <td className={`px-5 py-3.5 text-right font-semibold ${t.transaction_type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                      {t.transaction_type === 'in' ? '▲ ' : '▼ '}{formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50">
                Showing 100 of {filtered.length} transactions
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
