import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { ledgerOut, getAverageCostPerUnit } from '../lib/stockLedger'
import { roundCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'

function fmtDate(d, lang = 'en') {
  return formatDate(d, lang)
}

export default function DistributionModal({ farmId, initialBatchId, onClose, onSaved }) {
  const { organization, user } = useAuth()
  const { t, i18n } = useTranslation()
  const [stock,           setStock]           = useState([])
  const [activeBatches,   setActiveBatches]   = useState([])
  const [batchId,         setBatchId]         = useState(initialBatchId || '')
  const [batchesLoading,  setBatchesLoading]  = useState(true)
  const [itemTypes,       setItemTypes]       = useState([])
  const [typeId,          setTypeId]          = useState('')
  const [catalogItems,    setCatalogItems]    = useState([])
  const [canonCount,      setCanonCount]      = useState('') // bags / bottles / units
  const [subCount,        setSubCount]        = useState('') // kg / ml
  const [form, setForm] = useState({
    item_id: '',
    date:    new Date().toISOString().slice(0, 10),
    notes:   '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    if (!organization?.id) return
    supabase.from('stock').select('*').eq('organization_id', organization.id)
      .then(({ data }) => setStock(data || []))
  }, [organization?.id])

  useEffect(() => {
    supabase.from('batches')
      .select('id, start_date, chick_count')
      .eq('farm_id', farmId)
      .eq('organization_id', organization?.id)
      .eq('status', 'active')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        const list = data || []
        setActiveBatches(list)
        if (list.length === 1 && !initialBatchId) setBatchId(list[0].id)
        setBatchesLoading(false)
      })

    supabase.from('item_types')
      .select('id, name')
      .eq('is_distributable', true)
      .eq('organization_id', organization?.id)
      .order('name')
      .then(({ data }) => {
        const types = data || []
        setItemTypes(types)
        if (types.length) setTypeId(types[0].id)
      })
  }, [farmId])

  useEffect(() => {
    if (!typeId) { setCatalogItems([]); return }
    supabase.from('items')
      .select('id, name, unit, kg_per_unit, ml_per_unit')
      .eq('item_type_id', typeId)
      .eq('is_active', true)
      .eq('organization_id', organization?.id)
      .order('name')
      .then(({ data }) => {
        const items = data || []
        setCatalogItems(items)
        setForm(p => ({ ...p, item_id: items.length ? items[0].id : '' }))
        setCanonCount(''); setSubCount('')
      })
  }, [typeId])

  // Reset quantity inputs when item changes
  useEffect(() => {
    setCanonCount(''); setSubCount('')
  }, [form.item_id])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const selectedItem  = catalogItems.find(i => i.id === form.item_id)
  const selectedStock = selectedItem
    ? stock.find(s => s.item_name.toLowerCase() === selectedItem.name.toLowerCase())
    : null
  const typeName = itemTypes.find(it => it.id === typeId)?.name?.toLowerCase() || ''

  const isBag      = selectedItem?.unit === 'Bag'    && Number(selectedItem?.kg_per_unit) > 0
  const isBottle   = selectedItem?.unit === 'Bottle' && Number(selectedItem?.ml_per_unit) > 0
  const hasSubUnit = isBag || isBottle
  const subLabel   = isBag ? 'KG' : isBottle ? 'ml' : ''
  const canonLabel = selectedItem?.unit ?? 'units'
  const factor     = isBag ? Number(selectedItem.kg_per_unit) : isBottle ? Number(selectedItem.ml_per_unit) : 1

  // Canonical qty = full bags/bottles + fractional bags/bottles from sub-unit input
  const canonicalQty = hasSubUnit
    ? (parseFloat(canonCount) || 0) + (parseFloat(subCount) || 0) / factor
    : (parseFloat(canonCount) || 0)

  // Summary line shown below inputs
  const totalSubEquiv  = canonicalQty > 0 ? canonicalQty * factor : null
  const hasNoBatches   = !batchesLoading && activeBatches.length === 0
  const formDisabled   = hasNoBatches

  async function handleSubmit(e) {
    e.preventDefault()
    if (!batchId && activeBatches.length > 0) { setError('Select a batch'); return }
    if (!form.item_id || !selectedItem)        { setError('Select a stock item'); return }

    const availableQty = selectedStock ? Number(selectedStock.quantity) : 0
    if (availableQty <= 0) {
      setError(`${selectedItem.name} is out of stock — add stock before distributing`)
      return
    }
    if (canonicalQty <= 0) { setError('Enter a valid quantity'); return }
    if (canonicalQty > availableQty) {
      const avail = availableQty.toLocaleString('en-IN')
      const availSub = hasSubUnit
        ? ` (${(availableQty * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`
        : ''
      setError(`Only ${avail} ${canonLabel}${availSub} available in stock`)
      return
    }

    setSaving(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'

    const { data: distInserted, error: distErr } = await supabase.from('distributions').insert({
      farm_id:         farmId,
      batch_id:        batchId || null,
      stock_id:        selectedStock?.id || null,
      item_name:       selectedItem.name,
      type:            typeName,
      quantity:        canonicalQty,
      unit:            selectedItem.unit,
      date:            form.date,
      notes:           form.notes.trim() || null,
      organization_id: organization?.id,
      created_by_id:   user?.id,
      created_by_name: userName,
    }).select('id').single()

    if (distErr) { setError(distErr.message); setSaving(false); return }

    await ledgerOut({
      itemName: selectedItem.name, itemType: typeName,
      quantity: canonicalQty, unit: selectedItem.unit,
      referenceType: 'distribution', referenceId: distInserted.id,
      date: form.date, organizationId: organization?.id,
    })

    if (selectedStock) {
      await supabase.from('stock')
        .update({ quantity: Math.max(0, Number(selectedStock.quantity) - canonicalQty) })
        .eq('id', selectedStock.id).eq('organization_id', organization?.id)
    }

    const resolvedBatch = activeBatches.find(b => b.id === batchId)
    const avgCpu = await getAverageCostPerUnit(selectedItem.name, {
      batchId: batchId || undefined, startDate: resolvedBatch?.start_date,
      organizationId: organization?.id,
    })
    await supabase.from('farm_expenses').insert({
      farm_id: farmId, batch_id: batchId || null, distribution_id: distInserted.id,
      item_name: selectedItem.name, item_type: typeName,
      quantity: canonicalQty, unit: selectedItem.unit,
      cost_per_unit: avgCpu, total_cost: roundCurrency(canonicalQty * avgCpu),
      date: form.date, organization_id: organization?.id,
      created_by_id: user?.id, created_by_name: userName,
    })

    const { data: fsCurrent } = await supabase.from('farm_stock')
      .select('id, quantity_on_hand').eq('farm_id', farmId)
      .eq('organization_id', organization?.id).eq('item_name', selectedItem.name).maybeSingle()
    if (fsCurrent) {
      await supabase.from('farm_stock')
        .update({ quantity_on_hand: Number(fsCurrent.quantity_on_hand) + canonicalQty, updated_at: new Date().toISOString() })
        .eq('id', fsCurrent.id)
    } else {
      await supabase.from('farm_stock').insert({
        farm_id: farmId, item_name: selectedItem.name,
        unit: selectedItem.unit, quantity_on_hand: canonicalQty, organization_id: organization?.id,
      })
    }

    onSaved()
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
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

          <div className={formDisabled ? 'opacity-40 pointer-events-none' : ''}>
            <div className="space-y-4">

              {/* Item type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('procurement.itemType')} *</label>
                <select value={typeId} onChange={e => setTypeId(e.target.value)} className={inputCls + ' bg-white'}>
                  {itemTypes.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </div>

              {/* Item */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('distributions.selectItem')} *</label>
                {catalogItems.length === 0 ? (
                  <p className="text-sm text-gray-400 py-1">No items for this type.</p>
                ) : (
                  <>
                    <select value={form.item_id} onChange={set('item_id')} className={inputCls + ' bg-white'}>
                      {catalogItems.map(item => {
                        const s = stock.find(st => st.item_name.toLowerCase() === item.name.toLowerCase())
                        const availQty = s ? Number(s.quantity) : 0
                        const label = availQty > 0 ? `${availQty.toLocaleString('en-IN')} ${s.unit} available` : 'out of stock'
                        return <option key={item.id} value={item.id}>{item.name} — {label}</option>
                      })}
                    </select>
                    {selectedItem && (!selectedStock || Number(selectedStock.quantity) <= 0) && (
                      <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                        <span className="text-red-500 text-sm">✕</span>
                        <p className="text-xs font-medium text-red-700">
                          {selectedItem.name} is out of stock — add stock before distributing
                        </p>
                      </div>
                    )}
                    {selectedItem && selectedStock && Number(selectedStock.quantity) > 0 && (
                      <p className="text-xs mt-1.5 font-medium text-green-600">
                        ✓ {Number(selectedStock.quantity).toLocaleString('en-IN')} {selectedStock.unit} available
                        {hasSubUnit && ` (${(Number(selectedStock.quantity) * factor).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${subLabel})`}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                {hasSubUnit ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="relative">
                          <input
                            type="number" min="0" step="1"
                            value={canonCount} onChange={e => setCanonCount(e.target.value)}
                            placeholder="0" className={inputCls + ' pr-12'}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                            {canonLabel}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="relative">
                          <input
                            type="number" min="0" step="any"
                            value={subCount} onChange={e => setSubCount(e.target.value)}
                            placeholder="0" className={inputCls + ' pr-10'}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                            {subLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                    {canonicalQty > 0 && (
                      <p className="text-xs mt-1.5 text-gray-500 font-medium">
                        Total = {canonicalQty % 1 === 0 ? canonicalQty : canonicalQty.toFixed(3)} {canonLabel}
                        {' '}({totalSubEquiv?.toLocaleString('en-IN', { maximumFractionDigits: 1 })} {subLabel})
                      </p>
                    )}
                  </>
                ) : (
                  <div className="relative">
                    <input
                      required type="number" min="0.01" step="any"
                      value={canonCount} onChange={e => setCanonCount(e.target.value)}
                      placeholder={`e.g. 5 ${canonLabel}`} className={inputCls + ' pr-16'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 pointer-events-none">
                      {canonLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
                <input required type="date" value={form.date} onChange={set('date')} className={inputCls} />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
                <input value={form.notes} onChange={set('notes')} placeholder="Optional" className={inputCls} />
              </div>

            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition">
              {saving ? t('common.loading') : t('farms.recordDistribution')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
