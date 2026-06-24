import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'

const CATEGORIES = ['labour', 'transport', 'utilities', 'veterinary', 'maintenance', 'misc']

const CATEGORY_STYLES = {
  labour:      'bg-blue-100   text-blue-700',
  transport:   'bg-purple-100 text-purple-700',
  utilities:   'bg-yellow-100 text-yellow-700',
  veterinary:  'bg-teal-100   text-teal-700',
  maintenance: 'bg-orange-100 text-orange-700',
  misc:        'bg-gray-100   text-gray-600',
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthRange() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

// ─── Category badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.misc
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {category}
    </span>
  )
}

// ─── New expense modal ────────────────────────────────────────────────────────

function ExpenseModal({ batches, onClose, onSaved }) {
  const [form, setForm] = useState({
    batch_id:             '',
    category:             'labour',
    amount:               '',
    description:          '',
    date:                 new Date().toISOString().slice(0, 10),
    expense_category_type: 'operating',
    account_id:           '',
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

  function set(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const { data: inserted, error } = await supabase.from('expenses').insert({
      batch_id:             form.batch_id || null,
      category:             form.category,
      amount:               Number(form.amount),
      description:          form.description.trim() || null,
      date:                 form.date,
      expense_category_type: form.expense_category_type,
    }).select('id').single()

    if (error) { setError(error.message); setSaving(false); return }

    if (form.account_id && inserted) {
      await supabase.from('transactions').insert({
        account_id:       form.account_id,
        transaction_type: 'out',
        category:         'expense',
        description:      form.description.trim() || `Expense — ${form.category}`,
        amount:           Number(form.amount),
        transaction_date: form.date,
        reference_type:   'expense',
        reference_id:     inserted.id,
      })
    }

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Add Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select required value={form.category} onChange={set('category')} className={inputCls + ' bg-white'}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
              <input
                required type="number" min="0.01" step="0.01"
                value={form.amount} onChange={set('amount')}
                placeholder="e.g. 1500"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text" value={form.description} onChange={set('description')}
              placeholder="e.g. Daily labour for cleaning"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                required type="date" value={form.date} onChange={set('date')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link to Batch <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select value={form.batch_id} onChange={set('batch_id')} className={inputCls + ' bg-white'}>
                <option value="">— none —</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.farms?.name} ({formatDate(b.start_date)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cost type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expense Type</label>
            <div className="flex gap-2">
              {[
                { value: 'operating', label: 'Operating', sub: 'Labour, transport, utilities…' },
                { value: 'cogs',      label: 'Direct Cost', sub: 'Goes into COGS / P&L' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, expense_category_type: opt.value }))}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition ${
                    form.expense_category_type === opt.value
                      ? 'bg-amber-50 border-amber-400 text-amber-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-gray-400 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pay from Account</label>
              <select
                value={form.account_id} onChange={set('account_id')}
                className={inputCls + ' bg-white'}
              >
                <option value="">— don't record in ledger —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

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
              {saving ? 'Saving…' : 'Add Expense'}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Expenses() {
  const [expenses, setExpenses]   = useState([])
  const [batches, setBatches]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [catFilter, setCatFilter] = useState('all')

  async function fetchData() {
    setLoading(true)
    const [{ data: expData }, { data: batchData }] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, batches(start_date, farms(name))')
        .order('date', { ascending: false }),
      supabase
        .from('batches')
        .select('id, start_date, farms(name)')
        .order('start_date', { ascending: false }),
    ])
    setExpenses(expData || [])
    setBatches(batchData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const { start, end } = currentMonthRange()
  const monthName = new Date().toLocaleString('en-IN', { month: 'long' })

  const thisMonth     = expenses.filter(e => e.date >= start && e.date <= end)
  const monthTotal    = thisMonth.reduce((s, e) => s + Number(e.amount), 0)
  const allTotal      = expenses.reduce((s, e) => s + Number(e.amount), 0)

  // Category breakdown for this month
  const breakdown = {}
  for (const e of thisMonth) {
    breakdown[e.category] = (breakdown[e.category] || 0) + Number(e.amount)
  }

  const visible = catFilter === 'all'
    ? expenses
    : expenses.filter(e => e.category === catFilter)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Labour, transport, utilities and more</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          <span className="text-base leading-none">+</span> Add Expense
        </button>
      </div>

      {/* Monthly summary */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spent in {monthName}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(monthTotal)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{thisMonth.length} entries</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">All-time Total</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatCurrency(allTotal)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{expenses.length} entries</p>
          </div>

          {/* Top category this month */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Top category ({monthName})</p>
            {Object.keys(breakdown).length === 0 ? (
              <p className="text-sm text-gray-400 mt-2">No data this month</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {Object.entries(breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between">
                      <CategoryBadge category={cat} />
                      <span className="text-xs font-semibold text-gray-700">{formatCurrency(amt)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {['all', ...CATEGORIES].map(c => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border capitalize ${
              catFilter === c
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {c === 'all' ? `All (${expenses.length})` : c}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🧾</span>
            <p className="text-sm font-medium">No expenses found</p>
            <p className="text-xs mt-1">
              {catFilter !== 'all' ? 'Try a different category filter' : 'Click "Add Expense" to record one'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Batch</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visible.map(e => (
                  <tr key={e.id} className="hover:bg-amber-50/40 transition">
                    <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-5 py-4"><CategoryBadge category={e.category} /></td>
                    <td className="px-5 py-4 text-gray-700">{e.description || <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">
                      {e.batches
                        ? `${e.batches.farms?.name} (${formatDate(e.batches.start_date)})`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-800">
                      {formatCurrency(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 bg-gray-50 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {catFilter === 'all' ? 'Grand Total' : `${catFilter} total`}
              </span>
              <span className="text-sm font-bold text-gray-800">
                {formatCurrency(visible.reduce((s, e) => s + Number(e.amount), 0))}
              </span>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          batches={batches}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData() }}
        />
      )}
    </div>
  )
}
