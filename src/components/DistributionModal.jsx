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

// Shared "Record Distribution" modal — used by FarmDetail and BatchDetail.
// Fetches its own central stock + the farm's active batches; pass initialBatchId
// to preselect a specific batch (e.g. when opened from the Batch page).
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
  const [form, setForm] = useState({
    item_id:  '',
    quantity: '',
    date:     new Date().toISOString().slice(0, 10),
    notes:    '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Central stock (for availability display + deduction)
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('stock').select('*').eq('organization_id', organization.id)
      .then(({ data }) => setStock(data || []))
  }, [organization?.id])

  // Active batches for this farm + distributable item types
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

  // Catalog items whenever type changes
  useEffect(() => {
    if (!typeId) { setCatalogItems([]); return }
    supabase.from('items')
      .select('id, name, unit')
      .eq('item_type_id', typeId)
      .eq('is_active', true)
      .eq('organization_id', organization?.id)
      .order('name')
      .then(({ data }) => {
        const items = data || []
        setCatalogItems(items)
        setForm(p => ({ ...p, item_id: items.length ? items[0].id : '' }))
      })
  }, [typeId])

  function set(f) { return e => setForm(p => ({ ...p, [f]: e.target.value })) }

  const selectedItem  = catalogItems.find(i => i.id === form.item_id)
  const selectedStock = selectedItem
    ? stock.find(s => s.item_name.toLowerCase() === selectedItem.name.toLowerCase())
    : null
  const typeName      = itemTypes.find(it => it.id === typeId)?.name?.toLowerCase() || ''
  const hasNoBatches  = !batchesLoading && activeBatches.length === 0
  const formDisabled  = hasNoBatches

  async function handleSubmit(e) {
    e.preventDefault()
    if (!batchId && activeBatches.length > 0) { setError('Select a batch'); return }
    if (!form.item_id || !selectedItem) { setError('Select a stock item'); return }
    const qty = parseFloat(form.quantity)
    if (!qty || qty <= 0) { setError('Enter a valid quantity'); return }
    if (selectedStock && qty > Number(selectedStock.quantity)) {
      setError(`Only ${Number(selectedStock.quantity).toLocaleString('en-IN')} ${selectedStock.unit} available in stock`)
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
      quantity:        qty,
      unit:            selectedItem.unit,
      date:            form.date,
      notes:           form.notes.trim() || null,
      organization_id: organization?.id,
      created_by_id:   user?.id,
      created_by_name: userName,
    }).select('id').single()

    if (distErr) { setError(distErr.message); setSaving(false); return }

    // 1. Ledger OUT entry
    await ledgerOut({
      itemName:       selectedItem.name,
      itemType:       typeName,
      quantity:       qty,
      unit:           selectedItem.unit,
      referenceType:  'distribution',
      referenceId:    distInserted.id,
      date:           form.date,
      organizationId: organization?.id,
    })

    // 2. Deduct from stock cache
    if (selectedStock) {
      await supabase.from('stock')
        .update({ quantity: Math.max(0, Number(selectedStock.quantity) - qty) })
        .eq('id', selectedStock.id)
        .eq('organization_id', organization?.id)
    }

    // 3. Weighted-average cost scoped to this batch
    const resolvedBatch = activeBatches.find(b => b.id === batchId)
    const avgCpu = await getAverageCostPerUnit(selectedItem.name, {
      batchId:        batchId || undefined,
      startDate:      resolvedBatch?.start_date,
      organizationId: organization?.id,
    })
    await supabase.from('farm_expenses').insert({
      farm_id:         farmId,
      batch_id:        batchId || null,
      distribution_id: distInserted.id,
      item_name:       selectedItem.name,
      item_type:       typeName,
      quantity:        qty,
      unit:            selectedItem.unit,
      cost_per_unit:   avgCpu,
      total_cost:      roundCurrency(qty * avgCpu),
      date:            form.date,
      organization_id: organization?.id,
      created_by_id:   user?.id,
      created_by_name: userName,
    })

    // 4. Increment farm_stock on-hand
    const { data: fsCurrent } = await supabase.from('farm_stock')
      .select('id, quantity_on_hand')
      .eq('farm_id', farmId)
      .eq('organization_id', organization?.id)
      .eq('item_name', selectedItem.name)
      .maybeSingle()
    if (fsCurrent) {
      await supabase.from('farm_stock').update({
        quantity_on_hand: Number(fsCurrent.quantity_on_hand) + qty,
        updated_at:       new Date().toISOString(),
      }).eq('id', fsCurrent.id)
    } else {
      await supabase.from('farm_stock').insert({
        farm_id:          farmId,
        item_name:        selectedItem.name,
        unit:             selectedItem.unit,
        quantity_on_hand: qty,
        organization_id:  organization?.id,
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">{t('farms.recordDistribution')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Batch selector */}
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
              <select value={batchId} onChange={e => setBatchId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('procurement.itemType')} *</label>
                <select value={typeId} onChange={e => setTypeId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                  {itemTypes.map(it => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('distributions.selectItem')} *</label>
                {catalogItems.length === 0 ? (
                  <p className="text-sm text-gray-400 py-1">No items for this type.</p>
                ) : (
                  <select value={form.item_id} onChange={set('item_id')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                    {catalogItems.map(item => {
                      const s = stock.find(st => st.item_name.toLowerCase() === item.name.toLowerCase())
                      const qty = s ? Number(s.quantity).toLocaleString('en-IN') + ' ' + s.unit + ' available' : 'not in stock'
                      return (
                        <option key={item.id} value={item.id}>
                          {item.name} — {qty}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity ({selectedStock?.unit ?? 'units'}) *
                </label>
                <input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={set('quantity')}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.date')} *</label>
                <input required type="date" value={form.date} onChange={set('date')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.notes')}</label>
                <input value={form.notes} onChange={set('notes')} placeholder="Optional"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
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
