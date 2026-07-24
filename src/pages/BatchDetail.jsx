import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency, roundCurrency } from '../utils/format'
import { getProcurementLots } from '../lib/stockLedger'
import StockReturnModal from '../components/StockReturnModal'
import EditDistributionModal from '../components/EditDistributionModal'
import DistributionModal from '../components/DistributionModal'
import AuditInfo from '../components/AuditInfo'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysElapsed(startDate) {
  return Math.floor((Date.now() - new Date(startDate + 'T00:00:00')) / 86400000)
}

// ─── Day status badge ──────────────────────────────────────────────────────────

function DayBadge({ elapsed, status }) {
  const { t } = useTranslation()
  if (status !== 'active') {
    return (
      <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold bg-gray-100 text-gray-500">
        {t('batches.dayCount', { day: elapsed })}
      </span>
    )
  }
  const isOverdue     = elapsed > 45
  const isApproaching = elapsed >= 40 && elapsed <= 45
  const bg    = isOverdue ? '#fef2f2' : isApproaching ? '#fffbeb' : '#f0fdf4'
  const color = isOverdue ? '#dc2626' : isApproaching ? '#d97706' : '#15803d'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-base font-extrabold"
      style={{ backgroundColor: bg, color }}>
      {isOverdue     && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />}
      {isApproaching && '⚠️ '}
      {t('batches.dayCount', { day: elapsed })}
    </span>
  )
}

// ─── Stacked bar ──────────────────────────────────────────────────────────────

function StackedBar({ segments }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {segments.map((seg, i) => (
        <div key={i} style={{
          width: ready ? `${seg.pct}%` : '0%',
          backgroundColor: seg.color,
          flexShrink: 0,
          transition: `width 600ms cubic-bezier(0.4,0,0.2,1) ${i * 60}ms`,
        }} />
      ))}
    </div>
  )
}

// ─── Give Advance Modal ───────────────────────────────────────────────────────

function GiveAdvanceModal({ farm, batch, onClose, onSaved }) {
  const { t } = useTranslation()
  const { organization, user } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    account_id:       '',
    amount:           '',
    payment_date:     today,
    payment_method:   'Cash',
    reference_number: '',
    notes:            '',
  })
  const [accounts, setAccounts] = useState([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    supabase.from('accounts').select('id, name, type').eq('is_active', true).eq('organization_id', organization?.id).order('created_at')
      .then(({ data }) => {
        const accs = data || []
        setAccounts(accs)
        const cashAcc = accs.find(a => a.type === 'cash') ?? accs[0]
        if (cashAcc) setForm(f => ({ ...f, account_id: cashAcc.id }))
      })
  }, [])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!form.account_id) { setError('Select an account'); return }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    const { data: adv, error: advErr } = await supabase.from('growing_fee_advances').insert({
      farm_id:          farm.id,
      batch_id:         batch.id,
      amount:           amt,
      payment_date:     form.payment_date,
      payment_method:   form.payment_method || null,
      reference_number: form.reference_number.trim() || null,
      account_id:       form.account_id,
      notes:            form.notes.trim() || null,
      organization_id:  organization?.id,
      created_by_id:    user?.id,
      created_by_name:  userName,
    }).select('id').single()

    if (advErr) { setError(advErr.message); setSaving(false); return }

    // Update batch total_advances
    const { data: currentBatch } = await supabase.from('batches').select('total_advances').eq('id', batch.id).eq('organization_id', organization?.id).single()
    await supabase.from('batches').update({
      total_advances: Number(currentBatch?.total_advances || 0) + amt,
    }).eq('id', batch.id)

    // Insert transaction (cash out immediately)
    const batchStartDate = new Date(batch.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    await supabase.from('transactions').insert({
      account_id:       form.account_id,
      transaction_type: 'out',
      category:         'growing_fee_advance',
      description:      `Growing fee advance — ${farm.owner_name || farm.name}, Batch ${batchStartDate}`,
      amount:           amt,
      transaction_date: form.payment_date,
      reference_type:   'growing_fee_advance',
      reference_id:     adv.id,
      organization_id:  organization?.id,
      created_by_id:    user?.id,
      created_by_name:  userName,
    })

    setSaving(false)
    onSaved()
  }

  const elapsed = Math.floor((Date.now() - new Date(batch.start_date + 'T00:00:00')) / 86400000)
  const batchLabel = `Batch ${new Date(batch.start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — Day ${elapsed}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('growingFees.advancePaymentTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm">
          <p className="font-semibold text-gray-800">{farm.name}</p>
          {farm.owner_name && <p className="text-gray-500 text-xs mt-0.5">{farm.owner_name}</p>}
          <p className="text-gray-500 text-xs mt-1">{batchLabel} · {Number(batch.chick_count).toLocaleString('en-IN')} chicks</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.payFromAccount')} *</label>
              <select required value={form.account_id} onChange={set('account_id')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">{t('growingFees.selectAccount')}</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.type === 'cash' ? '💵' : a.type === 'bank' ? '🏦' : '📱'} {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountRs')} *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.paymentDate')} *</label>
              <input required type="date" value={form.payment_date} onChange={set('payment_date')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.paymentMethod')}</label>
              <select value={form.payment_method} onChange={set('payment_method')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option>{t('suppliers.methods.cash')}</option>
                <option>{t('suppliers.methods.bankTransfer')}</option>
                <option>{t('suppliers.methods.cheque')}</option>
                <option>{t('suppliers.methods.other')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.referenceNumber')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
            <input value={form.reference_number} onChange={set('reference_number')} placeholder={t('growingFees.referenceNumberOptional')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
            <textarea rows={2} value={form.notes} onChange={set('notes')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('batches.saving') : t('growingFees.recordPayment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BatchDetail() {
  const { farmId, batchId } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { organization, user, userRole, canEdit, canDelete, canRecordOperations, canViewFinancials } = useAuth()
  const { currentStep, stepDone } = useOnboarding()
  const canManageSales = ['owner', 'manager', 'accountant'].includes(userRole)
  const SALE_STATUS_STYLE = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-green-100 text-green-700' }
  const SALE_STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed' }
  const [editingSale, setEditingSale] = useState(null)
  async function confirmSale(s) {
    const name = user?.user_metadata?.full_name || user?.email || null
    const { error } = await supabase.rpc('confirm_sale', { p_id: s.id, p_by_name: name })
    if (error) window.alert(error.message); else refresh()
  }
  async function deleteSale(s) {
    if (!window.confirm('Delete this sale? This cannot be undone.')) return
    const { error } = await supabase.from('sales').delete().eq('id', s.id)
    if (error) window.alert(error.message); else refresh()
  }

  async function deleteDistribution(d) {
    const orgId = organization?.id
    const hasReturns = Number(d.returned_quantity || 0) > 0
    const msg = hasReturns
      ? `Delete distribution of ${Number(d.quantity).toLocaleString('en-IN')} ${d.unit} of ${d.item_name}?\n\nThis distribution has returns recorded against it. All associated returns will also be deleted and stock will be fully adjusted.`
      : `Delete distribution of ${Number(d.quantity).toLocaleString('en-IN')} ${d.unit} of ${d.item_name}?\n\nStock will be restored. This cannot be undone.`
    if (!window.confirm(msg)) return

    // Fetch all stock_returns linked to this distribution
    const { data: stockReturns } = await supabase
      .from('stock_returns')
      .select('id, quantity, return_to_stock')
      .eq('distribution_id', d.id)
      .eq('organization_id', orgId)
    const returns = stockReturns || []

    // Net qty to restore = full distributed qty minus what returns already put back
    const returnedToStockQty = returns
      .filter(r => r.return_to_stock)
      .reduce((s, r) => s + Number(r.quantity || 0), 0)
    const netRestore = Number(d.quantity) - returnedToStockQty

    // Delete ledger entries for each return
    for (const sr of returns) {
      await supabase.from('stock_ledger')
        .delete().eq('reference_type', 'stock_return').eq('reference_id', sr.id).eq('organization_id', orgId)
    }

    // Delete farm_expense_returns, stock_returns, and the distribution's ledger entry
    await supabase.from('farm_expense_returns').delete().eq('distribution_id', d.id).eq('organization_id', orgId)
    await supabase.from('stock_returns').delete().eq('distribution_id', d.id).eq('organization_id', orgId)
    await supabase.from('stock_ledger').delete().eq('reference_type', 'distribution').eq('reference_id', d.id).eq('organization_id', orgId)
    await supabase.from('farm_expenses').delete().eq('distribution_id', d.id).eq('organization_id', orgId)

    // Restore net quantity back to warehouse stock
    if (netRestore > 0) {
      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity').ilike('item_name', d.item_name).eq('organization_id', orgId).maybeSingle()
      if (stockRow) {
        await supabase.from('stock')
          .update({ quantity: Number(stockRow.quantity) + netRestore })
          .eq('id', stockRow.id).eq('organization_id', orgId)
      }
      // Subtract net qty from farm_stock
      const { data: fsRow } = await supabase.from('farm_stock')
        .select('id, quantity_on_hand').eq('organization_id', orgId).eq('farm_id', d.farm_id).eq('item_name', d.item_name).maybeSingle()
      if (fsRow) {
        await supabase.from('farm_stock')
          .update({ quantity_on_hand: Math.max(0, Number(fsRow.quantity_on_hand) - netRestore) })
          .eq('id', fsRow.id).eq('organization_id', orgId)
      }
    }

    const { error } = await supabase.from('distributions').delete().eq('id', d.id).eq('organization_id', orgId)
    if (error) { window.alert(error.message); return }
    refresh()
  }
  function openEditSale(s) {
    setEditingSale(s)
    setSaleForm({ vendor_id: s.vendor_id, chicken_count: String(s.chicken_count ?? ''), kg_sold: String(s.kg_sold ?? ''), price_per_kg: String(s.price_per_kg ?? ''), final_amount: String(s.final_amount ?? ''), date: s.date, notes: s.notes ?? '' })
    setActionError('')
    setSaleModal(true)
  }
  function closeSaleModal() {
    setSaleModal(false)
    setEditingSale(null)
    setSaleForm({ vendor_id: vendors[0]?.id || '', chicken_count: '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  }

  const [farm,         setFarm]         = useState(null)
  const [batch,        setBatch]        = useState(null)
  const [distributions,setDistributions]= useState([])
  const [sales,        setSales]        = useState([])
  const [expenses,     setExpenses]     = useState([])
  const [chickPurchases, setChickPurchases] = useState([])
  const [vendors,      setVendors]      = useState([])
  const [loading,      setLoading]      = useState(true)

  // ── Action state ──
  const [advances,       setAdvances]       = useState([])

  // ── Action state ──
  const [saving,         setSaving]         = useState(false)
  const [actionError,    setActionError]    = useState('')
  const [editModal,        setEditModal]        = useState(false)
  const [editForm,         setEditForm]         = useState({ chick_count: '', start_date: '' })
  const [editChickLots,    setEditChickLots]    = useState([])
  const [editLotAllocs,    setEditLotAllocs]    = useState({})
  const [editLotsLoading,  setEditLotsLoading]  = useState(false)
  const [mortalityModal, setMortalityModal] = useState(false)
  const [mortalityVal,   setMortalityVal]   = useState('')
  const [saleModal,      setSaleModal]      = useState(false)
  const [distModal,      setDistModal]      = useState(false)
  const [saleForm,       setSaleForm]       = useState({ vendor_id: '', chicken_count: '', kg_sold: '', price_per_kg: '', final_amount: '', date: new Date().toISOString().slice(0, 10) })
  const [confirmModal,   setConfirmModal]   = useState(null) // { label, newStatus }
  const [closeBatchLoading,setCloseBatchLoading]= useState(false)
  const [advanceModal,   setAdvanceModal]   = useState(false)
  const [returnModal,    setReturnModal]    = useState(null)
  const [editingDist,    setEditingDist]    = useState(null)
  const [postCloseModal, setPostCloseModal] = useState(false) // prompt after batch close
  const [expenseReturns, setExpenseReturns] = useState([])
  const [showEditFeeModal, setShowEditFeeModal] = useState(false)
  const [editFeeAmount,    setEditFeeAmount]    = useState('')
  const [editFeeSaving,    setEditFeeSaving]    = useState(false)
  const [pendingFarmAdvs,  setPendingFarmAdvs]  = useState(null) // { advances: [], recalcData: {} }
  const [expandedPLRows,   setExpandedPLRows]   = useState(new Set())


  async function load() {
    const [
      { data: farmData },
      { data: batchData },
      { data: distData },
      { data: salesData },
      { data: expData },
      { data: chickPurchaseData },
      { data: vendorData },
    ] = await Promise.all([
      supabase.from('farms').select('id, name, owner_name, owner_phone').eq('id', farmId).eq('organization_id', organization?.id).single(),
      supabase.from('batches').select('*').eq('id', batchId).eq('organization_id', organization?.id).single(),
      supabase.from('distributions').select('*, procurement:procurement_id(id, invoice_number, date), created_by_name, created_at, updated_by_name, updated_at').eq('batch_id', batchId).eq('organization_id', organization?.id).order('date', { ascending: true }),
      supabase.from('sales').select('*, vendors(name), created_by_name, created_at, updated_by_name, updated_at, confirmed_by_name, confirmed_at').eq('batch_id', batchId).eq('organization_id', organization?.id).order('date', { ascending: true }),
      supabase.from('farm_expenses').select('*').eq('batch_id', batchId).eq('organization_id', organization?.id),
      supabase.from('batch_chick_purchases').select('id, quantity, price_per_chick, total_cost, source, notes, procurement_id, procurement:procurement_id(id, invoice_number, date)').eq('batch_id', batchId).eq('organization_id', organization?.id).order('created_at'),
      supabase.from('vendors').select('id, name').eq('organization_id', organization?.id).order('name'),
    ])
    setFarm(farmData)

    // Fetch growing fee ledger separately
    let ledgerData = null
    if (batchData?.growing_fee_id) {
      const { data } = await supabase
        .from('growing_fee_ledger')
        .select('status, amount_paid, balance_due, fcr_tier_description')
        .eq('id', batchData.growing_fee_id)
        .single()
      ledgerData = data
    }
    setBatch(batchData ? { ...batchData, growing_fee_ledger: ledgerData } : batchData)
    setDistributions(distData || [])
    setSales(salesData || [])
    setExpenses(expData || [])
    setChickPurchases(chickPurchaseData || [])
    setVendors(vendorData || [])

    // Fetch advances (safe — graceful if table doesn't exist yet)
    const { data: advData } = await supabase
      .from('growing_fee_advances')
      .select('id, amount, payment_date, payment_method')
      .eq('batch_id', batchId)
      .eq('organization_id', organization?.id)
      .order('payment_date')
    setAdvances(advData || [])

    // Fetch farm_expense_returns for net cost display
    const { data: ferData } = await supabase
      .from('farm_expense_returns')
      .select('distribution_id, item_type, total_cost, cost_per_unit')
      .eq('batch_id', batchId)
      .eq('organization_id', organization?.id)
    setExpenseReturns(ferData || [])

    setLoading(false)
  }

  async function refresh() {
    const [{ data: batchData }, { data: distData }, { data: salesData }, { data: expData }] = await Promise.all([
      supabase.from('batches').select('*').eq('id', batchId).eq('organization_id', organization?.id).single(),
      supabase.from('distributions').select('*, procurement:procurement_id(id, invoice_number, date), created_by_name, created_at, updated_by_name, updated_at').eq('batch_id', batchId).eq('organization_id', organization?.id).order('date', { ascending: true }),
      supabase.from('sales').select('*, vendors(name), created_by_name, created_at, updated_by_name, updated_at, confirmed_by_name, confirmed_at').eq('batch_id', batchId).eq('organization_id', organization?.id).order('date', { ascending: true }),
      supabase.from('farm_expenses').select('*').eq('batch_id', batchId).eq('organization_id', organization?.id),
    ])
    // Fetch growing fee ledger separately (safe — won't break if migration not run yet)
    let ledgerData = null
    if (batchData?.growing_fee_id) {
      const { data } = await supabase
        .from('growing_fee_ledger')
        .select('status, amount_paid, balance_due, fcr_tier_description')
        .eq('id', batchData.growing_fee_id)
        .single()
      ledgerData = data
    }
    // Refresh advances too
    const { data: advData } = await supabase
      .from('growing_fee_advances')
      .select('id, amount, payment_date, payment_method')
      .eq('batch_id', batchId)
      .eq('organization_id', organization?.id)
      .order('payment_date')
    setAdvances(advData || [])

    // Refresh expense returns too
    const { data: ferData } = await supabase
      .from('farm_expense_returns')
      .select('distribution_id, item_type, total_cost, cost_per_unit')
      .eq('batch_id', batchId)
      .eq('organization_id', organization?.id)
    setExpenseReturns(ferData || [])

    setBatch(batchData ? { ...batchData, growing_fee_ledger: ledgerData } : null)
    setDistributions(distData || [])
    setSales(salesData || [])
    setExpenses(expData || [])
  }

  useEffect(() => { load() }, [farmId, batchId])

  async function handleEditBatch(e) {
    e.preventDefault()
    setSaving(true)
    setActionError('')

    const newCount = Number(editForm.chick_count)
    const oldCount = Number(batch.chick_count)
    const qtyDiff  = newCount - oldCount
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    // Build new per-lot allocation rows
    let allocRows
    if (editChickLots.length > 1) {
      allocRows = Object.entries(editLotAllocs)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([procId, qty]) => {
          const lot = editChickLots.find(l => l.id === procId)
          return { procId, qty: Number(qty), cpu: lot?.costPerUnit ?? 0 }
        })
      const allocTotal = allocRows.reduce((s, r) => s + r.qty, 0)
      if (Math.abs(allocTotal - newCount) > 0.5) {
        setActionError(`Lot allocation (${allocTotal.toLocaleString('en-IN')}) must equal chick count (${newCount.toLocaleString('en-IN')})`)
        setSaving(false)
        return
      }
    } else {
      const firstPurchase = chickPurchases[0]
      const lot = editChickLots[0]
      allocRows = [{ procId: firstPurchase?.procurement_id || lot?.id || null, qty: newCount, cpu: lot?.costPerUnit ?? Number(firstPurchase?.price_per_chick || 0) }]
    }

    // 1. Update batch row
    const { error } = await supabase.from('batches').update({
      chick_count:     newCount,
      start_date:      editForm.start_date,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('id', batchId)
    if (error) { setActionError(error.message); setSaving(false); return }

    // 2. Replace batch_chick_purchases
    await supabase.from('batch_chick_purchases')
      .delete().eq('batch_id', batchId).eq('organization_id', organization?.id)
    for (const { procId, qty, cpu } of allocRows) {
      await supabase.from('batch_chick_purchases').insert({
        organization_id: organization?.id,
        batch_id:        batchId,
        quantity:        qty,
        price_per_chick: roundCurrency(cpu),
        total_cost:      roundCurrency(qty * cpu),
        source:          'stock',
        procurement_id:  procId,
      })
    }

    // 3. If total count changed, sync stock_ledger and stock
    if (qtyDiff !== 0) {
      await supabase.from('stock_ledger')
        .update({ quantity: newCount })
        .eq('reference_type', 'batch')
        .eq('reference_id', batchId)
        .eq('organization_id', organization?.id)

      const { data: stockRow } = await supabase.from('stock')
        .select('id, quantity')
        .ilike('item_name', 'chicks')
        .eq('organization_id', organization?.id)
        .maybeSingle()
      if (stockRow) {
        await supabase.from('stock').update({
          quantity: Math.max(0, Number(stockRow.quantity) - qtyDiff),
        }).eq('id', stockRow.id)
      }
    }

    setSaving(false)
    setEditModal(false)
    refresh()
  }

  async function handleMortality(e) {
    e.preventDefault()
    const n = Number(mortalityVal)
    if (isNaN(n) || n < 0) { setActionError('Enter a valid number (0 or more)'); return }
    setSaving(true)
    const { error } = await supabase.from('batches').update({ mortality_count: n }).eq('id', batchId)
    setSaving(false)
    if (error) { setActionError(error.message); return }
    setMortalityModal(false)
    refresh()
  }

  function promptMarkStatus(newStatus) {
    if (newStatus !== 'active' && sales.length === 0) {
      setActionError(`Cannot mark as ${newStatus} — record at least one sale first.`)
      return
    }
    if (newStatus === 'sold') {
      handleMarkAsSold()
      return
    }
    const label = newStatus === 'active' ? 'Reactivate' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)
    setActionError('')
    setConfirmModal({ label, newStatus })
  }

  // ── Growing fee calculation (shared by handleMarkAsSold and recalcGrowingFee) ──
  async function calculateGrowingFee({ fcr, totalSaleKg, forceRecalc }) {
    if (fcr == null) { setActionError('Growing fee not calculated: FCR could not be determined (no confirmed sales or no feed kg data).'); return }
    if (!forceRecalc && batch.growing_fee_id) return  // already exists, skip unless forced

    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    const { data: feeConfigs } = await supabase
      .from('growing_fee_config')
      .select('*')
      .eq('is_active', true)
      .eq('organization_id', organization?.id)
      .order('fcr_from', { ascending: true })

    if (!feeConfigs?.length) {
      setActionError('No active growing fee configuration found. Set up fee tiers in Growing Fee Settings first.')
      return
    }

    const tier = feeConfigs.find(c =>
      fcr >= Number(c.fcr_from) && (c.fcr_to == null || fcr < Number(c.fcr_to))
    )

    if (!tier) {
      setActionError(`No growing fee tier matched FCR ${fcr.toFixed(2)}. Check your fee configuration ranges.`)
      return
    }

    const totalFee = roundCurrency(Number(tier.rate_per_kg) * totalSaleKg)
    const tierDesc = `${tier.description || ''} (FCR ${Number(tier.fcr_from).toFixed(1)}–${tier.fcr_to != null ? Number(tier.fcr_to).toFixed(1) : '+'})`

    const { data: farmData } = await supabase
      .from('farms').select('owner_name').eq('id', farmId).eq('organization_id', organization?.id).single()

    const { data: advRows } = await supabase
      .from('growing_fee_advances').select('amount').eq('batch_id', batchId).eq('organization_id', organization?.id)
    const totalAdvances = (advRows || []).reduce((s, r) => s + Number(r.amount), 0)

    const rawBalance   = roundCurrency(totalFee - totalAdvances)
    const balanceDue   = roundCurrency(Math.max(0, rawBalance))
    const overpaid     = rawBalance < 0 ? roundCurrency(Math.abs(rawBalance)) : 0
    const ledgerStatus = balanceDue <= 0 ? (overpaid > 0 ? 'overpaid' : 'paid') : 'pending'

    // If recalculating, delete the old ledger row first
    if (forceRecalc && batch.growing_fee_id) {
      await supabase.from('growing_fee_ledger').delete().eq('id', batch.growing_fee_id)
    }

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('growing_fee_ledger')
      .insert({
        farm_id: farmId, batch_id: batchId, owner_name: farmData?.owner_name || null,
        fcr, fcr_tier_description: tierDesc, rate_per_kg: Number(tier.rate_per_kg),
        total_sale_kg: totalSaleKg, total_fee: totalFee, total_advances: totalAdvances,
        overpaid_amount: overpaid, status: ledgerStatus, amount_paid: 0,
        balance_due: balanceDue, organization_id: organization?.id,
      })
      .select('id').single()

    if (ledgerErr) { setActionError('Growing fee calculation failed: ' + ledgerErr.message); return }

    if (ledgerRow?.id) {
      await supabase.from('batches').update({
        growing_fee_id:     ledgerRow.id,
        growing_fee_per_kg: Number(tier.rate_per_kg),
        growing_fee_total:  totalFee,
        updated_by_id:      user?.id,
        updated_by_name:    userName,
        updated_at:         new Date().toISOString(),
      }).eq('id', batchId)
    }
  }

  async function _computeFCRData() {
    const { data: feedDists } = await supabase
      .from('distributions')
      .select('id, item_name, quantity, returned_quantity, unit')
      .eq('batch_id', batchId).eq('organization_id', organization?.id).eq('type', 'feed')
    const itemNames = [...new Set((feedDists || []).map(d => d.item_name).filter(Boolean))]
    const kgMap = {}
    if (itemNames.length) {
      const { data: itemRows } = await supabase.from('items').select('name, kg_per_unit').in('name', itemNames).eq('organization_id', organization?.id)
      for (const item of (itemRows || [])) { if (item.kg_per_unit != null) kgMap[item.name] = item.kg_per_unit }
    }
    const totalSaleKg = sales.filter(r => r.status === 'confirmed').reduce((s, r) => s + Number(r.kg_sold || 0), 0)
    const totalFeedKg = (feedDists || []).reduce((s, d) => {
      const kpu    = kgMap[d.item_name] ?? null
      const netQty = Math.max(0, Number(d.quantity) - Number(d.returned_quantity || 0))
      return s + (kpu != null ? netQty * Number(kpu) : 0)
    }, 0)
    const userName  = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const fcr       = totalSaleKg > 0 && totalFeedKg > 0 ? +(totalFeedKg / totalSaleKg).toFixed(2) : null
    const fcrRating = fcr == null ? null : fcr <= 1.8 ? 'Excellent' : fcr <= 2.1 ? 'Good' : fcr <= 2.5 ? 'Average' : 'Poor'
    return { feedDists, totalSaleKg, totalFeedKg, userName, fcr, fcrRating }
  }

  async function _doRecalc({ totalSaleKg, totalFeedKg, userName, fcr, fcrRating, farmLevelAdvsToApply }) {
    // Link any farm-level advances to this batch before recalculating (so calculateGrowingFee picks them up)
    if (farmLevelAdvsToApply?.length) {
      const totalFarmAdv = farmLevelAdvsToApply.reduce((s, a) => s + Number(a.amount), 0)
      await supabase.from('growing_fee_advances').update({ batch_id: batchId }).in('id', farmLevelAdvsToApply.map(a => a.id))
      const { data: cb } = await supabase.from('batches').select('total_advances').eq('id', batchId).eq('organization_id', organization?.id).single()
      await supabase.from('batches').update({ total_advances: Number(cb?.total_advances || 0) + totalFarmAdv }).eq('id', batchId)
    }
    await supabase.from('batches').update({
      total_feed_kg: totalFeedKg || null, total_sale_kg: totalSaleKg || null,
      fcr, fcr_rating: fcrRating, updated_by_id: user?.id, updated_by_name: userName, updated_at: new Date().toISOString(),
    }).eq('id', batchId)
    await calculateGrowingFee({ fcr, totalSaleKg, forceRecalc: true })
  }

  async function recalcGrowingFee() {
    setActionError('')
    setSaving(true)
    const fcrData = await _computeFCRData()

    // Check for unlinked farm-level advances
    const { data: farmLevelAdvs } = await supabase
      .from('growing_fee_advances')
      .select('id, amount, payment_date')
      .is('batch_id', null)
      .eq('farm_id', farmId)
      .eq('organization_id', organization?.id)

    if (farmLevelAdvs?.length) {
      // Pause and ask the user
      setPendingFarmAdvs({ advances: farmLevelAdvs, recalcData: fcrData })
      setSaving(false)
      return
    }

    await _doRecalc({ ...fcrData, farmLevelAdvsToApply: [] })
    setSaving(false)
    refresh()
  }

  async function handleFarmAdvDecision(apply) {
    if (!pendingFarmAdvs) return
    setSaving(true)
    const { advances, recalcData } = pendingFarmAdvs
    setPendingFarmAdvs(null)
    await _doRecalc({ ...recalcData, farmLevelAdvsToApply: apply ? advances : [] })
    setSaving(false)
    refresh()
  }

  async function handleEditFeeSave() {
    const newTotal = parseFloat(editFeeAmount)
    if (isNaN(newTotal) || newTotal < 0) return
    setEditFeeSaving(true)
    try {
      const ledger = batch.growing_fee_ledger
      const totalAdv = Number(ledger?.total_advances ?? advances.reduce((s, a) => s + Number(a.amount), 0))
      const postPaid = Number(ledger?.amount_paid || 0)
      const totalPaid = totalAdv + postPaid
      const newBalance  = Math.max(0, newTotal - totalPaid)
      const newOverpaid = Math.max(0, totalPaid - newTotal)
      const newStatus   = newBalance === 0 ? (newOverpaid > 0 ? 'overpaid' : 'paid') : totalPaid > 0 ? 'partial' : 'pending'

      const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
      const { error: bErr } = await supabase.from('batches').update({
        growing_fee_total: newTotal,
        updated_by_id: user?.id, updated_by_name: userName, updated_at: new Date().toISOString(),
      }).eq('id', batchId)
      if (bErr) throw bErr

      if (batch.growing_fee_id) {
        const { error: lErr } = await supabase.from('growing_fee_ledger').update({
          total_fee: newTotal,
          balance_due: newBalance,
          overpaid_amount: newOverpaid,
          status: newStatus,
        }).eq('id', batch.growing_fee_id)
        if (lErr) throw lErr
      }

      setShowEditFeeModal(false)
      refresh()
    } catch (err) {
      setActionError(err.message || 'Failed to save growing fee')
    } finally {
      setEditFeeSaving(false)
    }
  }

  async function handleMarkAsSold() {
    setActionError('')
    setCloseBatchLoading(true)

    // Step 1: Mark as sold
    const isAlreadySold = batch.status === 'sold' || batch.status === 'closed'
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    if (!isAlreadySold) {
      const { error } = await supabase.from('batches')
        .update({ status: 'sold', sold_at: new Date().toISOString().slice(0, 10), updated_by_id: user?.id, updated_by_name: userName, updated_at: new Date().toISOString() })
        .eq('id', batchId)
      if (error) {
        setActionError(error.message)
        setCloseBatchLoading(false)
        return
      }
    }

    // Step 2: Calculate FCR
    const { data: feedDists } = await supabase
      .from('distributions')
      .select('id, item_name, quantity, returned_quantity, unit')
      .eq('batch_id', batchId)
      .eq('organization_id', organization?.id)
      .eq('type', 'feed')

    const itemNames = [...new Set((feedDists || []).map(d => d.item_name).filter(Boolean))]
    const kgMap = {}
    if (itemNames.length > 0) {
      const { data: itemRows } = await supabase
        .from('items')
        .select('name, kg_per_unit')
        .in('name', itemNames)
        .eq('organization_id', organization?.id)
      for (const item of (itemRows || [])) {
        if (item.kg_per_unit != null) kgMap[item.name] = item.kg_per_unit
      }
    }

    const totalSaleKg = sales.filter(r => r.status === 'confirmed').reduce((s, r) => s + Number(r.kg_sold || 0), 0)
    const totalFeedKg = (feedDists || []).reduce((s, d) => {
      const kpu    = kgMap[d.item_name] ?? null
      const netQty = Math.max(0, Number(d.quantity) - Number(d.returned_quantity || 0))
      return s + (kpu != null ? netQty * Number(kpu) : 0)
    }, 0)
    const fcr       = totalSaleKg > 0 && totalFeedKg > 0 ? +(totalFeedKg / totalSaleKg).toFixed(2) : null
    const fcrRating = fcr == null ? null : fcr <= 1.8 ? 'Excellent' : fcr <= 2.1 ? 'Good' : fcr <= 2.5 ? 'Average' : 'Poor'

    await supabase.from('batches').update({
      total_feed_kg:   totalFeedKg || null,
      total_sale_kg:   totalSaleKg || null,
      fcr,
      fcr_rating:      fcrRating,
      updated_by_id:   user?.id,
      updated_by_name: userName,
      updated_at:      new Date().toISOString(),
    }).eq('id', batchId)

    // Step 3: Calculate Growing Fee
    await calculateGrowingFee({ fcr, totalSaleKg, forceRecalc: false })

    setCloseBatchLoading(false)
    refresh()
    // Prompt user to return any leftover stock
    setPostCloseModal(true)
  }

  async function handleMarkStatus() {
    if (!confirmModal) return
    setSaving(true)
    const today    = new Date().toISOString().slice(0, 10)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    const update   = { status: confirmModal.newStatus, updated_by_id: user?.id, updated_by_name: userName, updated_at: new Date().toISOString() }
    if (confirmModal.newStatus === 'closed') update.closed_at = today
    const { error } = await supabase.from('batches').update(update).eq('id', batchId)
    setSaving(false)
    setConfirmModal(null)
    if (error) { setActionError(error.message); return }
    refresh()
  }

  async function handleSale(e) {
    e.preventDefault()
    const count = parseInt(saleForm.chicken_count)
    if (!count || count <= 0) { setActionError('Enter number of chickens'); return }
    const live      = Math.max(0, Number(batch.chick_count || 0) - Number(batch.mortality_count || 0))
    const soldSoFar = sales
      .filter(r => r.status !== 'rejected' && (!editingSale || r.id !== editingSale.id))
      .reduce((s, r) => s + Number(r.chicken_count || 0), 0)
    const available = Math.max(0, live - soldSoFar)
    if (count > available) {
      setActionError(`Only ${available.toLocaleString('en-IN')} birds available (${live.toLocaleString('en-IN')} live − ${soldSoFar.toLocaleString('en-IN')} already sold)`)
      return
    }
    const kg    = parseFloat(saleForm.kg_sold)
    const price = parseFloat(saleForm.price_per_kg)
    const autoAmt  = kg * price
    const finalAmt = parseFloat(saleForm.final_amount)
    const overrideAmt = editingSale && !isNaN(finalAmt) && Math.abs(finalAmt - autoAmt) > 0.01
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
    setSaving(true)
    let error
    if (editingSale) {
      const { error: e } = await supabase.from('sales').update({
        vendor_id:       saleForm.vendor_id,
        chicken_count:   count,
        kg_sold:         kg,
        price_per_kg:    price,
        final_amount:    overrideAmt ? finalAmt : null,
        date:            saleForm.date,
        notes:           saleForm.notes?.trim() || null,
        updated_by_id:   user?.id,
        updated_by_name: userName,
      }).eq('id', editingSale.id)
      error = e
    } else {
      const { error: e } = await supabase.from('sales').insert({
        batch_id:        batchId,
        vendor_id:       saleForm.vendor_id,
        chicken_count:   count,
        kg_sold:         kg,
        price_per_kg:    price,
        date:            saleForm.date,
        notes:           saleForm.notes?.trim() || null,
        status:          'pending',
        organization_id: organization?.id,
        created_by_id:   user?.id,
        created_by_name: userName,
      })
      error = e
    }
    setSaving(false)
    if (error) { setActionError(error.message); return }
    closeSaleModal()
    refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!batch || !farm) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-5xl mb-3">🐔</p>
        <p className="font-medium text-gray-600">{t('batches.batchNotFound')}</p>
        <button onClick={() => navigate(-1)} className="text-amber-600 hover:underline text-sm mt-3 inline-block">← {t('common.back')}</button>
      </div>
    )
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const elapsed       = daysElapsed(batch.start_date)
  const daysToHarvest = 45 - elapsed
  const isActive      = batch.status === 'active'
  const isOverdue     = isActive && elapsed > 45
  const isApproaching = isActive && elapsed >= 40 && elapsed <= 45
  const alive         = Number(batch.chick_count || 0) - Number(batch.mortality_count || 0)

  // Financial
  const revenue   = sales.filter(r => r.status === 'confirmed').reduce((s, r) => s + Number((r.final_amount ?? r.total_amount) || 0), 0)

  // Return credits keyed by distribution_id for per-row net display
  const returnCostByDist = {}
  for (const fer of expenseReturns) {
    if (fer.distribution_id) {
      returnCostByDist[fer.distribution_id] = (returnCostByDist[fer.distribution_id] || 0) + Number(fer.total_cost || 0)
    }
  }

  const feedReturnCredit = expenseReturns.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const medReturnCredit  = expenseReturns.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost || 0), 0)
  const feedCost  = roundCurrency(expenses.filter(e => e.item_type === 'feed').reduce((s, e) => s + Number(e.total_cost || 0), 0) - feedReturnCredit)
  const medCost   = roundCurrency(expenses.filter(e => e.item_type === 'medicine').reduce((s, e) => s + Number(e.total_cost || 0), 0) - medReturnCredit)

  const feedAncillaryCost = roundCurrency(expenses.filter(e => e.item_type === 'feed').reduce((s, e) => s + Number(e.extra_total_cost || 0), 0))
  const medAncillaryCost  = roundCurrency(expenses.filter(e => e.item_type === 'medicine').reduce((s, e) => s + Number(e.extra_total_cost || 0), 0))

  const chickCost = roundCurrency(chickPurchases.reduce((s, p) => s + Number(p.total_cost || 0), 0))

  const growingFee    = (!isActive && batch.growing_fee_total != null) ? Number(batch.growing_fee_total) : 0
  const totalExpenses = chickCost + feedCost + medCost + growingFee + feedAncillaryCost + medAncillaryCost
  const profit        = revenue - totalExpenses
  const margin        = revenue > 0 ? (profit / revenue) * 100 : 0

  // Feed & medicine summaries from distributions
  const feedBags = distributions.filter(d => d.type === 'feed').reduce((s, d) => s + Number(d.quantity || 0), 0)
  const medQty   = distributions.filter(d => d.type === 'medicine').reduce((s, d) => s + Number(d.quantity || 0), 0)

  // Timeline events (sorted oldest → newest)
  const timelineEvents = [
    { date: batch.start_date, icon: '🐣', label: `Batch started — ${Number(batch.chick_count).toLocaleString('en-IN')} chicks`, color: '#fef9c3', border: '#fde047' },
    ...distributions.map(d => ({
      date:   d.date,
      icon:   d.type === 'feed' ? '🌾' : '💊',
      label:  `${d.item_name} — ${Number(d.quantity).toLocaleString('en-IN')} ${d.unit}`,
      color:  '#dbeafe',
      border: '#93c5fd',
    })),
    ...sales.map(s => ({
      date:   s.date,
      icon:   '💰',
      label:  `Sale to ${s.vendors?.name ?? '—'} — ${formatCurrency(s.final_amount ?? s.total_amount)}`,
      color:  '#dcfce7',
      border: '#86efac',
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <>
    <div className="space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/farms" className="hover:text-amber-600 transition">{t('nav.farms')}</Link>
        <span>/</span>
        <Link to={`/farms/${farmId}`} className="hover:text-amber-600 transition">{farm.name}</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{t('batches.title')} {fmtDate(batch.start_date)}</span>
      </div>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-2xl border shadow-sm p-6">
        {/* Overdue / approaching banner */}
        {isOverdue && (
          <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2"
            style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            <span className="text-sm font-bold text-red-700">{t('batches.overdueByDays', { days: Math.abs(daysToHarvest) })}</span>
          </div>
        )}
        {isApproaching && (
          <div className="mb-4 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#fffbeb', borderLeft: '4px solid #d97706' }}>
            <span className="text-sm font-bold text-amber-700">
              {daysToHarvest !== 1
                ? t('batches.approachingHarvestDaysPlural', { days: daysToHarvest })
                : t('batches.approachingHarvestDays', { days: daysToHarvest })}
            </span>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p style={{ color: 'var(--text-muted)' }} className="text-sm font-medium mb-1">{farm.name}</p>
            <h1 style={{ color: 'var(--text)' }} className="text-2xl font-extrabold">
              {t('batches.title')} — {fmtDate(batch.start_date)}
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <DayBadge elapsed={elapsed} status={batch.status} />
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold
                ${batch.status === 'active' ? 'bg-green-100 text-green-700' :
                  batch.status === 'sold'   ? 'bg-blue-100 text-blue-700'   : 'bg-gray-100 text-gray-600'}`}>
                {t(`batches.status.${batch.status}`)}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/farms/${farmId}`)}
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-stone-50 transition"
          >
            {t('batches.backToFarm')}
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          {isActive ? (
            <>
              {canEdit && (
                <button
                  onClick={async () => {
                    setEditForm({ chick_count: String(batch.chick_count), start_date: batch.start_date })
                    setActionError('')
                    setEditChickLots([])
                    setEditLotAllocs({})
                    setEditLotsLoading(true)
                    setEditModal(true)
                    const lots = await getProcurementLots({ itemName: 'Chicks', organizationId: organization?.id })
                    const currentAllocMap = {}
                    for (const p of chickPurchases) {
                      if (p.procurement_id) currentAllocMap[p.procurement_id] = Number(p.quantity)
                    }
                    const editLots = lots
                      .map(l => ({ ...l, editAvail: l.remaining + (currentAllocMap[l.id] || 0) }))
                      .filter(l => l.editAvail > 0 || currentAllocMap[l.id] > 0)
                    setEditChickLots(editLots)
                    setEditLotAllocs(currentAllocMap)
                    setEditLotsLoading(false)
                  }}
                  style={{ borderColor: '#d1d5db', color: '#374151' }}
                  className="rounded-lg border bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold transition"
                >
                  ✏️ {t('batches.editBatch')}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => { setMortalityVal(String(batch.mortality_count || 0)); setActionError(''); setMortalityModal(true) }}
                  style={{ borderColor: '#fecaca', color: '#dc2626', backgroundColor: '#fef2f2' }}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:opacity-80 transition"
                >
                  💀 {t('batches.setMortality')}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => promptMarkStatus('sold')}
                  disabled={saving || closeBatchLoading}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  {closeBatchLoading ? t('batches.saving') : `✅ ${t('batches.markAsSold')}`}
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => promptMarkStatus('closed')}
                  disabled={saving}
                  className="rounded-lg bg-gray-500 hover:bg-gray-600 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  🔒 {t('batches.closeBatch')}
                </button>
              )}
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  onClick={() => promptMarkStatus('active')}
                  disabled={saving}
                  className="rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  ♻️ {t('batches.reactivateBatch')}
                </button>
              )}
            </>
          )}
        </div>
        {actionError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
        )}
      </div>

      {/* ── Overview cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t('batches.chickCount'),   value: Number(batch.chick_count).toLocaleString('en-IN'),   bg: '#f0fdf4', color: '#15803d' },
          { label: t('batches.alive'),        value: alive.toLocaleString('en-IN'),                       bg: '#f0fdf4', color: '#15803d' },
          { label: t('batches.daysElapsed'),  value: t('batches.dayCount', { day: elapsed }),             bg: isOverdue ? '#fef2f2' : isApproaching ? '#fffbeb' : 'var(--surface-2)', color: isOverdue ? '#dc2626' : isApproaching ? '#d97706' : 'var(--text)' },
          { label: isActive ? t('batches.toHarvest') : t('batches.totalDays'), value: isActive ? (daysToHarvest < 0 ? t('batches.daysOverdue', { days: Math.abs(daysToHarvest) }) : `${daysToHarvest}d`) : `${elapsed}d`, bg: 'var(--surface-2)', color: 'var(--text-muted)' },
          { label: t('batches.mortality'),    value: Number(batch.mortality_count || 0).toLocaleString('en-IN'), bg: '#fef2f2', color: '#dc2626' },
          { label: t('batches.distributions'), value: distributions.length,                               bg: 'var(--surface-2)', color: 'var(--text-muted)' },
        ].map(card => (
          <div key={card.label}
            style={{ backgroundColor: card.bg, borderColor: 'var(--border)' }}
            className="rounded-xl border p-4 text-center">
            <p style={{ color: card.color }} className="text-2xl font-extrabold">{card.value}</p>
            <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1.5 font-medium">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── Financial summary ─────────────────────────────────────────── */}
      {canViewFinancials && (
        <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
          <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold mb-4">{t('batches.financialSummary')}</h3>

          <div style={{ height: 20, backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
            {revenue > 0 ? (
              <StackedBar segments={[
                { pct: Math.min((chickCost  / revenue) * 100, 100), color: '#fca5a5' },
                { pct: Math.min((feedCost   / revenue) * 100, 100), color: '#fdba74' },
                { pct: Math.min((medCost    / revenue) * 100, 100), color: '#fde047' },
                ...(growingFee > 0 ? [{ pct: Math.min((growingFee / revenue) * 100, 100), color: '#c4b5fd' }] : []),
                ...(profit > 0 ? [{ pct: Math.min((profit / revenue) * 100, 100), color: '#15803d' }] : []),
              ]} />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {[
              { color: '#fca5a5', label: t('batches.chickCost') },
              { color: '#fdba74', label: t('batches.feedCost') },
              { color: '#fde047', label: t('batches.medicineCost') },
              ...(growingFee > 0 ? [{ color: '#c4b5fd', label: t('growingFees.title') }] : []),
              ...(profit > 0 ? [{ color: '#15803d', label: t('batches.profit') }] : []),
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>

          {(() => {
            const feedExpenses   = expenses.filter(e => e.item_type === 'feed')
            const medExpenses    = expenses.filter(e => e.item_type === 'medicine')
            const feedAncExp     = expenses.filter(e => e.item_type === 'feed'     && Number(e.extra_total_cost) > 0)
            const medAncExp      = expenses.filter(e => e.item_type === 'medicine' && Number(e.extra_total_cost) > 0)

            const rows = [
              { label: t('batches.revenue'),       value: formatCurrency(revenue),                                     color: '#15803d', bold: false },
              { label: t('batches.chickCost'),     value: formatCurrency(chickCost),                                   color: '#dc2626', bold: false, breakdown: chickPurchases,  breakdownType: 'chick' },
              { label: t('batches.feedCost'),      value: formatCurrency(feedCost),                                    color: '#dc2626', bold: false, breakdown: feedExpenses,     breakdownType: 'expense' },
              ...(feedAncillaryCost > 0 ? [{ label: 'Feed ancillary (transport/labour)', value: formatCurrency(feedAncillaryCost), color: '#ea580c', bold: false, breakdown: feedAncExp, breakdownType: 'ancillary' }] : []),
              { label: t('batches.medicineCost'),  value: formatCurrency(medCost),                                     color: '#dc2626', bold: false, breakdown: medExpenses,      breakdownType: 'expense' },
              ...(medAncillaryCost > 0 ? [{ label: 'Medicine ancillary', value: formatCurrency(medAncillaryCost), color: '#ea580c', bold: false, breakdown: medAncExp, breakdownType: 'ancillary' }] : []),
              ...(growingFee > 0 ? [{ label: t('growingFees.title'), value: formatCurrency(growingFee), color: '#7c3aed', bold: false }] : []),
              { label: t('batches.totalExpenses'), value: formatCurrency(totalExpenses),                               color: '#dc2626', bold: true },
              { label: t('batches.grossProfit'),   value: (profit < 0 ? '−' : '') + formatCurrency(Math.abs(profit)), color: profit >= 0 ? '#15803d' : '#dc2626', bold: true },
              { label: t('batches.profitMargin'),  value: `${margin.toFixed(1)}%`,                                    color: margin >= 0 ? '#15803d' : '#dc2626', bold: false },
            ]

            const toggleRow = (label) => setExpandedPLRows(prev => {
              const next = new Set(prev)
              next.has(label) ? next.delete(label) : next.add(label)
              return next
            })

            return (
              <div>
                {rows.map((row, i) => {
                  const hasBreakdown = row.breakdown?.length > 0
                  const isExpanded   = expandedPLRows.has(row.label)
                  const isLast       = i === rows.length - 1
                  return (
                    <div key={row.label}>
                      <div
                        className={`flex justify-between items-center py-2 ${hasBreakdown ? 'cursor-pointer select-none hover:opacity-75 transition-opacity' : ''}`}
                        style={{ borderBottom: (!isExpanded && !isLast) ? '1px solid var(--border)' : 'none' }}
                        onClick={hasBreakdown ? () => toggleRow(row.label) : undefined}
                      >
                        <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)', fontWeight: row.bold ? 600 : 400 }}>
                          {hasBreakdown && (
                            <span style={{ fontSize: 10, color: 'var(--text-faint)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                          )}
                          {row.label}
                        </span>
                        <span style={{ color: row.color, fontWeight: row.bold ? 800 : 600 }} className="text-sm">{row.value}</span>
                      </div>

                      {hasBreakdown && isExpanded && (
                        <div className="mb-2 ml-4 space-y-0.5" style={{ borderBottom: !isLast ? '1px solid var(--border)' : 'none', paddingBottom: '8px' }}>
                          {row.breakdownType === 'chick' && row.breakdown.map(line => (
                            <div key={line.id} className="flex justify-between items-center text-xs" style={{ color: 'var(--text-muted)' }}>
                              <span>
                                {Number(line.quantity).toLocaleString('en-IN')} birds × {formatCurrency(line.price_per_chick)}
                                {line.source === 'stock' && <span className="ml-1.5 text-amber-600">(stock)</span>}
                              </span>
                              <span>{formatCurrency(line.total_cost)}</span>
                            </div>
                          ))}
                          {row.breakdownType === 'expense' && row.breakdown.map(line => (
                            <div key={line.id} className="flex justify-between items-center text-xs" style={{ color: 'var(--text-muted)' }}>
                              <span>{line.item_name} — {Number(line.quantity).toLocaleString('en-IN')} {line.unit} @ {formatCurrency(line.cost_per_unit)}/{line.unit}</span>
                              <span>{formatCurrency(line.total_cost)}</span>
                            </div>
                          ))}
                          {row.breakdownType === 'ancillary' && row.breakdown.map(line => (
                            <div key={line.id} className="flex justify-between items-center text-xs" style={{ color: 'var(--text-muted)' }}>
                              <span>{line.item_name}</span>
                              <span>{formatCurrency(Number(line.extra_total_cost))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Distributions ─────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">
            {t('batches.distributions')} ({distributions.length + chickPurchases.length})
          </h3>
          {canRecordOperations && (
            <button
              onClick={() => setDistModal(true)}
              className="rounded-lg bg-green-600 hover:bg-green-700 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              {t('batches.record')}
            </button>
          )}
        </div>
        {distributions.length === 0 && chickPurchases.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm text-center py-8">{t('batches.noDistributions')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
                  className="text-left text-xs font-semibold uppercase tracking-wider">
                  <th className="px-5 py-3">{t('common.date')}</th>
                  <th className="px-5 py-3">{t('distributions.selectItem')}</th>
                  <th className="px-5 py-3">{t('common.status')}</th>
                  <th className="px-5 py-3 text-right">{t('batches.distributed')}</th>
                  <th className="px-5 py-3 text-right">{t('batches.returned')}</th>
                  {canViewFinancials && <th className="px-5 py-3 text-right">{t('batches.netCost')}</th>}
                  <th className="px-5 py-3">Procurement</th>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {/* Chick placement rows from batch_chick_purchases */}
                {chickPurchases.map((cp, i) => (
                  <tr key={`chick-${cp.id}`}
                    style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(99,102,241,0.04)' }}>
                    <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{fmtDate(batch?.start_date)}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>
                      Chick Placement
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700">
                        chick
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                      {Number(cp.quantity).toLocaleString('en-IN')} birds
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span style={{ color: '#d1d5db' }}>—</span>
                    </td>
                    {canViewFinancials && (
                      <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                        {cp.total_cost > 0 ? formatCurrency(Number(cp.total_cost)) : '—'}
                      </td>
                    )}
                    <td className="px-5 py-3">
                      {cp.procurement ? (
                        <button
                          onClick={() => navigate('/procurement', { state: { openProcurementId: cp.procurement.id } })}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                        >
                          {cp.procurement.invoice_number || fmtDate(cp.procurement.date)}
                        </button>
                      ) : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-5 py-3"></td>
                  </tr>
                ))}
                {/* Regular distribution rows */}
                {distributions.map((d, i) => {
                  const returned    = Number(d.returned_quantity || 0)
                  const returnCredit= returnCostByDist[d.id] || 0
                  const expRow      = expenses.find(e => e.distribution_id === d.id)
                  const grossCost   = expRow ? Number(expRow.total_cost || 0) : 0
                  const netCost     = roundCurrency(grossCost - returnCredit)
                  const canReturn   = Number(d.quantity) - returned > 0
                  return (
                    <tr key={d.id}
                      style={{ borderBottom: i < distributions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{fmtDate(d.date)}</td>
                      <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{d.item_name}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
                          ${d.type === 'feed' ? 'bg-green-100 text-green-700' : d.type === 'medicine' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {d.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                        {Number(d.quantity).toLocaleString('en-IN')} {d.unit}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {returned > 0
                          ? <span className="text-orange-600 font-medium">− {returned.toLocaleString('en-IN')} {d.unit}</span>
                          : <span style={{ color: '#d1d5db' }}>—</span>
                        }
                      </td>
                      {canViewFinancials && (
                        <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                          {grossCost > 0 ? formatCurrency(netCost) : '—'}
                        </td>
                      )}
                      <td className="px-5 py-3">
                        {d.procurement ? (
                          <button
                            onClick={() => navigate('/procurement', { state: { openProcurementId: d.procurement.id } })}
                            className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                          >
                            {d.procurement.invoice_number || fmtDate(d.procurement.date)}
                          </button>
                        ) : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td className="px-4 py-3"><AuditInfo createdByName={d.created_by_name} createdAt={d.created_at} updatedByName={d.updated_by_name} updatedAt={d.updated_at} /></td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => setEditingDist({ ...d, farm_id: farmId })}
                              className="rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition"
                            >
                              Edit
                            </button>
                          )}
                          {canReturn && canRecordOperations && (
                            <button
                              onClick={() => setReturnModal({ ...d, farm_id: farmId })}
                              className="rounded px-2 py-1 text-xs font-medium bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition"
                            >
                              {t('batches.return')}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteDistribution({ ...d, farm_id: farmId })}
                              className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sales ────────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">
            {t('batches.sales')} ({sales.length})
          </h3>
          {canRecordOperations && (
            <button
              onClick={() => { setSaleForm({ vendor_id: vendors[0]?.id || '', kg_sold: '', price_per_kg: '', date: new Date().toISOString().slice(0, 10) }); setActionError(''); setSaleModal(true) }}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
            >
              + {t('sales.recordSale')}
            </button>
          )}
        </div>
        {sales.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm text-center py-8">{t('batches.noSalesYet')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                  className="text-left text-xs font-semibold uppercase tracking-wider">
                  <th className="px-5 py-3">{t('common.date')}</th>
                  <th className="px-5 py-3">{t('sales.vendor')}</th>
                  <th className="px-5 py-3 text-right">{t('sales.kgSold')}</th>
                  <th className="px-5 py-3 text-right">{t('sales.pricePerKg')}</th>
                  <th className="px-5 py-3 text-right">{t('common.total')}</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s, i) => (
                  <tr key={s.id}
                    style={{ borderBottom: i < sales.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{fmtDate(s.date)}</td>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{s.vendors?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>{Number(s.kg_sold).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>₹{Number(s.price_per_kg).toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-right font-bold" style={{ color: '#15803d' }}>
                      {formatCurrency(s.final_amount ?? s.total_amount)}
                      {s.final_amount != null && Math.abs(Number(s.final_amount) - Number(s.total_amount)) > 0.01 && (
                        <div className="text-xs text-gray-400 font-normal line-through">
                          {formatCurrency(s.total_amount)}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${SALE_STATUS_STYLE[s.status] || SALE_STATUS_STYLE.pending}`}>
                        {SALE_STATUS_LABEL[s.status] || s.status}
                      </span>
                      {canManageSales && (
                        <div className="flex gap-1.5 justify-center mt-2">
                          {s.status === 'pending' && (
                            <button onClick={() => confirmSale(s)}
                              className="rounded-md bg-green-600 hover:bg-green-700 px-2 py-1 text-[11px] font-semibold text-white transition">Confirm</button>
                          )}
                          <button onClick={() => openEditSale(s)}
                            className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition">Edit</button>
                          <button onClick={() => deleteSale(s)}
                            className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition">Delete</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><AuditInfo createdByName={s.created_by_name} createdAt={s.created_at} updatedByName={s.updated_by_name} updatedAt={s.updated_at} confirmedByName={s.confirmed_by_name} confirmedAt={s.confirmed_at} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right" style={{ color: 'var(--text-muted)' }}>{t('batches.totalRevenue')}</td>
                  <td className="px-5 py-3 text-right font-extrabold" style={{ color: '#15803d' }}>{formatCurrency(revenue)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Growing Fee Advances (active batch) ─────────────────────── */}
      {isActive && canViewFinancials && (
        <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">{t('growingFees.advanceTracking')}</h3>
            <span className="text-xs font-medium text-gray-400">{t('growingFees.batchActiveDay', { day: elapsed })}</span>
          </div>
          <p style={{ color: 'var(--text-muted)' }} className="text-xs mb-3">{t('growingFees.feeCalculatedAtClose')}</p>
          {advances.length > 0 ? (
            <div className="space-y-2 mb-3">
              {advances.map((adv, i) => (
                <div key={adv.id} className="flex items-center justify-between text-sm" style={{ borderBottom: i < advances.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: i < advances.length - 1 ? 8 : 0 }}>
                  <div>
                    <span style={{ color: 'var(--text)' }} className="font-medium">{fmtDate(adv.payment_date)}</span>
                    {adv.payment_method && <span style={{ color: 'var(--text-muted)' }} className="text-xs ml-2">· {adv.payment_method}</span>}
                  </div>
                  <span className="font-semibold text-amber-700">{formatCurrency(adv.amount)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span style={{ color: 'var(--text-muted)' }} className="text-sm font-semibold">{t('growingFees.totalAdvancesLabel')}</span>
                <span className="font-bold text-amber-700">{formatCurrency(advances.reduce((s, a) => s + Number(a.amount), 0))}</span>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)' }} className="text-xs italic mb-3">{t('growingFees.noAdvances')}</p>
          )}
          {canEdit && (
            <button
              onClick={() => { setActionError(''); setAdvanceModal(true) }}
              className="w-full rounded-lg border border-green-600 text-green-700 hover:bg-green-50 px-4 py-2 text-sm font-semibold transition"
            >
              {t('growingFees.giveAdvanceBtn')}
            </button>
          )}
        </div>
      )}

      {/* ── FCR Section ──────────────────────────────────────────────── */}
      {(batch.status === 'sold' || batch.status === 'closed') && batch.fcr != null && (() => {
        const fcr = Number(batch.fcr)
        const rating = batch.fcr_rating || ''
        const ratingColor = rating === 'Excellent' ? '#15803d' : rating === 'Good' ? '#2563eb' : rating === 'Average' ? '#d97706' : '#dc2626'
        const ratingBg    = rating === 'Excellent' ? '#f0fdf4' : rating === 'Good' ? '#eff6ff' : rating === 'Average' ? '#fffbeb' : '#fef2f2'
        const gaugeMax    = 3.0
        const gaugePct    = Math.min((fcr / gaugeMax) * 100, 100)
        const gaugeColor  = rating === 'Excellent' ? '#15803d' : rating === 'Good' ? '#2563eb' : rating === 'Average' ? '#f59e0b' : '#dc2626'
        return (
          <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">{t('batches.fcrSection')}</h3>
              <span className="text-xs font-semibold rounded-full px-3 py-1" style={{ backgroundColor: ratingBg, color: ratingColor }}>{t(`batches.fcrRating.${rating.toLowerCase()}`)}</span>
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <p style={{ color: ratingColor }} className="text-4xl font-extrabold">{fcr.toFixed(2)}</p>
                <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-1">{t('batches.fcrFeedKgDivSaleKg')}</p>
              </div>
              <div className="flex-1 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                <p>{t('batches.fcrFeedConsumed', { kg: Number(batch.total_feed_kg || 0).toLocaleString('en-IN') })}</p>
                <p>{t('batches.fcrChickenSold', { kg: Number(batch.total_sale_kg || 0).toLocaleString('en-IN') })}</p>
              </div>
            </div>
            {/* Gauge bar */}
            <div className="mb-2">
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#f3f4f6' }}>
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${gaugePct}%`, backgroundColor: gaugeColor }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1" style={{ color: '#9ca3af' }}>
                <span>0</span>
                <span className="text-green-600 font-medium">≤1.8 {t('batches.fcrRating.excellent')}</span>
                <span className="text-blue-600 font-medium">≤2.1 {t('batches.fcrRating.good')}</span>
                <span className="text-amber-600 font-medium">≤2.5 {t('batches.fcrRating.average')}</span>
                <span className="text-red-600 font-medium">3+</span>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Growing Fee Section ──────────────────────────────────────── */}
      {canViewFinancials && (batch.status === 'sold' || batch.status === 'closed') && batch.growing_fee_total == null && (
        <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">{t('growingFees.title')}</h3>
          </div>
          <p style={{ color: 'var(--text-muted)' }} className="text-xs mb-3">
            Growing fee was not calculated automatically. This can happen if no fee configuration is set up, or if the FCR could not be determined.
          </p>
          {actionError && <p className="text-xs text-red-600 mb-3">{actionError}</p>}
          {canEdit && (
            <button
              onClick={recalcGrowingFee}
              disabled={saving}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition"
            >
              {saving ? 'Calculating…' : 'Calculate Growing Fee'}
            </button>
          )}
        </div>
      )}
      {canViewFinancials && (batch.status === 'sold' || batch.status === 'closed') && batch.growing_fee_total != null && (() => {
        const grossFee     = Number(batch.growing_fee_total)
        const ratePerKg    = Number(batch.growing_fee_per_kg || 0)
        const saleKg       = Number(batch.total_sale_kg || 0)
        const realAmount   = ratePerKg * saleKg
        const isEdited     = ratePerKg > 0 && Math.abs(grossFee - realAmount) > 0.01
        const totalAdv     = Number(batch.growing_fee_ledger?.total_advances ?? advances.reduce((s, a) => s + Number(a.amount), 0))
        const postClosePaid= Number(batch.growing_fee_ledger?.amount_paid || 0)
        const balance      = Number(batch.growing_fee_ledger?.balance_due ?? Math.max(0, grossFee - totalAdv))
        const overpaid     = Number(batch.growing_fee_ledger?.overpaid_amount || 0)
        const status       = batch.growing_fee_ledger?.status || 'pending'
        const statusColor  = status === 'paid' ? '#15803d' : status === 'overpaid' ? '#15803d' : status === 'partial' ? '#d97706' : '#dc2626'
        const statusBg     = status === 'paid' ? '#f0fdf4' : status === 'overpaid' ? '#f0fdf4' : status === 'partial' ? '#fffbeb' : '#fef2f2'
        return (
          <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold">{t('growingFees.title')}</h3>
              <div className="flex items-center gap-2">
                {canEdit && status !== 'paid' && status !== 'overpaid' && (
                  <button
                    onClick={() => { setEditFeeAmount(String(batch.growing_fee_total)); setActionError(''); setShowEditFeeModal(true) }}
                    className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition"
                  >
                    Edit
                  </button>
                )}
                <span className="text-xs font-semibold rounded-full px-3 py-1 capitalize" style={{ backgroundColor: statusBg, color: statusColor }}>{status}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {farm?.owner_name && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.farmOwner')}</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{farm.owner_name}</span>
                </div>
              )}
              {batch.growing_fee_ledger?.fcr_tier_description && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.fcrTier')}</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{batch.growing_fee_ledger.fcr_tier_description}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.rateApplied')}</span>
                <span className="font-medium" style={{ color: 'var(--text)' }}>₹{Number(batch.growing_fee_per_kg).toFixed(2)} / kg</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.chickenSold')}</span>
                <span className="font-medium" style={{ color: 'var(--text)' }}>{Number(batch.total_sale_kg || 0).toLocaleString('en-IN')} kg</span>
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>{isEdited ? 'Auto-Calculated Fee' : t('growingFees.grossGrowingFee')}</span>
                  <span className={isEdited ? 'font-medium line-through text-gray-400' : 'font-bold text-base'} style={isEdited ? {} : { color: 'var(--text)' }}>
                    {formatCurrency(isEdited ? realAmount : grossFee)}
                  </span>
                </div>
                {isEdited && (
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--text-muted)' }}>Final Amount <span className="text-xs text-blue-500">(adjusted)</span></span>
                    <span className="font-bold text-base" style={{ color: 'var(--text)' }}>{formatCurrency(grossFee)}</span>
                  </div>
                )}
                {totalAdv > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.advancesPaid')}</span>
                      <span className="font-medium text-amber-700">− {formatCurrency(totalAdv)}</span>
                    </div>
                    {advances.length > 0 && (
                      <div className="ml-3 space-y-1">
                        {advances.map(adv => (
                          <div key={adv.id} className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
                            <span>{fmtDate(adv.payment_date)} · {adv.payment_method || 'Cash'}</span>
                            <span>{formatCurrency(adv.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {postClosePaid > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.postClosePaid')}</span>
                    <span className="font-medium text-green-700">− {formatCurrency(postClosePaid)}</span>
                  </div>
                )}
                <div className="pt-1 border-t border-gray-100">
                  {overpaid > 0 ? (
                    <div className="flex justify-between">
                      <span className="font-semibold text-green-700">{t('growingFees.overpaidCredit')}</span>
                      <span className="font-bold text-green-700">+ {formatCurrency(overpaid)}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>{t('growingFees.balanceDue')}</span>
                      <span className="font-bold text-lg" style={{ color: balance > 0 ? '#dc2626' : '#15803d' }}>{formatCurrency(balance)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {overpaid > 0 && (
              <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">
                {t('growingFees.overpaidMsg', { amount: formatCurrency(overpaid) })}
              </div>
            )}
            {balance > 0 && (
              <a href="/growing-fees" className="mt-4 w-full block text-center rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition">
                {t('growingFees.recordPaymentLink')}
              </a>
            )}
            {canEdit && status !== 'paid' && status !== 'overpaid' && (
              <button
                onClick={recalcGrowingFee}
                disabled={saving}
                className="mt-2 w-full rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-4 py-2 text-xs font-medium text-gray-500 transition"
              >
                {saving ? 'Recalculating…' : 'Recalculate Growing Fee'}
              </button>
            )}
          </div>
        )
      })()}

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <div style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }} className="rounded-xl border shadow-sm p-5">
        <h3 style={{ color: 'var(--text)' }} className="text-sm font-semibold mb-5">{t('batches.timeline')}</h3>
        {timelineEvents.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }} className="text-sm text-center py-4">{t('batches.noEvents')}</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-0 bottom-0 w-0.5" style={{ backgroundColor: 'var(--border)' }} />
            <div className="space-y-4">
              {timelineEvents.map((ev, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base z-10"
                    style={{ backgroundColor: ev.color, border: `2px solid ${ev.border}` }}
                  >
                    {ev.icon}
                  </div>
                  <div className="flex-1 pt-1.5">
                    <p style={{ color: 'var(--text)' }} className="text-sm font-medium">{ev.label}</p>
                    <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">{fmtDate(ev.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>

    {/* ── Edit Batch Modal ──────────────────────────────────────────────── */}
    {editModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">{t('batches.editBatch')}</h2>
            <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={handleEditBatch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.startDate')} *</label>
              <input required type="date" value={editForm.start_date}
                onChange={e => setEditForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.chickCount')} *</label>
              <input required type="number" min="1" value={editForm.chick_count}
                onChange={e => setEditForm(p => ({ ...p, chick_count: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>

            {/* Per-lot allocation */}
            {editLotsLoading ? (
              <div className="flex justify-center py-3">
                <div className="h-5 w-5 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
              </div>
            ) : editChickLots.length > 1 && (
              (() => {
                const newCount   = Number(editForm.chick_count) || 0
                const allocTotal = Object.values(editLotAllocs).reduce((s, v) => s + Number(v || 0), 0)
                const matches    = newCount > 0 && Math.abs(allocTotal - newCount) < 0.5
                return (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
                    <p className="text-xs font-semibold text-indigo-700">Procurement lot allocation:</p>
                    {editChickLots.map(lot => (
                      <div key={lot.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">{fmtDate(lot.date)}{lot.supplier ? ` — ${lot.supplier}` : ''}</p>
                          <p className="text-xs text-gray-400">{lot.invoice ? `${lot.invoice} · ` : ''}{lot.editAvail.toLocaleString('en-IN')} birds available · ₹{lot.costPerUnit}/bird</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number" min="0" max={lot.editAvail} step="1"
                            value={editLotAllocs[lot.id] ?? ''}
                            onChange={ev => setEditLotAllocs(prev => ({ ...prev, [lot.id]: parseInt(ev.target.value) || 0 }))}
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <span className="text-xs text-gray-400">birds</span>
                        </div>
                      </div>
                    ))}
                    <div className={`text-xs font-semibold pt-1 border-t border-indigo-200 ${matches ? 'text-green-600' : 'text-red-500'}`}>
                      Total: {allocTotal.toLocaleString('en-IN')} / {newCount.toLocaleString('en-IN')} birds{matches ? ' ✓' : ' — must match chick count'}
                    </div>
                  </div>
                )
              })()
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? t('batches.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* ── Mortality Modal ───────────────────────────────────────────────── */}
    {mortalityModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">{t('batches.setMortalityCount')}</h2>
            <button onClick={() => setMortalityModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <form onSubmit={handleMortality} className="space-y-4">
            <p className="text-sm text-gray-500">{t('batches.mortalityDesc')}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.mortalityCount')} *</label>
              <input required type="number" min="0" value={mortalityVal}
                onChange={e => setMortalityVal(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setMortalityModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? t('batches.saving') : t('batches.update')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    {/* ── Confirm Status Modal ─────────────────────────────────────────── */}
    {confirmModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800">{t('batches.confirmStatusChange')}</h2>
            <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <p className="text-sm text-gray-600 mb-5">
            {t('batches.confirmStatusMsg', { label: confirmModal.label })}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmModal(null)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleMarkStatus}
              disabled={saving}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{
                backgroundColor:
                  confirmModal.newStatus === 'sold'   ? '#2563eb' :
                  confirmModal.newStatus === 'closed' ? '#6b7280' : '#16a34a'
              }}
            >
              {saving ? t('batches.saving') : t('batches.yesWith', { label: confirmModal.label })}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Give Advance Modal ───────────────────────────────────────────── */}
    {advanceModal && isActive && (
      <GiveAdvanceModal
        farm={farm}
        batch={batch}
        onClose={() => setAdvanceModal(false)}
        onSaved={() => { setAdvanceModal(false); refresh() }}
      />
    )}

    {/* ── Distribution Modal ────────────────────────────────────────────── */}
    {distModal && (
      <DistributionModal
        farmId={farmId}
        initialBatchId={batchId}
        onClose={() => setDistModal(false)}
        onSaved={() => { setDistModal(false); refresh(); if (currentStep?.id === 'distribution') stepDone('distribution') }}
      />
    )}

    {/* ── Sale Modal ────────────────────────────────────────────────────── */}
    {saleModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">{editingSale ? 'Edit Sale' : t('batches.recordSaleTitle')}</h2>
            <button onClick={closeSaleModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-4">
            {t('batches.title')} {fmtDate(batch.start_date)} · {Number(batch.chick_count).toLocaleString('en-IN')} chicks
          </div>
          <form onSubmit={handleSale} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.vendor')} *</label>
              {vendors.length === 0 ? (
                <p className="text-sm text-red-500">{t('batches.noVendorsFound')}</p>
              ) : (
                <select required value={saleForm.vendor_id}
                  onChange={e => setSaleForm(p => ({ ...p, vendor_id: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.chickensNo')} *</label>
                <input required type="number" min="1" step="1" value={saleForm.chicken_count}
                  onChange={e => setSaleForm(p => ({ ...p, chicken_count: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                {(() => {
                  const live = Math.max(0, Number(batch.chick_count || 0) - Number(batch.mortality_count || 0))
                  const soldSoFar = sales.filter(r => r.status !== 'rejected').reduce((s, r) => s + Number(r.chicken_count || 0), 0)
                  const available = Math.max(0, live - soldSoFar)
                  const entered = parseInt(saleForm.chicken_count) || 0
                  return (
                    <p className={`text-xs mt-1 font-medium ${entered > available ? 'text-red-600' : 'text-gray-400'}`}>
                      {entered > available
                        ? t('batches.exceedsAvailable', { count: available.toLocaleString('en-IN') })
                        : t('batches.availableBirds', { count: available.toLocaleString('en-IN') })}
                    </p>
                  )
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.kgSold')} *</label>
                <input required type="number" min="0.01" step="0.01" value={saleForm.kg_sold}
                  onChange={e => setSaleForm(p => ({ ...p, kg_sold: e.target.value }))}
                  placeholder="e.g. 150"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.pricePerKg')} (₹) *</label>
                <input required type="number" min="0.01" step="0.01" value={saleForm.price_per_kg}
                  onChange={e => setSaleForm(p => ({ ...p, price_per_kg: e.target.value }))}
                  placeholder="e.g. 95"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {(() => {
              const calcAmt = saleForm.kg_sold && saleForm.price_per_kg
                ? parseFloat(saleForm.kg_sold) * parseFloat(saleForm.price_per_kg)
                : null
              const finalAmt  = parseFloat(saleForm.final_amount)
              const isOverride = editingSale && calcAmt != null && !isNaN(finalAmt) && Math.abs(finalAmt - calcAmt) > 0.01
              return (
                <>
                  {calcAmt != null && (
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex justify-between items-center">
                      <span className="text-xs font-medium text-green-700">
                        {editingSale ? 'Calculated Amount' : t('common.total')}
                      </span>
                      <span className={`text-base font-bold ${isOverride ? 'line-through text-gray-400' : 'text-green-700'}`}>
                        {formatCurrency(calcAmt)}
                      </span>
                    </div>
                  )}
                  {editingSale && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">
                          Final Amount (₹) <span className="text-xs text-gray-400 font-normal">— override if needed</span>
                        </label>
                        {isOverride && (
                          <button
                            type="button"
                            onClick={() => setSaleForm(p => ({ ...p, final_amount: calcAmt != null ? calcAmt.toFixed(2) : '' }))}
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            Reset to calculated
                          </button>
                        )}
                      </div>
                      <input
                        type="number" min="0" step="0.01"
                        value={saleForm.final_amount}
                        onChange={e => setSaleForm(p => ({ ...p, final_amount: e.target.value }))}
                        placeholder={calcAmt != null ? calcAmt.toFixed(2) : '0.00'}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {isOverride && (
                        <p className="text-xs text-blue-600 mt-1">
                          Final amount adjusted: {formatCurrency(finalAmt)} (auto: {formatCurrency(calcAmt)})
                        </p>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
              <input required type="date" value={saleForm.date}
                onChange={e => setSaleForm(p => ({ ...p, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeSaleModal}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
              <button type="submit" disabled={saving || vendors.length === 0}
                className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? t('batches.saving') : editingSale ? 'Save Changes' : t('batches.saveSale')}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* ── Stock Return Modal ─────────────────────────────────────────────── */}
    {returnModal && (
      <StockReturnModal
        distribution={returnModal}
        onClose={() => setReturnModal(null)}
        onSaved={() => { setReturnModal(null); refresh() }}
      />
    )}

    {/* ── Edit Distribution Modal ────────────────────────────────────────── */}
    {editingDist && (
      <EditDistributionModal
        distribution={editingDist}
        onClose={() => setEditingDist(null)}
        onSaved={() => { setEditingDist(null); refresh() }}
      />
    )}

    {/* ── Post-close Stock Return Prompt ────────────────────────────────── */}
    {showEditFeeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Edit Growing Fee</h2>
          <p className="text-xs text-gray-500 mb-4">Override the auto-calculated growing fee. Balance due will be recalculated.</p>
          <label className="block text-xs font-medium text-gray-600 mb-1">Total Growing Fee (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={editFeeAmount}
            onChange={e => setEditFeeAmount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            placeholder="0.00"
          />
          {actionError && <p className="text-xs text-red-600 mb-3">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setShowEditFeeModal(false); setActionError('') }}
              disabled={editFeeSaving}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleEditFeeSave}
              disabled={editFeeSaving || editFeeAmount === ''}
              className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {editFeeSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )}

    {pendingFarmAdvs && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="text-center mb-4">
            <p className="text-3xl mb-2">💰</p>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Apply Pending Farm Advances?</h2>
            <p className="text-sm text-gray-600">
              This farm has {pendingFarmAdvs.advances.length} pending advance{pendingFarmAdvs.advances.length > 1 ? 's' : ''} totalling{' '}
              <strong>{formatCurrency(pendingFarmAdvs.advances.reduce((s, a) => s + Number(a.amount), 0))}</strong>{' '}
              not linked to any batch.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 space-y-1">
            {pendingFarmAdvs.advances.map(a => (
              <div key={a.id} className="flex justify-between text-sm">
                <span className="text-amber-700">{a.payment_date}</span>
                <span className="font-semibold text-amber-800">{formatCurrency(a.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-4 text-center">Applying will link these to this batch and reduce the growing fee balance.</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleFarmAdvDecision(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              Skip
            </button>
            <button
              onClick={() => handleFarmAdvDecision(true)}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-semibold text-white transition"
            >
              Apply {formatCurrency(pendingFarmAdvs.advances.reduce((s, a) => s + Number(a.amount), 0))}
            </button>
          </div>
        </div>
      </div>
    )}

    {postCloseModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
          <div className="text-center mb-5">
            <p className="text-4xl mb-3">📦</p>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('batches.batchClosedLeftover')}</h2>
            <p className="text-sm text-gray-600">{t('batches.batchClosedLeftoverMsg')}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPostCloseModal(false)}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t('batches.noLeftoverStock')}
            </button>
            <button
              onClick={() => { setPostCloseModal(false); navigate(`/farms/${farmId}`) }}
              className="flex-1 rounded-lg bg-orange-500 hover:bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition"
            >
              {t('batches.goToFarmPage')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
