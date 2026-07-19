import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { ledgerOut, getProcurementLots } from '../lib/stockLedger'
import { roundCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'

function fmtDate(d, lang = 'en') { return formatDate(d, lang) }
function fmtQty(n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 }) }

const blankLine = () => ({
  typeId:      '',
  items:       [],
  item_id:     '',
  canonCount:  '',
  subCount:    '',
  notes:       '',
  procLots:    [],
  lotAllocs:   {},
  lotsLoading: false,
})

function computeFIFO(canonCount, subCount, lots, item) {
  const isBag    = item?.unit === 'Bag'    && Number(item?.kg_per_unit) > 0
  const isBottle = item?.unit === 'Bottle' && Number(item?.ml_per_unit) > 0
  const factor   = isBag ? Number(item.kg_per_unit) : isBottle ? Number(item.ml_per_unit) : 1
  const qty      = (isBag || isBottle)
    ? (parseFloat(canonCount) || 0) + (parseFloat(subCount) || 0) / factor
    : (parseFloat(canonCount) || 0)
  if (!qty || !lots.length) return {}
  const allocs = {}
  let rem = qty
  for (const lot of lots) {
    const take = Math.min(lot.remaining, rem)
    if (take > 0) { allocs[lot.id] = take; rem -= take }
    if (rem <= 0) break
  }
  return allocs
}

function lineCanonQty(ln) {
  const item     = ln.items.find(i => i.id === ln.item_id)
  const isBag    = item?.unit === 'Bag'    && Number(item?.kg_per_unit) > 0
  const isBottle = item?.unit === 'Bottle' && Number(item?.ml_per_unit) > 0
  const factor   = isBag ? Number(item.kg_per_unit) : isBottle ? Number(item.ml_per_unit) : 1
  return (isBag || isBottle)
    ? (parseFloat(ln.canonCount) || 0) + (parseFloat(ln.subCount) || 0) / factor
    : (parseFloat(ln.canonCount) || 0)
}

export default function DistributionModal({ farmId, initialBatchId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t, i18n } = useTranslation()

  const [stock,          setStock]          = useState([])
  const [activeBatches,  setActiveBatches]  = useState([])
  const [batchId,        setBatchId]        = useState(initialBatchId || '')
  const [batchesLoading, setBatchesLoading] = useState(true)
  const [itemTypes,      setItemTypes]      = useState([])
  const [date,           setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [lines,          setLines]          = useState([blankLine()])
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!organization?.id) return

    supabase.from('stock').select('*').eq('organization_id', organization.id)
      .then(({ data }) => setStock(data || []))

    supabase.from('batches')
      .select('id, start_date, chick_count')
      .eq('farm_id', farmId).eq('organization_id', organization?.id).eq('status', 'active')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        const list = data || []
        setActiveBatches(list)
        if (list.length === 1 && !initialBatchId) setBatchId(list[0].id)
        setBatchesLoading(false)
      })

    supabase.from('item_types')
      .select('id, name').eq('is_distributable', true).eq('organization_id', organization?.id).order('name')
      .then(async ({ data }) => {
        const types = data || []
        setItemTypes(types)
        if (!types.length) return
        // Seed first line with first type + first item + lots
        const firstType = types[0]
        const { data: itemData } = await supabase.from('items')
          .select('id, name, unit, kg_per_unit, ml_per_unit')
          .eq('item_type_id', firstType.id).eq('is_active', true)
          .eq('organization_id', organization?.id).order('name')
        const items = itemData || []
        const firstId = items[0]?.id || ''
        const lots = firstId
          ? (await getProcurementLots({ itemId: firstId, organizationId: organization?.id })).filter(l => l.remaining > 0)
          : []
        setLines([{ ...blankLine(), typeId: firstType.id, items, item_id: firstId, procLots: lots }])
      })
  }, [farmId, organization?.id])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function patchLine(i, patch) {
    setLines(prev => prev.map((ln, idx) => idx === i ? { ...ln, ...patch } : ln))
  }

  async function fetchItems(typeId) {
    if (!typeId) return []
    const { data } = await supabase.from('items')
      .select('id, name, unit, kg_per_unit, ml_per_unit')
      .eq('item_type_id', typeId).eq('is_active', true).eq('organization_id', organization?.id).order('name')
    return data || []
  }

  async function fetchLots(itemId) {
    if (!itemId) return []
    return (await getProcurementLots({ itemId, organizationId: organization?.id })).filter(l => l.remaining > 0)
  }

  // ── Line event handlers ───────────────────────────────────────────────────
  async function handleTypeChange(i, typeId) {
    patchLine(i, { typeId, items: [], item_id: '', procLots: [], lotAllocs: {}, canonCount: '', subCount: '', lotsLoading: true })
    const items  = await fetchItems(typeId)
    const firstId = items[0]?.id || ''
    const lots   = await fetchLots(firstId)
    patchLine(i, { items, item_id: firstId, procLots: lots, lotAllocs: {}, lotsLoading: false })
  }

  async function handleItemChange(i, itemId) {
    patchLine(i, { item_id: itemId, procLots: [], lotAllocs: {}, canonCount: '', subCount: '', lotsLoading: true })
    const lots = await fetchLots(itemId)
    patchLine(i, { procLots: lots, lotAllocs: {}, lotsLoading: false })
  }

  function handleQtyChange(i, field, value) {
    setLines(prev => prev.map((ln, idx) => {
      if (idx !== i) return ln
      const next   = { ...ln, [field]: value }
      const item   = next.items.find(it => it.id === next.item_id)
      next.lotAllocs = computeFIFO(next.canonCount, next.subCount, next.procLots, item)
      return next
    }))
  }

  async function addLine() {
    const firstType = itemTypes[0]
    if (!firstType) { setLines(prev => [...prev, blankLine()]); return }
    const items   = await fetchItems(firstType.id)
    const firstId = items[0]?.id || ''
    const lots    = await fetchLots(firstId)
    setLines(prev => [...prev, { ...blankLine(), typeId: firstType.id, items, item_id: firstId, procLots: lots }])
  }

  function removeLine(i) {
    setLines(prev => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()
    if (!batchId && activeBatches.length > 0) { setError('Select a batch'); return }
    setError('')

    // Validate all lines using a running stock map so same-item duplicates catch correctly
    const stockMap = {}
    stock.forEach(s => { stockMap[s.id] = Number(s.quantity) })

    for (let i = 0; i < lines.length; i++) {
      const ln         = lines[i]
      const item       = ln.items.find(it => it.id === ln.item_id)
      if (!item) { setError(`Item ${i + 1}: select an item`); return }

      const stockRow   = stock.find(s => s.item_name.toLowerCase() === item.name.toLowerCase())
      const available  = stockRow ? (stockMap[stockRow.id] ?? Number(stockRow.quantity)) : 0
      const canonQty   = lineCanonQty(ln)
      const multiLot   = ln.procLots.length > 1
      const allocTotal = Object.values(ln.lotAllocs).reduce((s, v) => s + Number(v || 0), 0)

      if (available <= 0) { setError(`Item ${i + 1}: ${item.name} is out of stock`); return }
      if (canonQty <= 0)  { setError(`Item ${i + 1}: enter a valid quantity`); return }
      if (canonQty > available) {
        const isBag    = item.unit === 'Bag'    && Number(item?.kg_per_unit) > 0
        const isBottle = item.unit === 'Bottle' && Number(item?.ml_per_unit) > 0
        const label    = item.unit
        setError(`Item ${i + 1}: only ${available.toLocaleString('en-IN')} ${label} available for ${item.name}`)
        return
      }
      if (multiLot && Math.abs(allocTotal - canonQty) >= 0.001) {
        setError(`Item ${i + 1}: lot allocation must total ${fmtQty(canonQty)} ${item.unit}. Currently ${fmtQty(allocTotal)}`)
        return
      }

      // Reserve for next-line checks
      if (stockRow) stockMap[stockRow.id] = available - canonQty
    }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    // Track stock deductions for same-item lines
    const stockDeductions = {}

    for (let i = 0; i < lines.length; i++) {
      const ln         = lines[i]
      const item       = ln.items.find(it => it.id === ln.item_id)
      const stockRow   = stock.find(s => s.item_name.toLowerCase() === item.name.toLowerCase())
      const typeName   = itemTypes.find(t => t.id === ln.typeId)?.name?.toLowerCase() || ''
      const canonQty   = lineCanonQty(ln)
      const multiLot   = ln.procLots.length > 1

      const allocRows  = multiLot
        ? Object.entries(ln.lotAllocs).filter(([, qty]) => Number(qty) > 0).map(([id, qty]) => {
            const lot = ln.procLots.find(l => l.id === id)
            return { procId: id, qty: Number(qty), costPerUnit: lot?.costPerUnit || 0, extraExpensePerUnit: lot?.extraExpensePerUnit || 0 }
          })
        : [{ procId: ln.procLots[0]?.id || null, qty: canonQty, costPerUnit: ln.procLots[0]?.costPerUnit || 0, extraExpensePerUnit: ln.procLots[0]?.extraExpensePerUnit || 0 }]

      let anyFailed = false
      for (const { procId, qty, costPerUnit, extraExpensePerUnit } of allocRows) {
        const { data: dist, error: distErr } = await supabase.from('distributions').insert({
          farm_id: farmId, batch_id: batchId || null, stock_id: stockRow?.id || null,
          item_name: item.name, type: typeName, quantity: qty, unit: item.unit,
          date, notes: ln.notes.trim() || null,
          organization_id: organization?.id, procurement_id: procId,
          created_by_id: user?.id, created_by_name: userName,
        }).select('id').single()

        if (distErr) { anyFailed = true; continue }

        await ledgerOut({
          itemName: item.name, itemType: typeName, quantity: qty, unit: item.unit,
          referenceType: 'distribution', referenceId: dist.id,
          date, organizationId: organization?.id,
        })

        await supabase.from('farm_expenses').insert({
          farm_id: farmId, batch_id: batchId || null, distribution_id: dist.id,
          item_name: item.name, item_type: typeName,
          quantity: qty, unit: item.unit,
          cost_per_unit: costPerUnit, total_cost: roundCurrency(qty * costPerUnit),
          extra_cost_per_unit: extraExpensePerUnit,
          extra_total_cost: extraExpensePerUnit > 0 ? roundCurrency(qty * extraExpensePerUnit) : 0,
          date, organization_id: organization?.id,
          created_by_id: user?.id, created_by_name: userName,
        })
      }

      if (anyFailed) { setError(`Item ${i + 1}: some records failed to save`); setSaving(false); return }

      // Update central stock (account for same-item multiple lines)
      if (stockRow) {
        const alreadyDeducted = stockDeductions[stockRow.id] || 0
        const newQty = Math.max(0, Number(stockRow.quantity) - alreadyDeducted - canonQty)
        await supabase.from('stock').update({ quantity: newQty })
          .eq('id', stockRow.id).eq('organization_id', organization?.id)
        stockDeductions[stockRow.id] = alreadyDeducted + canonQty
      }

      // Update farm-level stock
      const { data: fsCurrent } = await supabase.from('farm_stock')
        .select('id, quantity_on_hand').eq('farm_id', farmId)
        .eq('organization_id', organization?.id).eq('item_name', item.name).maybeSingle()
      if (fsCurrent) {
        await supabase.from('farm_stock')
          .update({ quantity_on_hand: Number(fsCurrent.quantity_on_hand) + canonQty, updated_at: new Date().toISOString() })
          .eq('id', fsCurrent.id)
      } else {
        await supabase.from('farm_stock').insert({
          farm_id: farmId, item_name: item.name,
          unit: item.unit, quantity_on_hand: canonQty, organization_id: organization?.id,
        })
      }
    }

    onSaved()
  }

  const inputCls    = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400'
  const hasNoBatches = !batchesLoading && activeBatches.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('farms.recordDistribution')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Batch */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('sales.batch')} *</label>
            {batchesLoading ? (
              <p className="text-xs text-gray-400 py-2">{t('common.loading')}</p>
            ) : hasNoBatches ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                ⚠ {t('distributions.noActiveBatch')}. Start a batch first before recording a distribution.
              </div>
            ) : activeBatches.length === 1 ? (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
                {t('sales.batch')} started {fmtDate(activeBatches[0].start_date, i18n.language)} — {Number(activeBatches[0].chick_count).toLocaleString('en-IN')} chicks
              </div>
            ) : (
              <select value={batchId} onChange={e => setBatchId(e.target.value)} className={inputCls}>
                <option value="">— Select a batch —</option>
                {activeBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {t('sales.batch')} started {fmtDate(b.start_date, i18n.language)} — {Number(b.chick_count).toLocaleString('en-IN')} chicks
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date — shared across all items */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>

          {/* Item lines */}
          <div className={`space-y-3 ${hasNoBatches ? 'opacity-40 pointer-events-none' : ''}`}>
            {lines.map((ln, i) => {
              const item         = ln.items.find(it => it.id === ln.item_id)
              const stockRow     = item ? stock.find(s => s.item_name.toLowerCase() === item.name.toLowerCase()) : null
              const isBag        = item?.unit === 'Bag'    && Number(item?.kg_per_unit) > 0
              const isBottle     = item?.unit === 'Bottle' && Number(item?.ml_per_unit) > 0
              const hasSubUnit   = isBag || isBottle
              const subLabel     = isBag ? 'KG' : isBottle ? 'ml' : ''
              const canonLabel   = item?.unit ?? 'units'
              const factor       = isBag ? Number(item.kg_per_unit) : isBottle ? Number(item.ml_per_unit) : 1
              const canonQty     = lineCanonQty(ln)
              const totalSubEquiv = canonQty > 0 ? canonQty * factor : null
              const availableQty = stockRow ? Number(stockRow.quantity) : 0
              const multiLot     = ln.procLots.length > 1
              const allocTotal   = Object.values(ln.lotAllocs).reduce((s, v) => s + Number(v || 0), 0)
              const allocMatches = canonQty > 0 && Math.abs(allocTotal - canonQty) < 0.001

              return (
                <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                  {/* Line header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {i + 1}</span>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        className="text-xs font-medium text-gray-400 hover:text-red-500 transition">Remove</button>
                    )}
                  </div>

                  {/* Type + Item */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('procurement.itemType')} *</label>
                      <select value={ln.typeId} onChange={e => handleTypeChange(i, e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                        {itemTypes.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t('distributions.selectItem')} *</label>
                      {ln.lotsLoading && !ln.items.length ? (
                        <p className="text-xs text-gray-400 py-2">{t('common.loading')}</p>
                      ) : ln.items.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No items for this type.</p>
                      ) : (
                        <select value={ln.item_id} onChange={e => handleItemChange(i, e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                          {ln.items.map(it => {
                            const s = stock.find(st => st.item_name.toLowerCase() === it.name.toLowerCase())
                            const qty = s ? Number(s.quantity) : 0
                            return (
                              <option key={it.id} value={it.id}>
                                {it.name} — {qty > 0 ? `${qty.toLocaleString('en-IN')} ${s.unit} avail` : 'out of stock'}
                              </option>
                            )
                          })}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Stock status */}
                  {item && availableQty <= 0 && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <span className="text-red-500 text-sm">✕</span>
                      <p className="text-xs font-medium text-red-700">{item.name} is out of stock</p>
                    </div>
                  )}
                  {item && availableQty > 0 && (
                    <p className="text-xs font-medium text-green-600">
                      ✓ {availableQty.toLocaleString('en-IN')} {canonLabel} available
                      {hasSubUnit && ` (${(availableQty * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`}
                    </p>
                  )}

                  {/* Quantity */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Quantity *</label>
                    {hasSubUnit ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <input type="number" min="0" step="1" value={ln.canonCount}
                              onChange={e => handleQtyChange(i, 'canonCount', e.target.value)}
                              placeholder="0" className={inputCls + ' pr-12'} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">{canonLabel}</span>
                          </div>
                          <div className="relative">
                            <input type="number" min="0" step="any" value={ln.subCount}
                              onChange={e => handleQtyChange(i, 'subCount', e.target.value)}
                              placeholder="0" className={inputCls + ' pr-10'} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">{subLabel}</span>
                          </div>
                        </div>
                        {canonQty > 0 && (
                          <p className="text-xs mt-1 text-gray-500">
                            Total = {canonQty % 1 === 0 ? canonQty : canonQty.toFixed(3)} {canonLabel}
                            {' '}({totalSubEquiv?.toLocaleString('en-IN', { maximumFractionDigits: 1 })} {subLabel})
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="relative">
                        <input type="number" min="0.01" step="any" value={ln.canonCount}
                          onChange={e => handleQtyChange(i, 'canonCount', e.target.value)}
                          placeholder={`e.g. 5 ${canonLabel}`} className={inputCls + ' pr-16'} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">{canonLabel}</span>
                      </div>
                    )}
                  </div>

                  {/* FIFO lot allocation */}
                  {!ln.lotsLoading && multiLot && canonQty > 0 && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2.5">
                      <p className="text-xs font-semibold text-indigo-700">Allocate from procurement lots (FIFO pre-filled):</p>
                      {ln.procLots.map(lot => (
                        <div key={lot.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 truncate">
                              {fmtDate(lot.date, i18n.language)}{lot.supplier && ` — ${lot.supplier}`}
                            </p>
                            <p className="text-xs text-gray-400">
                              {lot.invoice && `${lot.invoice} · `}{fmtQty(lot.remaining)} {lot.unit} available
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input type="number" min="0" max={lot.remaining} step="any"
                              value={ln.lotAllocs[lot.id] ?? ''}
                              onChange={e => patchLine(i, { lotAllocs: { ...ln.lotAllocs, [lot.id]: parseFloat(e.target.value) || 0 } })}
                              className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                            <span className="text-xs text-gray-400 whitespace-nowrap">{canonLabel}</span>
                          </div>
                        </div>
                      ))}
                      <div className={`text-xs font-semibold pt-1 border-t border-indigo-200 ${allocMatches ? 'text-green-600' : 'text-red-500'}`}>
                        Total: {fmtQty(allocTotal)} / {fmtQty(canonQty)} {canonLabel}{allocMatches ? ' ✓' : ' — must match quantity'}
                      </div>
                    </div>
                  )}
                  {!ln.lotsLoading && !multiLot && ln.procLots.length === 1 && (
                    <p className="text-xs text-gray-400">
                      From: {fmtDate(ln.procLots[0].date, i18n.language)}
                      {ln.procLots[0].supplier && ` (${ln.procLots[0].supplier})`}
                      {ln.procLots[0].invoice && ` · ${ln.procLots[0].invoice}`}
                    </p>
                  )}

                  {/* Notes per line */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('common.notes')}</label>
                    <input value={ln.notes} onChange={e => patchLine(i, { notes: e.target.value })}
                      placeholder="Optional" className={inputCls} />
                  </div>
                </div>
              )
            })}

            {/* Add item button */}
            <button type="button" onClick={addLine}
              className="w-full rounded-xl border border-dashed border-green-400 px-4 py-2.5 text-sm font-semibold text-green-600 hover:bg-green-50 transition">
              + Add another item
            </button>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving || hasNoBatches}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('farms.recordDistribution')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
