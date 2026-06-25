import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, decimals = 2) {
  if (n == null) return '—'
  return Number(n).toFixed(decimals)
}

function fcrRangeLabel(tier) {
  if (tier.fcr_to == null) return `${fmt(tier.fcr_from)} +`
  return `${fmt(tier.fcr_from)} – ${fmt(tier.fcr_to)}`
}

function tierStars(rate) {
  if (rate >= 16) return '★★★'
  if (rate >= 12) return '★★'
  return '★'
}

/** Map rate to a green shade. Higher rate → richer green. */
function tierRowBg(rate, maxRate) {
  if (maxRate === 0) return '#f9fafb'
  const ratio = Math.min(rate / maxRate, 1)
  // interpolate between gray-50 and a vivid green
  const r = Math.round(240 - ratio * (240 - 220))
  const g = Math.round(253 - ratio * (253 - 252))
  const b = Math.round(244 - ratio * (244 - 220))
  // Use fixed palette buckets for readability
  if (ratio >= 0.85) return '#bbf7d0'   // green-200
  if (ratio >= 0.65) return '#d1fae5'   // emerald-100
  if (ratio >= 0.45) return '#ecfdf5'   // emerald-50
  if (ratio >= 0.25) return '#f0fdf4'   // green-50
  return '#f9fafb'                       // gray-50
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onClose, onConfirm, destructive = true, confirmLabel = 'Confirm' }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: destructive ? '#ef4444' : '#f59e0b' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = destructive ? '#dc2626' : '#d97706' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = destructive ? '#ef4444' : '#f59e0b' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tier Form Modal ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  fcr_from: '',
  fcr_to: '',
  noUpperLimit: false,
  rate_per_kg: '',
  description: '',
  is_active: true,
}

function TierFormModal({ initial, onSave, onClose, saving, error }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_FORM
    return {
      fcr_from: initial.fcr_from != null ? String(initial.fcr_from) : '',
      fcr_to: initial.fcr_to != null ? String(initial.fcr_to) : '',
      noUpperLimit: initial.fcr_to == null,
      rate_per_kg: initial.rate_per_kg != null ? String(initial.rate_per_kg) : '',
      description: initial.description || '',
      is_active: initial.is_active ?? true,
    }
  })
  const [localError, setLocalError] = useState('')

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
    setLocalError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    setLocalError('')

    const fcrFrom = parseFloat(form.fcr_from)
    const fcrTo = form.noUpperLimit ? null : parseFloat(form.fcr_to)
    const rate = parseFloat(form.rate_per_kg)

    if (isNaN(fcrFrom) || fcrFrom < 0) {
      setLocalError('FCR From must be 0 or greater.')
      return
    }
    if (!form.noUpperLimit) {
      if (isNaN(fcrTo)) {
        setLocalError('FCR To is required unless "No upper limit" is checked.')
        return
      }
      if (fcrTo <= fcrFrom) {
        setLocalError('FCR To must be greater than FCR From.')
        return
      }
    }
    if (isNaN(rate) || rate <= 0) {
      setLocalError('Rate per kg must be greater than 0.')
      return
    }

    onSave({
      fcr_from: fcrFrom,
      fcr_to: fcrTo,
      rate_per_kg: rate,
      description: form.description.trim() || null,
      is_active: form.is_active,
    })
  }

  const displayError = localError || error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {initial ? 'Edit Tier' : t('growingFees.config.addTier')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition text-xl leading-none"
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* FCR Range row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t('growingFees.config.fcrFrom')} <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 1.50"
                value={form.fcr_from}
                onChange={e => set('fcr_from', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('growingFees.config.fcrTo')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 2.00"
                value={form.noUpperLimit ? '' : form.fcr_to}
                onChange={e => set('fcr_to', e.target.value)}
                disabled={form.noUpperLimit}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
          </div>

          {/* No upper limit toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.noUpperLimit}
              onChange={e => set('noUpperLimit', e.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-400 h-4 w-4"
            />
            <span className="text-sm text-gray-600">
              {t('growingFees.config.noUpperLimit')} <span className="text-gray-400 text-xs">(FCR To becomes open-ended)</span>
            </span>
          </label>

          {/* Rate per kg */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('growingFees.config.ratePerKg')} (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 12.00"
                value={form.rate_per_kg}
                onChange={e => set('rate_per_kg', e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t('common.description')} <span className="text-gray-400">({t('common.optional')})</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Excellent FCR — top bonus tier"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Is Active */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-400 h-4 w-4"
            />
            <span className="text-sm text-gray-600">{t('common.active')}</span>
          </label>

          {/* Error */}
          {displayError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {displayError}
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ backgroundColor: '#f59e0b' }}
              onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#d97706' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f59e0b' }}
            >
              {saving ? t('common.loading') : initial ? 'Update Tier' : t('growingFees.config.addTier')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tier Ladder (right panel) ────────────────────────────────────────────────

function TierLadder({ tiers }) {
  const activeTiers = [...tiers]
    .filter(t => t.is_active)
    .sort((a, b) => a.fcr_from - b.fcr_from)

  const maxRate = activeTiers.length > 0
    ? Math.max(...activeTiers.map(t => Number(t.rate_per_kg)))
    : 0

  if (activeTiers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-center px-4">
        <p className="text-sm font-medium">No active tiers yet.</p>
        <p className="text-xs mt-1">Add tiers and mark them active to see the ladder.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {activeTiers.map((tier, idx) => {
        const rate = Number(tier.rate_per_kg)
        const bg = tierRowBg(rate, maxRate)
        const isTop = idx === 0
        const isLast = tier.fcr_to == null
        const rangeLabel = isLast
          ? `${fmt(tier.fcr_from)}+`
          : `${fmt(tier.fcr_from)} → ${fmt(tier.fcr_to)}`

        return (
          <div
            key={tier.id}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ backgroundColor: bg }}
          >
            {/* Ladder connector visual */}
            <div className="flex flex-col items-center shrink-0" style={{ width: 16 }}>
              {!isTop && (
                <div className="w-px flex-1 bg-gray-300" style={{ minHeight: 8 }} />
              )}
              <div
                className="w-2 h-2 rounded-full border-2 shrink-0"
                style={{ borderColor: '#10b981', backgroundColor: 'white' }}
              />
              {!isLast && (
                <div className="w-px flex-1 bg-gray-300" style={{ minHeight: 8 }} />
              )}
            </div>

            {/* FCR range */}
            <span className="font-mono text-sm text-gray-700 w-32 shrink-0">{rangeLabel}</span>

            {/* Rate */}
            <span
              className="text-sm font-bold shrink-0"
              style={{ color: '#059669', minWidth: 64 }}
            >
              ₹{fmt(tier.rate_per_kg)}/kg
            </span>

            {/* Stars */}
            <span
              className="text-sm shrink-0"
              style={{ color: '#f59e0b', letterSpacing: '0.05em' }}
              title={`${tierStars(rate)} quality tier`}
            >
              {tierStars(rate)}
            </span>

            {/* Description */}
            {tier.description && (
              <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{tier.description}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GrowingFeeSettings() {
  const { organization, userRole } = useAuth()
  const { t } = useTranslation()
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Modal state: null = hidden, { mode: 'add' } | { mode: 'edit', tier } = open
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState(null)

  // ── Load tiers ────────────────────────────────────────────────────────────

  const loadTiers = useCallback(async () => {
    setLoading(true)
    setPageError('')
    const { data, error } = await supabase
      .from('growing_fee_config')
      .select('id, fcr_from, fcr_to, rate_per_kg, description, is_active, created_at')
      .eq('organization_id', organization?.id)
      .order('fcr_from', { ascending: true })
    if (error) {
      setPageError(error.message)
    } else {
      setTiers(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadTiers() }, [loadTiers])

  // Guard — owner only, after all hooks
  if (userRole !== 'owner') return <Navigate to="/dashboard" replace />

  // ── Open / close modal ────────────────────────────────────────────────────

  function openAdd() {
    setSaveError('')
    setModal({ mode: 'add' })
  }

  function openEdit(tier, e) {
    e?.stopPropagation()
    setSaveError('')
    setModal({ mode: 'edit', tier })
  }

  function closeModal() {
    setModal(null)
    setSaveError('')
  }

  // ── Save (add / edit) ─────────────────────────────────────────────────────

  async function handleSave(payload) {
    setSaving(true)
    setSaveError('')

    let error
    if (modal.mode === 'edit') {
      ;({ error } = await supabase
        .from('growing_fee_config')
        .update(payload)
        .eq('id', modal.tier.id))
    } else {
      ;({ error } = await supabase.from('growing_fee_config').insert({ ...payload, organization_id: organization?.id }))
    }

    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setModal(null)
    await loadTiers()
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(tier, e) {
    e?.stopPropagation()

    // Check if this tier has been used in any growing_fee_ledger records
    // Match by rate_per_kg and fcr range boundaries
    let usageQuery = supabase
      .from('growing_fee_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization?.id)
      .eq('rate_per_kg', tier.rate_per_kg)
      .eq('fcr_from', tier.fcr_from)

    if (tier.fcr_to != null) {
      usageQuery = usageQuery.eq('fcr_to', tier.fcr_to)
    } else {
      usageQuery = usageQuery.is('fcr_to', null)
    }

    const { count, error: countError } = await usageQuery

    if (countError) {
      // If the ledger table doesn't exist or another error, just proceed with delete
      if (!countError.message?.toLowerCase().includes('does not exist')) {
        setPageError(countError.message)
        return
      }
    }

    const usedCount = count || 0

    if (usedCount > 0) {
      setConfirmModal({
        title: 'Cannot Delete Tier',
        message: `This tier has been used in ${usedCount} batch ledger record${usedCount !== 1 ? 's' : ''}. It cannot be deleted. You can deactivate it instead.`,
        confirmLabel: 'Deactivate Instead',
        destructive: false,
        onConfirm: async () => {
          setConfirmModal(null)
          await supabase
            .from('growing_fee_config')
            .update({ is_active: false })
            .eq('id', tier.id)
          await loadTiers()
        },
      })
      return
    }

    setConfirmModal({
      title: 'Delete Tier',
      message: `Delete the tier FCR ${fcrRangeLabel(tier)} at ₹${fmt(tier.rate_per_kg)}/kg? This action cannot be undone.`,
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null)
        const { error } = await supabase
          .from('growing_fee_config')
          .delete()
          .eq('id', tier.id)
        if (error) {
          setPageError(error.message)
          return
        }
        await loadTiers()
      },
    })
  }

  // ── Inline active toggle ──────────────────────────────────────────────────

  async function handleToggleActive(tier) {
    await supabase
      .from('growing_fee_config')
      .update({ is_active: !tier.is_active })
      .eq('id', tier.id)
    await loadTiers()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const activeTiersCount = tiers.filter(t => t.is_active).length

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('growingFees.config.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
            {t('growingFees.config.subtitle')}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition shrink-0"
          style={{ backgroundColor: '#f59e0b' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#d97706' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f59e0b' }}
        >
          <span className="text-base leading-none">+</span> {t('growingFees.config.addTier')}
        </button>
      </div>

      {/* Page-level error */}
      {pageError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="shrink-0">&#9888;</span>
          <span>{pageError}</span>
          <button
            onClick={() => setPageError('')}
            className="ml-auto shrink-0 text-red-400 hover:text-red-600 leading-none text-base"
          >
            &times;
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-28">
          <div className="h-9 w-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] items-start">

          {/* ── LEFT: Config Table ──────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">All Tiers</h2>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-500"
                style={{ backgroundColor: '#f3f4f6' }}
              >
                {tiers.length} total · {activeTiersCount} active
              </span>
            </div>

            {tiers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-center px-6">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-sm font-medium text-gray-600">No tiers configured yet.</p>
                <p className="text-xs mt-1">Click "{t('growingFees.config.addTier')}" to create your first growing fee tier.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead>
                    <tr className="bg-gray-50/70">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {t('growingFees.config.fcrRange')}
                      </th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {t('growingFees.config.ratePerKg')}
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t('common.description')}
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t('common.active')}
                      </th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tiers.map(tier => (
                      <TierRow
                        key={tier.id}
                        tier={tier}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onToggleActive={handleToggleActive}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── RIGHT: Tier Ladder ──────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">FCR Performance Tiers</h2>
              <p className="text-xs text-gray-400 mt-0.5">Active tiers · highest rate = greener</p>
            </div>
            <div className="px-0 py-2">
              {/* Legend */}
              {activeTiersCount > 0 && (
                <div className="flex items-center gap-4 px-4 pb-2 border-b border-gray-50 flex-wrap">
                  <span className="text-xs text-gray-500">Stars: </span>
                  <span className="text-xs" style={{ color: '#f59e0b' }}>
                    ★★★ ≥ ₹16/kg
                  </span>
                  <span className="text-xs" style={{ color: '#f59e0b' }}>
                    ★★ ≥ ₹12/kg
                  </span>
                  <span className="text-xs" style={{ color: '#f59e0b' }}>
                    ★ &lt; ₹12/kg
                  </span>
                </div>
              )}
              <TierLadder tiers={tiers} />
            </div>
          </div>

        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <TierFormModal
          initial={modal.mode === 'edit' ? modal.tier : null}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
          error={saveError}
        />
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          destructive={confirmModal.destructive}
          confirmLabel={confirmModal.confirmLabel}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
    </div>
  )
}

// ─── TierRow ──────────────────────────────────────────────────────────────────

function TierRow({ tier, onEdit, onDelete, onToggleActive }) {
  const { t } = useTranslation()
  const isLastTier = tier.fcr_to == null

  return (
    <tr className="hover:bg-amber-50/30 transition-colors">
      {/* FCR Range */}
      <td className="px-5 py-3 whitespace-nowrap">
        <span className="font-mono text-sm font-semibold text-gray-800">
          {fmt(tier.fcr_from)}
        </span>
        <span className="text-gray-400 mx-1 text-sm">–</span>
        {isLastTier ? (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: '#fef3c7', color: '#b45309' }}
          >
            open
          </span>
        ) : (
          <span className="font-mono text-sm font-semibold text-gray-800">{fmt(tier.fcr_to)}</span>
        )}
      </td>

      {/* Rate */}
      <td className="px-5 py-3 whitespace-nowrap text-right">
        <span className="text-sm font-bold" style={{ color: '#059669' }}>
          ₹{fmt(tier.rate_per_kg)} / kg
        </span>
      </td>

      {/* Description */}
      <td className="px-5 py-3 max-w-xs">
        <span className="text-sm text-gray-500 truncate block">
          {tier.description || <span className="text-gray-300 italic">—</span>}
        </span>
      </td>

      {/* Active badge + toggle */}
      <td className="px-5 py-3 text-center">
        <button
          onClick={() => onToggleActive(tier)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer border"
          style={
            tier.is_active
              ? { backgroundColor: '#dcfce7', color: '#15803d', borderColor: '#bbf7d0' }
              : { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }
          }
          title={tier.is_active ? 'Click to deactivate' : 'Click to activate'}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tier.is_active ? '#16a34a' : '#9ca3af' }}
          />
          {tier.is_active ? t('common.active') : t('common.inactive')}
        </button>
      </td>

      {/* Actions */}
      <td className="px-5 py-3 whitespace-nowrap text-right">
        <div className="inline-flex items-center gap-1">
          <button
            onClick={e => onEdit(tier, e)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition"
            title={t('common.edit')}
          >
            ✏️ {t('common.edit')}
          </button>
          <button
            onClick={e => onDelete(tier, e)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition"
            title={t('common.delete')}
          >
            🗑️ {t('common.delete')}
          </button>
        </div>
      </td>
    </tr>
  )
}
