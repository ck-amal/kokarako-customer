import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import AttachmentUploader from '../components/AttachmentUploader'
import AttachmentViewer from '../components/AttachmentViewer'
import { uploadAttachments, attachmentsByEntity } from '../lib/attachments'
import AuditInfo from '../components/AuditInfo'

const METHODS = [
  { k: 'cash',   label: '💵 Cash' },
  { k: 'online', label: '📱 Online' },
  { k: 'cheque', label: '🧾 Cheque' },
]
const STATUS_STYLE  = { pending: 'bg-amber-100 text-amber-700', verified: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' }
const STATUS_LABEL  = { pending: 'In hand', verified: 'Verified', rejected: 'Rejected' }

const today = () => new Date().toISOString().slice(0, 10)

// ─── Record collection modal ──────────────────────────────────────────────────
function CollectionModal({ editItem, onClose, onSaved }) {
  const { t, i18n } = useTranslation()
  const { organization, user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const isEdit = !!editItem
  const [vendors, setVendors]           = useState([])
  const [sales, setSales]               = useState([])
  const [vendorBalance, setVendorBalance] = useState(null)
  const [form, setForm] = useState(editItem ? {
    vendor_id: editItem.vendor_id || '', sale_id: editItem.sale_id || '',
    amount_paid: String(editItem.amount_paid ?? ''), method: editItem.method || 'cash',
    date: editItem.date || today(), notes: editItem.notes || '',
  } : { vendor_id: '', sale_id: '', amount_paid: '', method: 'cash', date: today(), notes: '' })
  const [files, setFiles]   = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    supabase.from('vendors').select('id, name').eq('organization_id', organization.id).order('name')
      .then(({ data }) => setVendors(data || []))
  }, [])

  useEffect(() => {
    if (!form.vendor_id) { setSales([]); setVendorBalance(null); return }
    supabase.from('sales').select('id, date, total_amount').eq('organization_id', organization.id)
      .eq('vendor_id', form.vendor_id).order('date', { ascending: false })
      .then(({ data }) => setSales(data || []))
    supabase.from('vendor_balances').select('total_sales, total_collected, outstanding_balance')
      .eq('organization_id', organization.id).eq('vendor_id', form.vendor_id).maybeSingle()
      .then(({ data }) => setVendorBalance(data))
  }, [form.vendor_id])

  function set(field) { return e => setForm(p => ({ ...p, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.vendor_id) { setError('Select who paid (vendor)'); return }
    if (!form.amount_paid || Number(form.amount_paid) <= 0) { setError('Enter a valid amount'); return }
    setError(''); setSaving(true)

    let entityId = editItem?.id
    if (isEdit) {
      const { error: updErr } = await supabase.from('cash_collection').update({
        vendor_id:       form.vendor_id,
        sale_id:         form.sale_id || null,
        amount_paid:     Number(form.amount_paid),
        method:          form.method,
        date:            form.date,
        notes:           form.notes.trim() || null,
        updated_by_id:   user?.id,
        updated_by_name: userName,
        updated_at:      new Date().toISOString(),
      }).eq('id', editItem.id)
      if (updErr) { setError(updErr.message); setSaving(false); return }
    } else {
      const { data: cc, error: insErr } = await supabase.from('cash_collection').insert({
        organization_id:   organization.id,
        vendor_id:         form.vendor_id,
        sale_id:           form.sale_id || null,
        amount_paid:       Number(form.amount_paid),
        method:            form.method,
        status:            'pending',
        date:              form.date,
        balance_due:       0,
        notes:             form.notes.trim() || null,
        collected_by_id:   user?.id,
        collected_by_name: userName,
        created_by_id:     user?.id,
        created_by_name:   userName,
      }).select('id').single()
      if (insErr) { setError(insErr.message); setSaving(false); return }
      entityId = cc.id
    }

    if (files.length) {
      try {
        await uploadAttachments({ organizationId: organization.id, entityType: 'cash_collection', entityId, files, user })
      } catch (err) {
        alert('Saved, but the file upload failed: ' + err.message)
      }
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{isEdit ? 'Edit collection' : 'Record collection'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paid by (vendor) *</label>
            <select required value={form.vendor_id} onChange={set('vendor_id')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">— select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {vendorBalance !== null && (
            <div className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
              Number(vendorBalance.outstanding_balance) > 0
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}>
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wide ${Number(vendorBalance.outstanding_balance) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  Receivable (outstanding)
                </p>
                <p className={`text-xl font-bold mt-0.5 ${Number(vendorBalance.outstanding_balance) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {formatCurrency(Number(vendorBalance.outstanding_balance))}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 space-y-0.5">
                <p>Total sales: <span className="font-semibold text-gray-700">{formatCurrency(Number(vendorBalance.total_sales))}</span></p>
                <p>Collected: <span className="font-semibold text-gray-700">{formatCurrency(Number(vendorBalance.total_collected))}</span></p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.amountPaid')} (₹) *</label>
            <input required type="number" min="0.01" step="0.01" value={form.amount_paid} onChange={set('amount_paid')}
              placeholder="e.g. 5000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method *</label>
            <div className="flex gap-2">
              {METHODS.map(m => (
                <button type="button" key={m.k} onClick={() => setForm(p => ({ ...p, method: m.k }))}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    form.method === m.k ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {sales.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.sale')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
              <select value={form.sale_id} onChange={set('sale_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">— not linked to a sale —</option>
                {sales.map(s => <option key={s.id} value={s.id}>{formatDate(s.date, i18n.language)} — {formatCurrency(s.total_amount)}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('cashCollection.paymentDate')} *</label>
            <input required type="date" value={form.date} onChange={set('date')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
            <input type="text" value={form.notes} onChange={set('notes')} placeholder="e.g. UPI ref, cash via hand"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <AttachmentUploader value={files} onChange={setFiles} label={isEdit ? 'Add more files (optional)' : 'Proof / screenshot (optional)'} />

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? `${t('common.save')}…` : (isEdit ? 'Update' : t('common.save'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Verify modal (pick account) ──────────────────────────────────────────────
function VerifyModal({ item, accounts, onClose, onDone }) {
  const { user } = useAuth()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const [accountId, setAccountId] = useState(() => {
    const pref = accounts.find(a => a.type === (item.method === 'online' ? 'bank' : 'cash')) || accounts[0]
    return pref?.id || ''
  })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function verify() {
    if (!accountId) { setError('Choose an account'); return }
    setBusy(true)
    const { error } = await supabase.rpc('verify_cash_collection', {
      p_id: item.id, p_account_id: accountId, p_verified_by_name: userName,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800">Verify {formatCurrency(item.amount_paid)}</h2>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">Post to which account?</p>
        <div className="space-y-2">
          {accounts.map(a => (
            <button key={a.id} type="button" onClick={() => setAccountId(a.id)}
              className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                accountId === a.id ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <span className="text-amber-500">{accountId === a.id ? '●' : '○'}</span>
              <span className="flex-1 text-left font-medium text-gray-800">{a.name}</span>
              <span className="text-xs text-gray-400 capitalize">{a.type}</span>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}</p>}
        <div className="flex gap-3 pt-4">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          <button type="button" onClick={verify} disabled={busy}
            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
            {busy ? 'Verifying…' : 'Verify & post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Collection card ──────────────────────────────────────────────────────────
function CollectionCard({ item, files, showCollector, showActions, canEdit, onView, onEdit, onVerify, onReject }) {
  const { i18n } = useTranslation()
  return (
    <div onClick={onView} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-amber-200 transition">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-gray-800">{formatCurrency(item.amount_paid)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[item.status] || STATUS_STYLE.pending}`}>
          {STATUS_LABEL[item.status] || item.status}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-700 mt-1.5">{item.vendors?.name || '—'}</p>
      <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
        <span className="capitalize">{item.method || 'cash'} · {formatDate(item.date, i18n.language)}{files?.length ? ` · 📎${files.length}` : ''}</span>
        <div className="flex items-center gap-1.5">
          {showCollector && <span>by {item.collected_by_name || '—'}</span>}
          <AuditInfo
            createdByName={item.created_by_name} createdAt={item.created_at}
            updatedByName={item.updated_by_name} updatedAt={item.updated_at}
            confirmedByName={item.verified_by_name} confirmedAt={item.verified_at}
          />
        </div>
      </div>
      {canEdit && item.status === 'pending' && (
        <div className="mt-3" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit}
            className="w-full rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition">Edit</button>
        </div>
      )}
      {showActions && item.status === 'pending' && (
        <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
          <button onClick={onReject}
            className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition">Reject</button>
          <button onClick={onVerify}
            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition">Verify</button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CashCollection() {
  const { t, i18n } = useTranslation()
  const { organization, user, userRole, canViewFinancials } = useAuth()
  const myId = user?.id
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const canVerify  = userRole === 'owner' || userRole === 'accountant'
  const canCollect = !!userRole && userRole !== 'viewer'

  const [tab, setTab]           = useState('mine')   // mine | verify | receivables
  const [loading, setLoading]   = useState(true)
  const [mine, setMine]         = useState([])
  const [queue, setQueue]       = useState([])
  const [attByRow, setAttByRow] = useState({})
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [modalOpen, setModalOpen]   = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [verifyItem, setVerifyItem] = useState(null)
  const [viewItem, setViewItem]     = useState(null)

  async function fetchData() {
    setLoading(true)
    const { data: mineData } = await supabase.from('cash_collection')
      .select('*, vendors(name), created_by_name, created_at, updated_by_name, updated_at, verified_by_name, verified_at, collected_by_name').eq('organization_id', organization.id)
      .eq('collected_by_id', myId).order('created_at', { ascending: false }).limit(200)
    const mineRows = mineData || []
    setMine(mineRows)

    let queueRows = []
    if (canVerify) {
      const { data } = await supabase.from('cash_collection')
        .select('*, vendors(name), created_by_name, created_at, updated_by_name, updated_at, verified_by_name, verified_at, collected_by_name').eq('organization_id', organization.id)
        .eq('status', 'pending').order('created_at', { ascending: true })
      queueRows = data || []
      setQueue(queueRows)
    }

    if (canViewFinancials) {
      const { data } = await supabase.from('vendor_balances').select('*')
        .eq('organization_id', organization.id).order('vendor_name')
      setBalances(data || [])
    }

    const { data: accs } = await supabase.from('accounts').select('id, name, type')
      .eq('organization_id', organization.id).eq('is_active', true).order('name')
    setAccounts(accs || [])

    const ids = [...new Set([...mineRows.map(r => r.id), ...queueRows.map(r => r.id)])]
    setAttByRow(await attachmentsByEntity('cash_collection', ids, organization.id))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // Guard — viewers (can't collect, can't view financials) have no business here
  if (!canCollect && !canViewFinancials) return <Navigate to="/dashboard" replace />

  const myInHand = mine.filter(c => c.status === 'pending').reduce((s, c) => s + Number(c.amount_paid || 0), 0)
  const myPending = mine.filter(c => c.status === 'pending').length

  async function reject(item) {
    if (!window.confirm('Reject this collection? Nothing will be posted; it stays with the collector as unverified.')) return
    const { error } = await supabase.rpc('reject_cash_collection', { p_id: item.id, p_reason: null, p_by_name: userName })
    if (error) alert(error.message); else fetchData()
  }

  const totalOutstanding = balances.reduce((s, b) => s + Math.max(0, Number(b.outstanding_balance)), 0)
  const totalCollected   = balances.reduce((s, b) => s + Number(b.total_collected), 0)
  const totalSales       = balances.reduce((s, b) => s + Number(b.total_sales), 0)

  const TABS = [
    { k: 'mine', label: 'My Collections' },
    ...(canVerify ? [{ k: 'verify', label: `To Verify${queue.length ? ` (${queue.length})` : ''}` }] : []),
    ...(canViewFinancials ? [{ k: 'receivables', label: 'Receivables' }] : []),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('cashCollection.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record collections, then verify them in to cash/bank</p>
        </div>
        {canCollect && (
          <button onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition">
            <span className="text-base leading-none">+</span> Record collection
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map(tb => (
          <button key={tb.k} onClick={() => setTab(tb.k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition border ${
              tab === tb.k ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : tab === 'mine' ? (
        <>
          <div className="rounded-2xl bg-gray-900 text-white px-6 py-5 mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cash in hand</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">{formatCurrency(myInHand)}</p>
            <p className="text-xs text-gray-300 mt-1">{myPending} pending · submit at office to get verified</p>
          </div>
          {mine.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-5xl mb-3">💳</span><p className="text-sm">No collections yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mine.map(item => (
                <CollectionCard key={item.id} item={item} files={attByRow[item.id]} canEdit
                  onView={() => setViewItem(item)} onEdit={() => setEditItem(item)} />
              ))}
            </div>
          )}
        </>
      ) : tab === 'verify' ? (
        queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="text-5xl mb-3">✅</span><p className="text-sm">Nothing to verify.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {queue.map(item => (
              <CollectionCard key={item.id} item={item} files={attByRow[item.id]} showCollector showActions
                onView={() => setViewItem(item)} onVerify={() => setVerifyItem(item)} onReject={() => reject(item)} />
            ))}
          </div>
        )
      ) : (
        // Receivables (vendor balances)
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {balances.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-5xl mb-3">📊</span><p className="text-sm">{t('cashCollection.noOutstanding')}</p>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {balances.map(v => {
                    const outstanding = Number(v.outstanding_balance)
                    return (
                      <tr key={v.vendor_id} className={outstanding > 0 ? 'bg-red-50/40' : ''}>
                        <td className="px-5 py-4 font-medium text-gray-800">{v.vendor_name}</td>
                        <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(v.total_sales)}</td>
                        <td className="px-5 py-4 text-right text-green-700 font-semibold">{formatCurrency(v.total_collected)}</td>
                        <td className="px-5 py-4 text-right">
                          {outstanding > 0
                            ? <span className="font-bold text-red-600">{formatCurrency(outstanding)}</span>
                            : <span className="text-green-600 font-semibold">{t('vendors.collected')}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                    <td className="px-5 py-3">{t('common.total')}</td>
                    <td className="px-5 py-3 text-right text-gray-800">{formatCurrency(totalSales)}</td>
                    <td className="px-5 py-3 text-right text-green-700">{formatCurrency(totalCollected)}</td>
                    <td className="px-5 py-3 text-right text-red-600">{formatCurrency(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {(modalOpen || editItem) && (
        <CollectionModal editItem={editItem}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          onSaved={() => { setModalOpen(false); setEditItem(null); fetchData() }} />
      )}
      {verifyItem && <VerifyModal item={verifyItem} accounts={accounts} onClose={() => setVerifyItem(null)} onDone={() => { setVerifyItem(null); fetchData() }} />}
      {viewItem && (
        <AttachmentViewer
          attachments={attByRow[viewItem.id] || []}
          title={formatCurrency(viewItem.amount_paid)}
          canDelete={canVerify || (viewItem.collected_by_id === myId && viewItem.status === 'pending')}
          onClose={() => setViewItem(null)}
          onDeleted={(a) => setAttByRow(prev => ({ ...prev, [viewItem.id]: (prev[viewItem.id] || []).filter(x => x.id !== a.id) }))}
          header={
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><span className="text-gray-400 text-xs block">{t('vendors.title')}</span>{viewItem.vendors?.name || '—'}</div>
              <div><span className="text-gray-400 text-xs block">Method</span><span className="capitalize">{viewItem.method || 'cash'}</span></div>
              <div><span className="text-gray-400 text-xs block">Status</span>{STATUS_LABEL[viewItem.status] || viewItem.status}</div>
              <div><span className="text-gray-400 text-xs block">{t('common.date')}</span>{formatDate(viewItem.date, i18n.language)}</div>
              <div><span className="text-gray-400 text-xs block">Collected by</span>{viewItem.collected_by_name || '—'}</div>
              {viewItem.updated_by_name && <div><span className="text-gray-400 text-xs block">Edited by</span>{viewItem.updated_by_name}</div>}
              {viewItem.verified_by_name && <div><span className="text-gray-400 text-xs block">Verified by</span>{viewItem.verified_by_name}</div>}
              {viewItem.notes && <div className="col-span-2"><span className="text-gray-400 text-xs block">{t('common.notes')}</span>{viewItem.notes}</div>}
            </div>
          }
        />
      )}
    </div>
  )
}
