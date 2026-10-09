import { useEffect, useState, useMemo, useRef } from 'react'
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
    vendor_credit:       t('accounts.categories.vendorCredit'),
    supplier_payment:    t('accounts.categories.supplierPayment'),
    expense:             t('accounts.categories.expense'),
    procurement:         t('accounts.categories.procurement'),
    growing_fee_payment: t('accounts.categories.growingFeePayment'),
    growing_fee_advance: t('accounts.categories.growingFeeAdvance'),
    owner_withdrawal:    t('accounts.categories.ownerWithdrawal'),
    transfer:            t('accounts.categories.transfer'),
    other:               t('accounts.categories.other'),
  }
}

const CATEGORY_STYLES = {
  vendor_payment:      'bg-green-100  text-green-700',
  vendor_credit:       'bg-teal-100   text-teal-700',
  supplier_payment:    'bg-red-100    text-red-700',
  expense:             'bg-orange-100 text-orange-700',
  procurement:         'bg-blue-100   text-blue-700',
  growing_fee_payment: 'bg-purple-100 text-purple-700',
  growing_fee_advance: 'bg-amber-100  text-amber-700',
  owner_withdrawal:    'bg-rose-100   text-rose-700',
  transfer:            'bg-sky-100    text-sky-700',
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

// category → { dir: fixed direction or null, needs: 'vendor'|'supplier'|'farm'|'desc' }
const MANUAL_CATEGORY_CONFIG = {
  vendor_payment:      { dir: 'in',  needs: 'vendor' },
  vendor_credit:       { dir: 'out', needs: 'vendor' },
  supplier_payment:    { dir: 'out', needs: 'supplier' },
  growing_fee_advance: { dir: 'out', needs: 'farm' },
  growing_fee_payment: { dir: 'out', needs: 'farm' },
  expense:             { dir: 'out', needs: 'desc' },
  owner_withdrawal:    { dir: 'out', needs: 'desc' },
  other:               { dir: null,  needs: 'desc' },
}
const MANUAL_CATS = Object.keys(MANUAL_CATEGORY_CONFIG)

function ManualEntryModal({ accounts, defaultAccountId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()

  const [category, setCategory]   = useState('vendor_payment')
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')
  const [txType, setTxType]       = useState('in')
  const [personId, setPersonId]   = useState('')
  const [amount, setAmount]       = useState('')
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [vendors,   setVendors]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [farms,     setFarms]     = useState([])
  const [batches,   setBatches]   = useState([])
  const [batchId,   setBatchId]   = useState('')

  useEffect(() => {
    const id = organization.id
    Promise.all([
      supabase.from('contacts').select('id,name').eq('is_vendor', true).eq('organization_id', id).order('name'),
      supabase.from('contacts').select('id,name').eq('is_supplier', true).eq('organization_id', id).order('name'),
      supabase.from('farms').select('id,name').eq('organization_id', id).order('name'),
    ]).then(([v, s, f]) => {
      setVendors(v.data || [])
      setSuppliers(s.data || [])
      setFarms(f.data || [])
    })
  }, [organization.id])

  const cfg = MANUAL_CATEGORY_CONFIG[category]

  useEffect(() => {
    if (cfg.needs !== 'farm' || !personId) { setBatches([]); setBatchId(''); return }
    supabase.from('batches').select('id,start_date').eq('organization_id', organization.id).eq('farm_id', personId).eq('status', 'active').order('start_date', { ascending: false })
      .then(({ data }) => {
        const b = data || []
        setBatches(b)
        setBatchId(b.length === 1 ? b[0].id : '')
      })
  }, [personId, cfg.needs, organization.id])

  function handleCategoryChange(cat) {
    setCategory(cat)
    setPersonId('')
    setBatchId('')
    setBatches([])
    setError('')
    const c = MANUAL_CATEGORY_CONFIG[cat]
    if (c.dir) setTxType(c.dir)
  }

  const personOptions = cfg.needs === 'vendor'   ? vendors
                      : cfg.needs === 'supplier' ? suppliers
                      : cfg.needs === 'farm'     ? farms
                      : []

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!accountId) { setError('Select an account'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (cfg.needs !== 'desc' && !personId) {
      setError(`Select a ${cfg.needs}`)
      return
    }
    if (cfg.needs === 'farm' && !batchId) { setError('Select a batch'); return }
    if (cfg.needs === 'desc' && !notes.trim()) { setError('Description is required'); return }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const orgId    = organization.id

    try {
      if (category === 'vendor_payment' || category === 'vendor_credit') {
        const isCredit = category === 'vendor_credit'
        const vendor   = vendors.find(v => v.id === personId)
        const { data: cc, error: ccErr } = await supabase.from('cash_collection').insert({
          organization_id:   orgId,
          vendor_id:         personId,
          sale_id:           null,
          amount_paid:       amt,
          entry_type:        isCredit ? 'credit' : 'collection',
          method:            'online',
          status:            'verified',
          date,
          balance_due:       0,
          account_id:        accountId,
          notes:             notes.trim() || null,
          collected_by_id:   user?.id,
          collected_by_name: userName,
          created_by_id:     user?.id,
          created_by_name:   userName,
        }).select('id').single()
        if (ccErr) throw ccErr
        const { error: txErr } = await supabase.from('transactions').insert({
          organization_id:  orgId,
          account_id:       accountId,
          transaction_type: isCredit ? 'out' : 'in',
          category,
          description:      isCredit
            ? `Credit to ${vendor?.name}${notes.trim() ? ` — ${notes.trim()}` : ''}`
            : `Collection from ${vendor?.name}${notes.trim() ? ` — ${notes.trim()}` : ''}`,
          amount:           amt,
          transaction_date: date,
          reference_type:   'cash_collection',
          reference_id:     cc.id,
          created_by_id:    user?.id,
          created_by_name:  userName,
        })
        if (txErr) throw txErr

      } else if (category === 'supplier_payment') {
        const supplier = suppliers.find(s => s.id === personId)
        const { data: sp, error: spErr } = await supabase.from('supplier_payments').insert({
          organization_id: orgId,
          supplier_id:     personId,
          amount:          amt,
          payment_date:    date,
          payment_method:  null,
          account_id:      accountId,
          notes:           notes.trim() || null,
          created_by_id:   user?.id,
          created_by_name: userName,
        }).select('id').single()
        if (spErr) throw spErr
        const { error: txErr } = await supabase.from('transactions').insert({
          organization_id:  orgId,
          account_id:       accountId,
          transaction_type: 'out',
          category:         'supplier_payment',
          description:      `Payment to ${supplier?.name}${notes.trim() ? ` — ${notes.trim()}` : ''}`,
          amount:           amt,
          transaction_date: date,
          reference_type:   'supplier_payment',
          reference_id:     sp.id,
          created_by_id:    user?.id,
          created_by_name:  userName,
        })
        if (txErr) throw txErr

      } else if (category === 'growing_fee_advance') {
        const farm = farms.find(f => f.id === personId)
        const { data: gfa, error: gfaErr } = await supabase.from('growing_fee_advances').insert({
          organization_id: orgId,
          farm_id:         personId,
          batch_id:        batchId,
          amount:          amt,
          payment_date:    date,
          payment_method:  null,
          account_id:      accountId,
          notes:           notes.trim() || null,
          created_by_id:   user?.id,
          created_by_name: userName,
        }).select('id').single()
        if (gfaErr) throw gfaErr
        const { error: txErr } = await supabase.from('transactions').insert({
          organization_id:  orgId,
          account_id:       accountId,
          transaction_type: 'out',
          category:         'growing_fee_advance',
          description:      `Growing fee advance — ${farm?.name}${notes.trim() ? ` — ${notes.trim()}` : ''}`,
          amount:           amt,
          transaction_date: date,
          reference_type:   'growing_fee_advance',
          reference_id:     gfa.id,
          created_by_id:    user?.id,
          created_by_name:  userName,
        })
        if (txErr) throw txErr

      } else if (category === 'growing_fee_payment') {
        const farm = farms.find(f => f.id === personId)
        const { data: gfp, error: gfpErr } = await supabase.from('growing_fee_payments').insert({
          organization_id: orgId,
          farm_id:         personId,
          amount:          amt,
          payment_date:    date,
          payment_method:  null,
          notes:           notes.trim() || null,
        }).select('id').single()
        if (gfpErr) throw gfpErr
        const { error: txErr } = await supabase.from('transactions').insert({
          organization_id:  orgId,
          account_id:       accountId,
          transaction_type: 'out',
          category:         'growing_fee_payment',
          description:      `Growing fee payment — ${farm?.name}${notes.trim() ? ` — ${notes.trim()}` : ''}`,
          amount:           amt,
          transaction_date: date,
          reference_type:   'growing_fee_payment',
          reference_id:     gfp.id,
          created_by_id:    user?.id,
          created_by_name:  userName,
        })
        if (txErr) throw txErr

      } else {
        // expense / procurement / owner_withdrawal / other — plain transaction
        const { error: txErr } = await supabase.from('transactions').insert({
          organization_id:  orgId,
          account_id:       accountId,
          transaction_type: txType,
          category,
          description:      notes.trim(),
          amount:           amt,
          transaction_date: date,
          created_by_id:    user?.id,
          created_by_name:  userName,
        })
        if (txErr) throw txErr
      }

      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const categoryLabels = getCategoryLabels(t)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('accounts.manualEntry')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.selectAccount')} *</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('expenses.category')} *</label>
            <select value={category} onChange={e => handleCategoryChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              {MANUAL_CATS.map(k => <option key={k} value={k}>{categoryLabels[k]}</option>)}
            </select>
          </div>

          {/* Context-specific: vendor / supplier / farm picker */}
          {cfg.needs !== 'desc' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                {cfg.needs} *
              </label>
              <select value={personId} onChange={e => setPersonId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">— select —</option>
                {personOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* Batch picker — shown when farm is selected for growing fee categories */}
          {cfg.needs === 'farm' && personId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch *</label>
              {batches.length === 0
                ? <p className="text-sm text-amber-600">No active batches for this farm</p>
                : <select value={batchId} onChange={e => setBatchId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                    <option value="">— select batch —</option>
                    {batches.map(b => <option key={b.id} value={b.id}>Batch started {b.start_date}</option>)}
                  </select>
              }
            </div>
          )}

          {/* IN / OUT toggle — only for categories with no fixed direction */}
          {cfg.dir === null && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountType')} *</label>
              <div className="flex gap-2">
                {['in', 'out'].map(d => (
                  <button key={d} type="button" onClick={() => setTxType(d)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      txType === d
                        ? d === 'in' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {d === 'in' ? `▲ ${t('accounts.moneyIn')}` : `▼ ${t('accounts.moneyOut')}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountLabel')} *</label>
              <input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>

          {/* Notes / Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {cfg.needs === 'desc' ? `${t('common.description')} *` : t('common.notes')}
            </label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={cfg.needs === 'desc' ? 'e.g. Electricity bill' : 'Optional note'}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
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

// ─── Person Picker (searchable dropdown) ─────────────────────────────────────

const OTHER_PERSON = { id: '__other__', name: 'Other / Misc', type: 'other', outstanding: 0 }

function PersonPicker({ persons, value, onChange, loading }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)
  const inputRef        = useRef(null)

  const displayValue = open ? q : (value ? value.name : '')

  const filteredPersons = q.trim()
    ? persons.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))
    : persons

  const showOther = !q.trim() || 'other'.includes(q.toLowerCase()) || 'misc'.includes(q.toLowerCase())

  function select(p) {
    onChange(p)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={displayValue}
        placeholder={loading ? 'Loading…' : 'Search vendor / supplier…'}
        disabled={loading}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange(null) }}
      />
      {open && !loading && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {/* Other / Misc pinned at top */}
          {showOther && (
            <button
              type="button"
              onMouseDown={() => select(OTHER_PERSON)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2 border-b border-gray-100 ${value?.type === 'other' ? 'bg-gray-50' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-700 font-medium">Other / Misc</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">other</span>
              </div>
              <span className="text-xs text-gray-400">bank charge, interest…</span>
            </button>
          )}
          {filteredPersons.length === 0 && !showOther ? (
            <p className="px-3 py-2 text-xs text-gray-400">No results</p>
          ) : filteredPersons.map(p => (
            <button
              key={`${p.type}-${p.id}`}
              type="button"
              onMouseDown={() => select(p)}
              className={`w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center justify-between gap-2 ${value?.id === p.id && value?.type === p.type ? 'bg-amber-50' : ''}`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm text-gray-800 truncate">{p.name}</span>
                <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${p.type === 'vendor' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  {p.type === 'vendor' ? 'V' : 'S'}
                </span>
              </div>
              <span className={`flex-shrink-0 text-xs font-semibold ${p.outstanding > 0 ? 'text-red-500' : p.outstanding < 0 ? 'text-blue-500' : 'text-gray-300'}`}>
                {p.outstanding !== 0 ? formatCurrency(Math.abs(p.outstanding)) : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bulk Statement Entry Modal ───────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
let _rowId = 1
function makeRow() { return { _id: _rowId++, type: 'cr', person: null, amount: '', date: TODAY, note: '' } }

function BulkEntryModal({ accounts, defaultAccountId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()

  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')
  const [rows, setRows]           = useState(() => [makeRow(), makeRow(), makeRow()])
  const [persons, setPersons]     = useState([])
  const [personsLoading, setPersonsLoading] = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    async function load() {
      const orgId = organization.id
      const [{ data: vendors }, { data: vb }, { data: sups }, { data: procs }, { data: spays }] = await Promise.all([
        supabase.from('contacts').select('id, name').eq('is_vendor', true).eq('organization_id', orgId).order('name'),
        supabase.from('vendor_balances').select('vendor_id, outstanding_balance').eq('organization_id', orgId),
        supabase.from('contacts').select('id, name, opening_balance').eq('is_supplier', true).eq('organization_id', orgId).order('name'),
        supabase.from('procurement').select('supplier_id, cost, is_return').eq('organization_id', orgId),
        supabase.from('supplier_payments').select('supplier_id, amount').eq('organization_id', orgId),
      ])
      const vbMap = Object.fromEntries((vb || []).map(b => [b.vendor_id, Number(b.outstanding_balance)]))
      const costMap = {}, paidMap = {}
      for (const p of procs || []) {
        if (!costMap[p.supplier_id]) costMap[p.supplier_id] = 0
        if (!p.is_return) costMap[p.supplier_id] += Number(p.cost)
      }
      for (const sp of spays || []) {
        if (!paidMap[sp.supplier_id]) paidMap[sp.supplier_id] = 0
        paidMap[sp.supplier_id] += Number(sp.amount)
      }
      const vendorList   = (vendors || []).map(v => ({ id: v.id, name: v.name, type: 'vendor',   outstanding: vbMap[v.id] ?? 0 }))
      const supplierList = (sups    || []).map(s => ({ id: s.id, name: s.name, type: 'supplier', outstanding: Number(s.opening_balance || 0) + (costMap[s.id] || 0) - (paidMap[s.id] || 0) }))
      setPersons([...vendorList, ...supplierList])
      setPersonsLoading(false)
    }
    load()
  }, [])

  function addRow()              { setRows(r => [...r, makeRow()]) }
  function removeRow(id)         { setRows(r => r.filter(row => row._id !== id)) }
  function updateRow(id, f, v)   { setRows(r => r.map(row => row._id === id ? { ...row, [f]: v } : row)) }

  const validRows = rows.filter(r => r.person && parseFloat(r.amount) > 0 && (r.person.type !== 'other' || r.note.trim()))
  const totalCR   = validRows.filter(r => r.type === 'cr').reduce((s, r) => s + parseFloat(r.amount), 0)
  const totalDR   = validRows.filter(r => r.type === 'dr').reduce((s, r) => s + parseFloat(r.amount), 0)

  async function handleSave() {
    if (!accountId)          { setSaveError('Select an account'); return }
    if (!validRows.length)   { setSaveError('Add at least one complete row (person + amount)'); return }
    setSaveError(''); setSaving(true)

    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const failed   = []

    for (const row of validRows) {
      const amt    = parseFloat(row.amount)
      const isCR   = row.type === 'cr'
      const desc   = `${isCR ? 'Collection from' : 'Payment to'} ${row.person.name}${row.note ? ` — ${row.note}` : ''}`

      try {
        if (row.person.type === 'other') {
          // Other / Misc — just a plain transaction, no domain record
          await supabase.from('transactions').insert({
            organization_id:  orgId(organization),
            account_id:       accountId,
            transaction_type: isCR ? 'in' : 'out',
            category:         'other',
            description:      row.note.trim(),
            amount:           amt,
            transaction_date: row.date,
            created_by_id:    user?.id,
            created_by_name:  userName,
          })

        } else if (row.person.type === 'vendor' && isCR) {
          // Vendor collection → cash_collection + transaction
          const { data: cc, error: ccErr } = await supabase.from('cash_collection').insert({
            organization_id:   orgId(organization),
            vendor_id:         row.person.id,
            sale_id:           null,
            amount_paid:       amt,
            method:            'online',
            status:            'verified',
            date:              row.date,
            balance_due:       0,
            account_id:        accountId,
            notes:             row.note.trim() || null,
            collected_by_id:   user?.id,
            collected_by_name: userName,
            created_by_id:     user?.id,
            created_by_name:   userName,
          }).select('id').single()
          if (ccErr) throw ccErr
          await supabase.from('transactions').insert({
            organization_id:  orgId(organization),
            account_id:       accountId,
            transaction_type: 'in',
            category:         'vendor_payment',
            description:      desc,
            amount:           amt,
            transaction_date: row.date,
            reference_type:   'cash_collection',
            reference_id:     cc.id,
            created_by_id:    user?.id,
            created_by_name:  userName,
          })

        } else if (row.person.type === 'supplier' && !isCR) {
          // Supplier payment → supplier_payments + transaction
          const { data: sp, error: spErr } = await supabase.from('supplier_payments').insert({
            organization_id:  orgId(organization),
            supplier_id:      row.person.id,
            amount:           amt,
            payment_date:     row.date,
            payment_method:   null,
            account_id:       accountId,
            notes:            row.note.trim() || null,
            created_by_id:    user?.id,
            created_by_name:  userName,
          }).select('id').single()
          if (spErr) throw spErr
          await supabase.from('transactions').insert({
            organization_id:  orgId(organization),
            account_id:       accountId,
            transaction_type: 'out',
            category:         'supplier_payment',
            description:      desc,
            amount:           amt,
            transaction_date: row.date,
            reference_type:   'supplier_payment',
            reference_id:     sp.id,
            created_by_id:    user?.id,
            created_by_name:  userName,
          })

        } else {
          // Rare case (vendor DR / supplier CR) — just a transaction
          const cat = row.person.type === 'vendor' ? 'vendor_payment' : 'supplier_payment'
          await supabase.from('transactions').insert({
            organization_id:  orgId(organization),
            account_id:       accountId,
            transaction_type: isCR ? 'in' : 'out',
            category:         cat,
            description:      desc,
            amount:           amt,
            transaction_date: row.date,
            created_by_id:    user?.id,
            created_by_name:  userName,
          })
        }
      } catch (err) {
        failed.push(`${row.person.name}: ${err.message}`)
      }
    }

    setSaving(false)
    if (failed.length) {
      setSaveError(`${failed.length} entr${failed.length > 1 ? 'ies' : 'y'} failed:\n${failed.join('\n')}`)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">📋 {t('accounts.bulkEntry.title')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('accounts.bulkEntry.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Account row */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">{t('accounts.selectAccount')} *</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
          </select>
          <span className="text-xs text-gray-400 ml-auto">
            <span className="inline-flex items-center gap-1">
              <span className="bg-green-100 text-green-700 text-xs font-medium px-1.5 py-0.5 rounded-full">V</span> Vendor
            </span>
            <span className="inline-flex items-center gap-1 ml-3">
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded-full">S</span> Supplier · Balance shown right
            </span>
          </span>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[110px_88px_1fr_130px_30px] gap-2 px-6 pt-3 pb-1 flex-shrink-0">
          {['Date', 'Type', 'Vendor / Supplier', 'Amount (₹)', ''].map((h, i) => (
            <span key={i} className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
          {rows.map(row => (
            <div key={row._id} className="grid grid-cols-[110px_88px_1fr_130px_30px] gap-2 items-start">
              {/* Date */}
              <input type="date" value={row.date}
                onChange={e => updateRow(row._id, 'date', e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 w-full" />

              {/* DR/CR */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold h-[38px]">
                <button type="button" onClick={() => updateRow(row._id, 'type', 'cr')}
                  className={`flex-1 transition ${row.type === 'cr' ? 'bg-green-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  ▲ CR
                </button>
                <button type="button" onClick={() => updateRow(row._id, 'type', 'dr')}
                  className={`flex-1 transition border-l border-gray-200 ${row.type === 'dr' ? 'bg-red-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                  ▼ DR
                </button>
              </div>

              {/* Person picker */}
              <div>
                <PersonPicker
                  persons={persons}
                  value={row.person}
                  loading={personsLoading}
                  onChange={p => { updateRow(row._id, 'person', p); if (p?.type !== 'other') updateRow(row._id, 'note', '') }}
                />
                {row.person && row.person.type === 'other' ? (
                  <input
                    type="text"
                    value={row.note}
                    onChange={e => updateRow(row._id, 'note', e.target.value)}
                    placeholder="Description (required)"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                ) : row.person ? (
                  <p className={`text-xs mt-0.5 px-1 ${row.person.outstanding > 0 ? 'text-red-500' : row.person.outstanding < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {row.person.outstanding > 0
                      ? `Outstanding: ${formatCurrency(row.person.outstanding)}`
                      : row.person.outstanding < 0
                        ? `Credit: ${formatCurrency(Math.abs(row.person.outstanding))}`
                        : 'Cleared'}
                  </p>
                ) : null}
              </div>

              {/* Amount */}
              <input type="number" min="0.01" step="0.01" value={row.amount}
                onChange={e => updateRow(row._id, 'amount', e.target.value)}
                placeholder="0.00"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400 w-full" />

              {/* Remove */}
              <button type="button" onClick={() => removeRow(row._id)}
                className="text-gray-300 hover:text-red-400 transition text-xl leading-none mt-2">×</button>
            </div>
          ))}

          <button type="button" onClick={addRow}
            className="mt-1 text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 py-1">
            + {t('accounts.bulkEntry.addRow')}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 whitespace-pre-line">{saveError}</p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex gap-5 text-sm">
              <span className="text-green-700 font-semibold">▲ CR: {formatCurrency(totalCR)}</span>
              <span className="text-red-600 font-semibold">▼ DR: {formatCurrency(totalDR)}</span>
              <span className={`font-bold ${totalCR >= totalDR ? 'text-green-700' : 'text-red-600'}`}>
                Net: {totalCR >= totalDR ? '+' : '-'}{formatCurrency(Math.abs(totalCR - totalDR))}
              </span>
              <span className="text-gray-400">{validRows.length} {validRows.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={handleSave} disabled={saving || validRows.length === 0}
                className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
                {saving ? t('common.loading') : `${t('accounts.bulkEntry.saveAll')} (${validRows.length})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function orgId(organization) { return organization.id }

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({ accounts, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t } = useTranslation()
  const [form, setForm] = useState({
    from_account_id:  accounts[0]?.id ?? '',
    to_account_id:    accounts[1]?.id ?? accounts[0]?.id ?? '',
    amount:           '',
    note:             '',
    transaction_date: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.from_account_id === form.to_account_id) { setError(t('accounts.transfer.sameAccountError')); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError(t('accounts.transfer.invalidAmount')); return }
    setSaving(true)

    const fromAcc = accounts.find(a => a.id === form.from_account_id)
    const toAcc   = accounts.find(a => a.id === form.to_account_id)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const noteText = form.note.trim()
    const descOut  = `${t('accounts.transfer.to')} ${toAcc?.name}${noteText ? ` — ${noteText}` : ''}`
    const descIn   = `${t('accounts.transfer.from')} ${fromAcc?.name}${noteText ? ` — ${noteText}` : ''}`

    const { error: err } = await supabase.from('transactions').insert([
      {
        organization_id:  organization.id,
        account_id:       form.from_account_id,
        transaction_type: 'out',
        category:         'transfer',
        description:      descOut,
        amount:           amt,
        transaction_date: form.transaction_date,
        created_by_id:    user?.id,
        created_by_name:  userName,
      },
      {
        organization_id:  organization.id,
        account_id:       form.to_account_id,
        transaction_type: 'in',
        category:         'transfer',
        description:      descIn,
        amount:           amt,
        transaction_date: form.transaction_date,
        created_by_id:    user?.id,
        created_by_name:  userName,
      },
    ])
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const toOptions = accounts.filter(a => a.id !== form.from_account_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">⇄ {t('accounts.transfer.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.transfer.from')} *</label>
              <select value={form.from_account_id} onChange={set('from_account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.transfer.to')} *</label>
              <select value={form.to_account_id} onChange={set('to_account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                {toOptions.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountLabel')} (₹) *</label>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={form.transaction_date} onChange={set('transaction_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.transfer.note')}</label>
            <input value={form.note} onChange={set('note')} placeholder={t('accounts.transfer.notePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <p className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            {t('accounts.transfer.hint')}
          </p>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('accounts.transfer.confirm')}
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

// ─── Edit Transaction Modal ───────────────────────────────────────────────────

const LINKED_AMOUNT_MAP = {
  cash_collection:     { table: 'cash_collection',     col: 'amount_paid' },
  supplier_payment:    { table: 'supplier_payments',   col: 'amount' },
  growing_fee_advance: { table: 'growing_fee_advances', col: 'amount' },
  growing_fee_payment: { table: 'growing_fee_payments', col: 'amount' },
}

function EditTransactionModal({ txn, accounts, onClose, onSaved }) {
  const { user } = useAuth()
  const { t }    = useTranslation()

  const [description, setDescription] = useState(txn.description || '')
  const [amount, setAmount]           = useState(String(txn.amount))
  const [date, setDate]               = useState(txn.transaction_date)
  const [accountId, setAccountId]     = useState(txn.account_id)
  const [txType, setTxType]           = useState(txn.transaction_type)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!description.trim()) { setError('Description is required'); return }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    try {
      const { error: txErr } = await supabase.from('transactions').update({
        description:      description.trim(),
        amount:           amt,
        transaction_date: date,
        account_id:       accountId,
        transaction_type: txType,
        updated_by_name:  userName,
        updated_by_id:    user?.id,
        updated_at:       new Date().toISOString(),
      }).eq('id', txn.id)
      if (txErr) throw txErr

      // Also update the linked record's amount so balances stay correct
      const linked = txn.reference_id && LINKED_AMOUNT_MAP[txn.reference_type]
      if (linked) {
        const { error: lErr } = await supabase.from(linked.table)
          .update({ [linked.col]: amt })
          .eq('id', txn.reference_id)
        if (lErr) throw lErr
      }

      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const catLabels = getCategoryLabels(t)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Edit Transaction</h2>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mt-1 ${CATEGORY_STYLES[txn.category] ?? CATEGORY_STYLES.other}`}>
              {catLabels[txn.category] ?? txn.category}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {txn.category === 'transfer' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            This is one side of a transfer. The paired entry will not be updated automatically.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.selectAccount')} *</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_ICON[a.type]} {a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounts.accountType')} *</label>
            <div className="flex gap-2">
              {['in', 'out'].map(d => (
                <button key={d} type="button" onClick={() => setTxType(d)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    txType === d
                      ? d === 'in' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}>
                  {d === 'in' ? `▲ ${t('accounts.moneyIn')}` : `▼ ${t('accounts.moneyOut')}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')} *</label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountLabel')} *</label>
              <input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
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
  const [ccAuditMap,   setCcAuditMap]   = useState({})
  const [loading,      setLoading]      = useState(true)
  const [addAccModal,    setAddAccModal]    = useState(false)
  const [manualModal,    setManualModal]    = useState(false)
  const [transferModal,  setTransferModal]  = useState(false)
  const [bulkModal,      setBulkModal]      = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [editingTxn,     setEditingTxn]     = useState(null)

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
    const txnList = txns || []
    setTransactions(txnList)

    const ccIds = [...new Set(txnList.filter(t => t.reference_type === 'cash_collection' && t.reference_id).map(t => t.reference_id))]
    if (ccIds.length) {
      const { data: ccRows } = await supabase.from('cash_collection')
        .select('id, collected_by_name, created_at, updated_by_name, updated_at, verified_by_name, verified_at')
        .in('id', ccIds)
      const map = {}
      for (const cc of ccRows || []) map[cc.id] = cc
      setCcAuditMap(map)
    }
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
            <button onClick={() => setBulkModal(true)}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition">
              📋 {t('accounts.bulkEntry.title')}
            </button>
            <button onClick={() => setTransferModal(true)}
              className="rounded-lg border border-sky-300 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 transition">
              ⇄ {t('accounts.transfer.title')}
            </button>
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
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingTxn(txn)}
                          className="text-gray-300 hover:text-amber-500 transition"
                          title="Edit transaction"
                        >
                          ✎
                        </button>
                        {(() => {
                          const cc = txn.reference_type === 'cash_collection' ? ccAuditMap[txn.reference_id] : null
                          return cc
                            ? <AuditInfo createdByName={cc.collected_by_name} createdAt={cc.created_at} updatedByName={cc.updated_by_name} updatedAt={cc.updated_at} confirmedByName={cc.verified_by_name} confirmedAt={cc.verified_at} />
                            : <AuditInfo createdByName={txn.created_by_name} createdAt={txn.created_at} updatedByName={txn.updated_by_name} updatedAt={txn.updated_at} />
                        })()}
                      </div>
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
        <ManualEntryModal accounts={accounts} defaultAccountId={accountFilter !== 'all' ? accountFilter : null} onClose={() => setManualModal(false)} onSaved={() => { setManualModal(false); fetchData() }} />
      )}
      {transferModal && accounts.length >= 2 && (
        <TransferModal accounts={accounts} onClose={() => setTransferModal(false)} onSaved={() => { setTransferModal(false); fetchData() }} />
      )}
      {bulkModal && accounts.length > 0 && (
        <BulkEntryModal accounts={accounts} defaultAccountId={accountFilter !== 'all' ? accountFilter : null} onClose={() => setBulkModal(false)} onSaved={() => { setBulkModal(false); fetchData() }} />
      )}
      {editingAccount && (
        <EditAccountModal account={editingAccount} onClose={() => setEditingAccount(null)} onSaved={() => { setEditingAccount(null); fetchData() }} />
      )}
      {editingTxn && accounts.length > 0 && (
        <EditTransactionModal txn={editingTxn} accounts={accounts} onClose={() => setEditingTxn(null)} onSaved={() => { setEditingTxn(null); fetchData() }} />
      )}
    </div>
  )
}
