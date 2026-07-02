import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'
import { formatDate } from '../utils/dateFormat'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysElapsed(startDate) {
  return Math.floor((Date.now() - new Date(startDate)) / 86400000)
}

function barColor(pct) {
  if (pct > 75) return '#166534'   // very full — dark green
  if (pct > 50) return '#16a34a'   // getting full — medium green
  if (pct > 25) return '#4ade80'   // healthy fill — light green
  return '#bbf7d0'                  // nearly empty — very light green
}

function harvestColor(days) {
  if (days < 0)   return '#991b1b'  // overdue — dark red
  if (days <= 3)  return '#dc2626'  // 1–3 days — red
  if (days <= 7)  return '#ea580c'  // 4–7 days — orange
  if (days <= 14) return '#f59e0b'  // 8–14 days — amber
  if (days <= 25) return '#16a34a'  // 15–25 days — green
  return '#9ca3af'                   // > 25 days — gray (no urgency)
}

// ─── Give Advance Modal ───────────────────────────────────────────────────────

function GiveAdvanceModal({ farm, onClose, onSaved }) {
  const { organization } = useAuth()
  const { t, i18n } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
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
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('accounts').select('id, name, type').eq('is_active', true).order('created_at'),
      supabase.from('batches').select('id, start_date, chick_count').eq('farm_id', farm.id).eq('status', 'active').order('start_date'),
    ]).then(([{ data: accs }, { data: bs }]) => {
      const accounts = accs || []
      setAccounts(accounts)
      const cashAcc = accounts.find(a => a.type === 'cash') ?? accounts[0]
      const batches = bs || []
      setActiveBatches(batches)
      setForm(f => ({
        ...f,
        account_id: cashAcc?.id ?? '',
        batch_id:   batches[0]?.id ?? '',
      }))
      setLoadingBatches(false)
    })
  }, [farm.id])

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(ev) {
    ev.preventDefault()
    setError('')
    if (!form.batch_id) { setError(t('errors.noActiveBatch')); return }
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError(t('errors.enterValidAmount')); return }
    if (!form.account_id) { setError(t('errors.selectAccount')); return }

    setSaving(true)

    const { data: adv, error: advErr } = await supabase.from('growing_fee_advances').insert({
      organization_id:  organization?.id,
      farm_id:          farm.id,
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
    const batchDateStr = selectedBatch
      ? formatDate(selectedBatch.start_date + 'T12:00:00', i18n.language)
      : ''
    await supabase.from('transactions').insert({
      organization_id:  organization?.id,
      account_id:       form.account_id,
      transaction_type: 'out',
      category:         'growing_fee_advance',
      description:      `Growing fee advance — ${farm.owner_name || farm.name}${batchDateStr ? ', Batch ' + batchDateStr : ''}`,
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
          <h2 className="text-lg font-semibold text-gray-800">{t('growingFees.advancePaymentTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm">
          <p className="font-semibold text-gray-800">{farm.name}</p>
          {farm.owner_name && <p className="text-gray-500 text-xs mt-0.5">{farm.owner_name}</p>}
        </div>

        {loadingBatches ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 rounded-full border-4 border-green-400 border-t-transparent animate-spin" />
          </div>
        ) : activeBatches.length === 0 ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 mb-4">
            {t('growingFees.noActiveBatchAdvance')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Batch */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.batch')} *</label>
              {activeBatches.length === 1 ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 font-medium">
                  {t('sales.batch')} {formatDate(activeBatches[0].start_date + 'T12:00:00', i18n.language)}
                  {' '}— {t('batches.dayCount', { day: Math.floor((Date.now() - new Date(activeBatches[0].start_date + 'T00:00:00')) / 86400000) })}
                  {' '}— {Number(activeBatches[0].chick_count).toLocaleString('en-IN')} chicks
                </div>
              ) : (
                <select required value={form.batch_id} onChange={set('batch_id')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                  {activeBatches.map(b => {
                    const day = Math.floor((Date.now() - new Date(b.start_date + 'T00:00:00')) / 86400000)
                    const sd = formatDate(b.start_date + 'T12:00:00', i18n.language)
                    return <option key={b.id} value={b.id}>{t('sales.batch')} {sd} — {t('batches.dayCount', { day })} — {Number(b.chick_count).toLocaleString('en-IN')} chicks</option>
                  })}
                </select>
              )}
            </div>

            {/* Account */}
            {accounts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.payFromAccountLabel')}</label>
                <select required value={form.account_id} onChange={set('account_id')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="">{t('growingFees.selectAccount')}</option>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.amountRs')} *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.paymentDate')} *</label>
                <input required type="date" value={form.payment_date} onChange={set('payment_date')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.paymentMethod')}</label>
                <select value={form.payment_method} onChange={set('payment_method')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option>{t('suppliers.methods.cash')}</option>
                  <option>{t('suppliers.methods.bankTransfer')}</option>
                  <option>{t('suppliers.methods.cheque')}</option>
                  <option>{t('suppliers.methods.other')}</option>
                </select>
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('growingFees.referenceNumber')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
              <input value={form.reference_number} onChange={set('reference_number')} placeholder={t('growingFees.referenceNumberOptional')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')} <span className="text-gray-400 font-normal">({t('common.optional')})</span></label>
              <textarea rows={2} value={form.notes} onChange={set('notes')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
              <button type="submit" disabled={saving}
                className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
                {saving ? t('common.loading') : t('growingFees.recordAdvanceBtn')}
              </button>
            </div>
          </form>
        )}

        {activeBatches.length === 0 && !loadingBatches && (
          <button onClick={onClose}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Farm Create / Edit Modal ─────────────────────────────────────────────────

function FarmModal({ farm, maxFarms, onClose, onSaved }) {
  const { organization } = useAuth()
  const { t } = useTranslation()
  const isEdit = Boolean(farm)
  const [form, setForm] = useState({
    name:         farm?.name         ?? '',
    location:     farm?.location     ?? '',
    capacity:     farm?.capacity     ?? '',
    phone_number: farm?.phone_number ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(field) {
    return e => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      name:         form.name.trim(),
      location:     form.location.trim() || null,
      capacity:     Number(form.capacity),
      phone_number: form.phone_number.trim() || null,
    }

    const { error } = isEdit
      ? await supabase.from('farms').update(payload).eq('id', farm.id).eq('organization_id', organization?.id)
      : await supabase.from('farms').insert({ ...payload, organization_id: organization?.id })

    if (error) {
      // DB hard-enforces the plan limit; surface a friendly message instead of the raw error.
      const friendly = error.message?.includes('FARM_LIMIT_REACHED')
        ? (maxFarms != null
            ? `Farm limit reached (${maxFarms} / ${maxFarms}). Upgrade your plan to add more.`
            : 'Farm limit reached. Upgrade your plan to add more farms.')
        : error.message
      setError(friendly); setSaving(false)
    }
    else onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{isEdit ? t('farms.editFarm') : t('farms.addFarm')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('farms.farmName')} *</label>
            <input required value={form.name} onChange={set('name')} placeholder={t('farms.farmNamePlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('farms.location')}</label>
            <input value={form.location} onChange={set('location')} placeholder={t('farms.locationPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('farms.capacityBirds')} *</label>
            <input required type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="e.g. 5000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('farms.phoneNumber')}</label>
            <input value={form.phone_number} onChange={set('phone_number')} placeholder="e.g. 9876543210"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
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
              {saving ? t('common.loading') : isEdit ? t('common.save') : t('farms.addFarm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({ farm, onClose, onDeleted }) {
  const { organization } = useAuth()
  const { t } = useTranslation()
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase.from('farms').delete().eq('id', farm.id).eq('organization_id', organization?.id)
    if (error) { setError(error.message); setDeleting(false) }
    else onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('farms.deleteFarm')}</h2>
        <p className="text-sm text-gray-600 mb-1">
          {t('farms.deleteConfirm')} <span className="font-semibold">{farm.name}</span>?
        </p>
        <p className="text-xs text-red-500 mb-5">{t('farms.deleteWarning')}</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            {t('common.cancel')}
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
            {deleting ? t('common.loading') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Farm Card ────────────────────────────────────────────────────────────────

function FarmCard({ farm, batchInfo, onEdit, onDelete, onAdvance, onAddBatch, onClick, canEdit, canDelete }) {
  const { t } = useTranslation()
  const { activeBatchCount = 0, liveChicks = 0, nextHarvestDays = null, totalBatches = 0 } = batchInfo || {}
  const hasActive = activeBatchCount > 0
  const capacity  = Number(farm.capacity || 0)
  const pct       = capacity > 0 ? Math.min((liveChicks / capacity) * 100, 100) : 0
  const overCap   = capacity > 0 && liveChicks > capacity
  const fillColor = hasActive ? barColor(pct) : '#d1d5db'

  return (
    <div
      onClick={onClick}
      className="relative flex items-center gap-4 rounded-xl border px-5 py-4 cursor-pointer transition-all duration-150 hover:shadow-md"
      style={{
        backgroundColor: hasActive ? 'var(--surface)' : 'var(--surface-2)',
        borderColor:     'var(--border)',
      }}
    >
      {/* Left: main info */}
      <div className="flex-1 min-w-0">
        {/* Name + batch pill */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h3 className="text-base font-bold text-gray-800">{farm.name}</h3>
          {hasActive ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              {activeBatchCount} active batch{activeBatchCount !== 1 ? 'es' : ''}
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600">
              {t('farms.noActiveBatches')}
            </span>
          )}
        </div>

        {/* Meta row: location · phone */}
        {(farm.location || farm.phone_number) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-1">
            {farm.location     && <span>📍 {farm.location}</span>}
            {farm.phone_number && <span>📞 {farm.phone_number}</span>}
          </div>
        )}
        {farm.owner_name && (
          <div className="text-xs text-gray-400 mb-2">👤 {farm.owner_name}</div>
        )}

        {/* Capacity bar row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">
            🐔 {liveChicks.toLocaleString('en-IN')}
            {capacity > 0 ? ` / ${capacity.toLocaleString('en-IN')}` : ''}
          </span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, backgroundColor: '#e5e7eb' }}>
            <div style={{ width: `${pct}%`, height: 4, backgroundColor: fillColor, borderRadius: 9999 }} />
          </div>
          <span className="text-xs font-semibold shrink-0" style={{ color: fillColor }}>
            {overCap ? '⚠️ ' : ''}{capacity > 0 ? t('farms.capacityUsed', { percent: Math.round(pct) }) : '—'}
          </span>
        </div>

        {/* Footer: total batches + harvest */}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
          <span>{totalBatches} batch{totalBatches !== 1 ? 'es' : ''} total</span>
          {hasActive && nextHarvestDays !== null && (
            <span className="font-semibold" style={{ color: harvestColor(nextHarvestDays) }}>
              {nextHarvestDays < 0
                ? `${Math.abs(nextHarvestDays)}d overdue`
                : t('farms.nextHarvest', { days: nextHarvestDays })}
            </span>
          )}
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        {!hasActive && canEdit && (
          <button
            onClick={onAddBatch}
            className="rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition"
          >
            + Add Batch
          </button>
        )}
        <div className="flex gap-1.5">
          {canEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
            >
              {t('common.edit')}
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 transition"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Farms() {
  const navigate = useNavigate()
  const { organization, canEdit, canDelete } = useAuth()
  const { t } = useTranslation()
  const { currentStep, stepDone } = useOnboarding()

  const [farms,        setFarms]        = useState([])
  const [farmBatchMap, setFarmBatchMap] = useState({}) // farm_id → { activeBatchCount, liveChicks, nextHarvestDays, totalBatches }
  const [maxFarms,     setMaxFarms]     = useState(null) // plan limit; null = unlimited
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingFarm,  setEditingFarm]  = useState(null)
  const [deletingFarm, setDeletingFarm] = useState(null)
  const [advanceFarm,  setAdvanceFarm]  = useState(null)

  // Filters
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')

  async function fetchData() {
    setLoading(true)
    const planKey = organization?.subscription_plan || 'free'
    const [{ data: farmsData }, { data: batchData }, { data: planData }] = await Promise.all([
      supabase.from('farms').select('*').eq('organization_id', organization?.id).order('name'),
      supabase.from('batches').select('farm_id, chick_count, mortality_count, start_date, status').eq('organization_id', organization?.id),
      supabase.from('plans').select('max_farms').eq('key', planKey).maybeSingle(),
    ])

    setFarms(farmsData || [])
    setMaxFarms(planData?.max_farms ?? null) // unknown plan / no limit → unlimited

    // Build per-farm batch info
    const map = {}
    for (const b of (batchData || [])) {
      if (!map[b.farm_id]) map[b.farm_id] = { activeBatchCount: 0, liveChicks: 0, nextHarvestDays: Infinity, totalBatches: 0 }
      map[b.farm_id].totalBatches++
      if (b.status === 'active') {
        map[b.farm_id].activeBatchCount++
        const alive    = Number(b.chick_count || 0) - Number(b.mortality_count || 0)
        map[b.farm_id].liveChicks += Math.max(0, alive)
        const daysLeft = 45 - daysElapsed(b.start_date)
        map[b.farm_id].nextHarvestDays = Math.min(map[b.farm_id].nextHarvestDays, daysLeft)
      }
    }
    // Resolve Infinity (no active batches)
    for (const id of Object.keys(map)) {
      if (map[id].nextHarvestDays === Infinity) map[id].nextHarvestDays = null
    }
    setFarmBatchMap(map)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function handleSaved()   { setModalOpen(false); setEditingFarm(null); fetchData(); if (currentStep?.id === 'farm') stepDone('farm') }
  function handleDeleted() { setDeletingFarm(null); fetchData() }

  // Unique locations
  const locations = ['all', ...Array.from(new Set(farms.map(f => f.location).filter(Boolean))).sort()]

  // Filter
  const filtered = farms.filter(farm => {
    const hasActive     = (farmBatchMap[farm.id]?.activeBatchCount || 0) > 0
    const matchSearch   = farm.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus   = statusFilter === 'all' ? true : statusFilter === 'active' ? hasActive : !hasActive
    const matchLocation = locationFilter === 'all' || farm.location === locationFilter
    return matchSearch && matchStatus && matchLocation
  })

  // Sort: live chick count desc, then alpha for no-active farms
  const sorted = [...filtered].sort((a, b) => {
    const aLive = farmBatchMap[a.id]?.liveChicks || 0
    const bLive = farmBatchMap[b.id]?.liveChicks || 0
    if (aLive !== bLive) return bLive - aLive
    return a.name.localeCompare(b.name)
  })

  // ── Plan limit (UX gate; DB hard-enforces via trigger) ───────────────────
  const farmCount   = farms.length
  const atFarmLimit = maxFarms != null && farmCount >= maxFarms

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('farms.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your farm locations</p>
        </div>
        {canEdit && (
          <div className="flex flex-col items-end gap-1">
            <button
              data-tour="farm"
              onClick={() => { setEditingFarm(null); setModalOpen(true) }}
              disabled={atFarmLimit}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
            >
              <span className="text-base leading-none">+</span> {t('farms.addFarm')}
            </button>
            {maxFarms != null && (
              <span className="text-xs text-gray-400">{farmCount} / {maxFarms} farms used</span>
            )}
          </div>
        )}
      </div>

      {/* Plan limit notice */}
      {canEdit && atFarmLimit && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Farm limit reached ({farmCount} / {maxFarms}). Upgrade your plan to add more.</span>
          <Link to="/settings/organization" className="font-semibold text-amber-700 underline hover:text-amber-900 whitespace-nowrap">
            Upgrade plan
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder={t('common.search') + ' farms…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
        />

        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {[
            ['all', t('common.all')],
            ['active', t('farms.hasActiveBatch')],
            ['inactive', t('farms.noActiveBatches')],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-3 py-2 font-medium transition ${statusFilter === val ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All Locations</option>
          {locations.filter(l => l !== 'all').map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <span className="text-5xl mb-3">🏡</span>
          <p className="text-sm font-medium">
            {farms.length === 0 ? t('farms.noFarms') : 'No farms match your filter'}
          </p>
          {farms.length === 0 ? (
            canEdit && (
              <button
                onClick={() => { setEditingFarm(null); setModalOpen(true) }}
                disabled={atFarmLimit}
                className="mt-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
              >
                {t('farms.addFarm')}
              </button>
            )
          ) : (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setLocationFilter('all') }}
              className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              {t('common.clear')} filters
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map(farm => (
            <FarmCard
              key={farm.id}
              farm={farm}
              batchInfo={farmBatchMap[farm.id]}
              onClick={() => navigate(`/farms/${farm.id}`)}
              onEdit={() => { setEditingFarm(farm); setModalOpen(true) }}
              onDelete={() => setDeletingFarm(farm)}
              onAdvance={() => setAdvanceFarm(farm)}
              onAddBatch={() => navigate('/batches', { state: { openNew: true, farmId: farm.id } })}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modalOpen && (
        <FarmModal
          farm={editingFarm}
          maxFarms={maxFarms}
          onClose={() => { setModalOpen(false); setEditingFarm(null) }}
          onSaved={handleSaved}
        />
      )}
      {deletingFarm && (
        <DeleteModal
          farm={deletingFarm}
          onClose={() => setDeletingFarm(null)}
          onDeleted={handleDeleted}
        />
      )}
      {advanceFarm && (
        <GiveAdvanceModal
          farm={advanceFarm}
          onClose={() => setAdvanceFarm(null)}
          onSaved={() => setAdvanceFarm(null)}
        />
      )}
    </div>
  )
}
