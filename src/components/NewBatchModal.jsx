import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { ledgerIn, ledgerOut, getChickBalance, getProcurementLots } from '../lib/stockLedger'
import { formatCurrency, roundCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'

function fmtQty(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }

/**
 * Shared "Start New Batch" modal used by Farms page.
 *
 * Props:
 *   farmId        — when set, hides the farm dropdown and checks farm capacity
 *   farms         — array of farm objects for the dropdown (Batches page)
 *   initialFarmId — pre-select a farm in the dropdown
 *   onClose / onSaved
 */
export default function NewBatchModal({ farmId, farms = [], initialFarmId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const fixedFarm = !!farmId

  const [form, setForm] = useState({
    farm_id:    farmId ?? initialFarmId ?? farms[0]?.id ?? '',
    chick_count: '',
    start_date:  new Date().toISOString().slice(0, 10),
  })

  const [chickBalance,  setChickBalance]  = useState(null)
  const [capacity,      setCapacity]      = useState(null)
  const [liveChicks,    setLiveChicks]    = useState(0)
  const [chickLots,     setChickLots]     = useState([])  // procurement lots with remaining > 0
  const [lotAllocs,     setLotAllocs]     = useState({})  // { [procId]: number }
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    async function load() {
      const queries = [getChickBalance(organization?.id)]
      if (fixedFarm) {
        queries.push(
          supabase.from('farms').select('capacity').eq('id', farmId).eq('organization_id', organization?.id).single(),
          supabase.from('batches').select('chick_count, mortality_count').eq('farm_id', farmId).eq('organization_id', organization?.id).eq('status', 'active'),
        )
      }
      const [balance, farmRes, batchRes] = await Promise.all(queries)
      setChickBalance(balance)
      if (fixedFarm) {
        setCapacity(farmRes?.data?.capacity ?? null)
        setLiveChicks((batchRes?.data || []).reduce(
          (s, b) => s + Math.max(0, Number(b.chick_count || 0) - Number(b.mortality_count || 0)), 0
        ))
      }

      // Fetch chick procurement lots
      const lots = await getProcurementLots({ itemName: 'Chicks', organizationId: organization?.id })
      setChickLots(lots.filter(l => l.remaining > 0))
    }
    load()
  }, [farmId])

  function set(field) { return e => setForm(prev => ({ ...prev, [field]: e.target.value })) }

  function goToProcurement() {
    onClose()
    navigate('/procurement', { state: { openModal: true } })
  }

  const chickCount    = Number(form.chick_count) || 0
  const shortfall     = chickBalance !== null ? Math.max(0, chickCount - chickBalance) : 0
  const needsPurchase = chickBalance !== null && chickCount > 0 && chickBalance < chickCount
  const remaining     = fixedFarm && capacity != null ? Math.max(0, capacity - liveChicks) : null
  const multiLot      = chickLots.length > 1
  const allocTotal    = Object.values(lotAllocs).reduce((s, v) => s + Number(v || 0), 0)
  const allocMatches  = chickCount > 0 && Math.abs(allocTotal - chickCount) < 0.5

  // Recompute FIFO when chick_count or lots change
  useEffect(() => {
    if (!chickLots.length || chickCount <= 0) { setLotAllocs({}); return }
    const allocs = {}
    let rem = chickCount
    for (const lot of chickLots) {
      const take = Math.min(lot.remaining, rem)
      if (take > 0) { allocs[lot.id] = Math.round(take); rem -= take }
      if (rem <= 0) break
    }
    setLotAllocs(allocs)
  }, [chickCount, chickLots])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (remaining !== null && chickCount > remaining) {
      setError(`Exceeds farm capacity. Only ${remaining.toLocaleString('en-IN')} spots available.`)
      return
    }
    if (needsPurchase) {
      setError(`Not enough chicks in stock. Add ${shortfall.toLocaleString('en-IN')} more via Procurement first.`)
      return
    }
    if (multiLot && !allocMatches) {
      setError(`Lot allocation must total ${chickCount.toLocaleString('en-IN')} chicks. Currently: ${allocTotal.toLocaleString('en-IN')}`)
      return
    }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    // Create batch
    const { data: inserted, error: batchErr } = await supabase.from('batches').insert({
      organization_id: organization?.id,
      farm_id:         form.farm_id,
      chick_count:     chickCount,
      start_date:      form.start_date,
      status:          'active',
      created_by_id:   user?.id,
      created_by_name: userName,
    }).select('id').single()

    if (batchErr) { setError(batchErr.message); setSaving(false); return }

    // Build per-lot allocation rows (include each lot's actual cost_per_unit)
    const lotCostMap = Object.fromEntries(chickLots.map(l => [l.id, l.costPerUnit]))
    const allocRows = multiLot
      ? Object.entries(lotAllocs).filter(([, qty]) => Number(qty) > 0).map(([id, qty]) => ({ procId: id, qty: Number(qty), cpu: lotCostMap[id] ?? 0 }))
      : [{ procId: chickLots[0]?.id || null, qty: chickCount, cpu: chickLots[0]?.costPerUnit ?? 0 }]

    // Insert one batch_chick_purchases row per lot using that lot's actual cost_per_unit
    for (const { procId, qty, cpu } of allocRows) {
      const { error: cpErr } = await supabase.from('batch_chick_purchases').insert({
        organization_id: organization?.id,
        batch_id:        inserted.id,
        quantity:        qty,
        price_per_chick: roundCurrency(cpu),
        total_cost:      roundCurrency(qty * cpu),
        source:          'stock',
        procurement_id:  procId,
        notes:           procId ? null : 'Drawn from existing stock',
      })
      if (cpErr) console.error('batch_chick_purchases insert failed:', cpErr.message)
    }

    // Deduct from stock ledger (total)
    await ledgerOut({
      itemName: 'Chicks', itemType: 'chicks',
      quantity: chickCount, unit: 'birds',
      referenceType: 'batch', referenceId: inserted.id,
      date: form.start_date, organizationId: organization?.id,
    })

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('batches.startBatch')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Farm dropdown */}
          {!fixedFarm && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Farm *</label>
              <select required value={form.farm_id} onChange={set('farm_id')} className={inputCls + ' bg-white'}>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          {/* Chick count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.chickCount')} *</label>
            <input required type="number" min="1"
              value={form.chick_count} onChange={set('chick_count')}
              placeholder="e.g. 3000" className={inputCls}
            />

            {chickBalance !== null && (
              chickBalance === 0 ? (
                <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⚠</span>
                    <p className="text-xs font-medium text-amber-700">No chicks in stock</p>
                  </div>
                  <button type="button" onClick={goToProcurement}
                    className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition">
                    Add Procurement
                  </button>
                </div>
              ) : needsPurchase ? (
                <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⚠</span>
                    <p className="text-xs font-medium text-amber-700">
                      {chickBalance.toLocaleString('en-IN')} in stock — {shortfall.toLocaleString('en-IN')} more needed
                    </p>
                  </div>
                  <button type="button" onClick={goToProcurement}
                    className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition">
                    Add Procurement
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-green-600">
                    ✓ {chickBalance.toLocaleString('en-IN')} chicks available in stock
                  </p>
                  <button type="button" onClick={goToProcurement}
                    className="shrink-0 rounded-lg border border-amber-300 hover:bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition">
                    + Add More Procurement
                  </button>
                </div>
              )
            )}

            {remaining !== null && (
              <p className={`text-xs mt-1 font-medium ${remaining === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {remaining === 0
                  ? '⚠ Farm is at full capacity'
                  : `Farm capacity remaining: ${remaining.toLocaleString('en-IN')} birds`}
              </p>
            )}
          </div>

          {/* Per-lot chick allocation — only when multiple lots */}
          {multiLot && chickCount > 0 && !needsPurchase && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-indigo-700">Allocate chicks from procurement lots (FIFO pre-filled):</p>
              {chickLots.map(lot => (
                <div key={lot.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {formatDate(lot.date, i18n.language)}
                      {lot.supplier && ` — ${lot.supplier}`}
                    </p>
                    <p className="text-xs text-gray-400">
                      {lot.invoice && `${lot.invoice} · `}{fmtQty(lot.remaining)} birds available
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number" min="0" max={lot.remaining} step="1"
                      value={lotAllocs[lot.id] ?? ''}
                      onChange={e => setLotAllocs(prev => ({ ...prev, [lot.id]: parseInt(e.target.value) || 0 }))}
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <span className="text-xs text-gray-400 whitespace-nowrap">birds</span>
                  </div>
                </div>
              ))}
              <div className={`text-xs font-semibold pt-1 border-t border-indigo-200 ${allocMatches ? 'text-green-600' : 'text-red-500'}`}>
                Total allocated: {allocTotal.toLocaleString('en-IN')} / {chickCount.toLocaleString('en-IN')} chicks
                {allocMatches ? ' ✓' : ' — must match chick count above'}
              </div>
            </div>
          )}
          {!multiLot && chickLots.length === 1 && chickCount > 0 && !needsPurchase && (
            <p className="text-xs text-gray-400">
              Chicks will be drawn from: {formatDate(chickLots[0].date, i18n.language)}
              {chickLots[0].supplier && ` (${chickLots[0].supplier})`}
              {chickLots[0].invoice && ` · ${chickLots[0].invoice}`}
              {' '}— {fmtQty(chickLots[0].remaining)} birds available
            </p>
          )}

          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('batches.startDate')} *</label>
            <input required type="date" value={form.start_date} onChange={set('start_date')} className={inputCls} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || chickBalance === null}
              className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving || chickBalance === null ? t('common.loading') : t('batches.startBatch')}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
