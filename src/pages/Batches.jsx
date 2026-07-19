import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'
import NewBatchModal from '../components/NewBatchModal'

const GROW_OUT_DAYS = 45

function daysElapsed(startDate) {
  const start = new Date(startDate + 'T00:00:00')
  return Math.floor((Date.now() - start.getTime()) / 86400000)
}

function urgency(status, startDate) {
  if (status !== 'active') return 'inactive'
  const e = daysElapsed(startDate)
  if (e > GROW_OUT_DAYS) return 'overdue'
  if (e >= 40)           return 'approaching'
  return 'ok'
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const map = {
    active: 'bg-green-100 text-green-700',
    sold:   'bg-blue-100  text-blue-600',
    closed: 'bg-gray-100  text-gray-500',
  }
  const labelMap = {
    active: t('batches.status.active'),
    sold:   t('batches.status.sold'),
    closed: t('batches.status.closed'),
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${map[status] ?? map.closed}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

// ─── Day badge ────────────────────────────────────────────────────────────────

function DayBadge({ status, startDate }) {
  const { t } = useTranslation()
  if (status !== 'active') return <span className="text-gray-400 text-sm">—</span>

  const elapsed  = daysElapsed(startDate)
  const u        = urgency(status, startDate)
  const bg    = u === 'overdue' ? '#fef2f2' : u === 'approaching' ? '#fffbeb' : '#f0fdf4'
  const color = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : '#15803d'

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold"
      style={{ backgroundColor: bg, color }}>
      {u === 'overdue'     && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />}
      {u === 'approaching' && '⚠️ '}
      {t('batches.dayCount', { day: elapsed })}
    </span>
  )
}

// ─── Harvest status label ─────────────────────────────────────────────────────

function HarvestLabel({ status, startDate }) {
  const { t } = useTranslation()
  if (status !== 'active') return <span className="text-gray-400 text-xs">—</span>
  const elapsed   = daysElapsed(startDate)
  const daysLeft  = GROW_OUT_DAYS - elapsed
  const u         = urgency(status, startDate)
  const color     = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : '#6b7280'
  const label     = u === 'overdue'
    ? `${Math.abs(daysLeft)}d overdue`
    : t('batches.daysToHarvest', { days: daysLeft })
  return <span className="text-xs font-semibold" style={{ color }}>{label}</span>
}

// ─── Mark as sold confirmation ────────────────────────────────────────────────

function SoldModal({ batch, onClose, onSaved }) {
  const { organization } = useAuth()
  const { t, i18n } = useTranslation()
  const [mortality,   setMortality]   = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [salesCount,  setSalesCount]  = useState(null) // null = loading

  useEffect(() => {
    supabase.from('sales').select('id', { count: 'exact', head: true }).eq('batch_id', batch.id)
      .then(({ count }) => setSalesCount(count ?? 0))
  }, [batch.id])

  async function handleConfirm() {
    if (salesCount === 0) {
      setError('Cannot mark as sold — record at least one sale for this batch first.')
      return
    }
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('batches')
      .update({
        status:          'sold',
        mortality_count: mortality !== '' ? Number(mortality) : 0,
        sold_at:         today,
      })
      .eq('id', batch.id)
      .eq('organization_id', organization?.id)

    if (error) { setError(error.message); setSaving(false) }
    else        { onSaved() }
  }

  const loadingSales = salesCount === null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{t('batches.markAsSold')}</h2>
        <p className="text-sm text-gray-600 mb-4">
          {t('sales.batch')} at <span className="font-semibold">{batch.farms?.name}</span> · started {formatDate(batch.start_date, i18n.language)}
        </p>

        {/* Sales check banner */}
        {!loadingSales && salesCount === 0 && (
          <div className="mb-4 rounded-lg px-3 py-2 bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
            ⚠ {t('sales.noSales')}. Record at least one sale before marking as sold.
          </div>
        )}
        {!loadingSales && salesCount > 0 && (
          <div className="mb-4 rounded-lg px-3 py-2 bg-green-50 border border-green-200 text-sm text-green-700">
            ✓ {salesCount} sale{salesCount > 1 ? 's' : ''} recorded
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('batches.mortality')} <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="number" min="0" max={batch.chick_count}
            value={mortality} onChange={e => setMortality(e.target.value)}
            placeholder="0 birds lost"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {mortality !== '' && Number(mortality) > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Survival rate: {(((batch.chick_count - Number(mortality)) / batch.chick_count) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || loadingSales || salesCount === 0}
            className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
          >
            {saving ? t('common.loading') : t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Batches() {
  const navigate = useNavigate()
  const location = useLocation()
  const { organization, canEdit } = useAuth()
  const { t, i18n } = useTranslation()
  const { currentStep, stepDone } = useOnboarding()
  const [batches, setBatches]       = useState([])
  const [farms, setFarms]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [newModal, setNewModal]     = useState(false)
  const [newModalFarmId, setNewModalFarmId] = useState(null)
  const [soldBatch, setSoldBatch]   = useState(null)
  const [filter, setFilter]         = useState('active') // 'all' | 'active' | 'sold' | 'closed'
  const [sort, setSort]             = useState('chicks') // 'chicks' | 'days'

  async function fetchData() {
    setLoading(true)
    const [{ data: batchData }, { data: farmData }] = await Promise.all([
      supabase
        .from('batches')
        .select('*, farms(name), sold_at, closed_at')
        .eq('organization_id', organization?.id)
        .order('start_date', { ascending: false }),
      supabase.from('farms').select('id, name').eq('organization_id', organization?.id).order('name'),
    ])
    setBatches(batchData || [])
    setFarms(farmData || [])
    setLoading(false)
  }

  useEffect(() => { if (organization?.id) fetchData() }, [organization?.id])

  // Open new-batch modal pre-selected if navigated from Farms page
  useEffect(() => {
    if (location.state?.openNew) {
      setNewModalFarmId(location.state.farmId ?? null)
      setNewModal(true)
      window.history.replaceState({}, '')
    }
  }, [])

  const counts = {
    all:    batches.length,
    active: batches.filter(b => b.status === 'active').length,
    sold:   batches.filter(b => b.status === 'sold').length,
    closed: batches.filter(b => b.status === 'closed').length,
  }

  const visible = (filter === 'all' ? batches : batches.filter(b => b.status === filter))
    .slice()
    .sort((a, b) =>
      sort === 'days'
        ? daysElapsed(b.start_date) - daysElapsed(a.start_date)       // most urgent first
        : Number(b.chick_count || 0) - Number(a.chick_count || 0)     // most chicks first
    )

  const overdueCount = batches.filter(b => urgency(b.status, b.start_date) === 'overdue').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('batches.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all your grow-out cycles</p>
        </div>
        {canEdit && (
          <button
            data-tour="batch"
            onClick={() => setNewModal(true)}
            disabled={farms.length === 0}
            title={farms.length === 0 ? 'Add a farm first' : ''}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> {t('batches.startBatch')}
          </button>
        )}
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2"
          style={{ backgroundColor: '#fef2f2', borderLeft: '4px solid #dc2626' }}>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
          <span className="text-sm font-bold text-red-700">
            {overdueCount} batch{overdueCount > 1 ? 'es' : ''} {t('batches.overdue')} — {t('batches.overdueMessage')}
          </span>
        </div>
      )}

      {/* Filter + Sort bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: 'all',    label: `${t('batches.filterAll')} (${counts.all})` },
            { key: 'active', label: `${t('batches.filterActive')} (${counts.active})` },
            { key: 'sold',   label: `${t('batches.filterSold')} (${counts.sold})` },
            { key: 'closed', label: `${t('batches.status.closed')} (${counts.closed})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition border ${
                filter === key
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <span className="text-xs text-gray-400 px-2 font-medium">Sort:</span>
          {[
            { key: 'chicks', label: '🐣 Chicks' },
            { key: 'days',   label: '📅 Days' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                sort === key
                  ? 'bg-amber-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">🐣</span>
            <p className="text-sm font-medium">{t('batches.noBatches')}</p>
            <p className="text-xs mt-1">
              {filter !== 'all' ? 'Try switching the filter above' : 'Click "New Batch" to start one'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">Farm</th>
                <th className="px-5 py-3">{t('batches.startDate')}</th>
                {filter === 'sold'   && <th className="px-5 py-3">Sold On</th>}
                {filter === 'closed' && <th className="px-5 py-3">Closed On</th>}
                <th className="px-5 py-3 text-right">{t('batches.chickCount')}</th>
                <th className="px-5 py-3 text-center">Day</th>
                <th className="px-5 py-3 text-center">Harvest</th>
                <th className="px-5 py-3 text-center">{t('common.status')}</th>
                <th className="px-5 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody data-tour="distribution" className="divide-y divide-gray-50">
              {visible.map(batch => {
                const u = urgency(batch.status, batch.start_date)
                const borderColor = u === 'overdue' ? '#dc2626' : u === 'approaching' ? '#d97706' : u === 'ok' ? '#15803d' : 'transparent'
                return (
                  <tr
                    key={batch.id}
                    className="hover:bg-amber-50/40 transition cursor-pointer"
                    style={{ borderLeft: `4px solid ${borderColor}` }}
                    onClick={() => navigate(`/farms/${batch.farm_id}/batches/${batch.id}`)}
                  >
                    <td className="px-5 py-4 font-medium text-gray-800">
                      {batch.farms?.name ?? '—'}
                    </td>
                    <td className="px-5 py-4 text-gray-600">
                      {formatDate(batch.start_date, i18n.language)}
                    </td>
                    {filter === 'sold'   && <td className="px-5 py-4 text-gray-600">{batch.sold_at   ? formatDate(batch.sold_at, i18n.language)   : '—'}</td>}
                    {filter === 'closed' && <td className="px-5 py-4 text-gray-600">{batch.closed_at ? formatDate(batch.closed_at, i18n.language) : '—'}</td>}
                    <td className="px-5 py-4 text-right text-gray-700 font-medium">
                      {Number(batch.chick_count).toLocaleString('en-IN')}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <DayBadge status={batch.status} startDate={batch.start_date} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <HarvestLabel status={batch.status} startDate={batch.start_date} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusBadge status={batch.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-2" onClick={e => e.stopPropagation()}>
                        {batch.status === 'active' ? (
                          canEdit && (
                            <button
                              onClick={() => setSoldBatch(batch)}
                              className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 transition"
                            >
                              {t('batches.markAsSold')}
                            </button>
                          )
                        ) : (
                          <Link
                            to={`/batches/${batch.id}/report`}
                            className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 transition"
                          >
                            {t('common.view')} Report
                          </Link>
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

      {/* Modals */}
      {newModal && (
        <NewBatchModal
          farms={farms}
          initialFarmId={newModalFarmId}
          onClose={() => { setNewModal(false); setNewModalFarmId(null) }}
          onSaved={() => { setNewModal(false); setNewModalFarmId(null); fetchData(); if (currentStep?.id === 'batch') stepDone('batch') }}
        />
      )}
      {soldBatch && (
        <SoldModal
          batch={soldBatch}
          onClose={() => setSoldBatch(null)}
          onSaved={() => { setSoldBatch(null); fetchData() }}
        />
      )}
    </div>
  )
}
